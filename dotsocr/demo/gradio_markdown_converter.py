import os
from pathlib import Path
import mimetypes
import requests
import gradio as gr
import shutil
import subprocess
import hashlib
import threading

# 可选：DOCX -> Markdown 直转（若未安装 mammoth 将自动忽略并回退到 PDF 流程）
try:
    import mammoth  # type: ignore
except Exception:
    mammoth = None

DEFAULT_API_BASE = os.environ.get("DOTS_API_BASE", "http://127.0.0.1:8080")
DEFAULT_PROMPT = os.environ.get("DOTS_PROMPT", "prompt_layout_all_en")

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
TEXT_EXTS = {".txt", ".md", ".markdown"}
OFFICE_EXTS = {".doc", ".docx", ".ppt", ".pptx"}

TMP_BASE = Path(os.environ.get("DOTS_TMP", "./dotsocr/api/tmp"))
TMP_BASE.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR = Path("./output/parsed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 转换并发控制：保证同一时间只跑一个任务（兼容旧版 gradio 无 concurrency_count 参数）
_convert_lock = threading.Lock()

# 计算文件内容的 SHA1 用于缓存键
def _sha1_of_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

# 读取/写入缓存
_def_cache = {}

def _cache_get(key: str) -> str | None:
    # 内存
    if key in _def_cache:
        return _def_cache[key]
    # 磁盘
    cand = OUTPUT_DIR / f"{key}.md"
    if cand.exists():
        try:
            txt = cand.read_text(encoding="utf-8", errors="ignore")
            _def_cache[key] = txt
            return txt
        except Exception:
            return None
    return None


def _cache_set(key: str, md_text: str, original_name: str | None = None) -> None:
    _def_cache[key] = md_text
    path = OUTPUT_DIR / f"{key}.md"
    try:
        path.write_text(md_text, encoding="utf-8")
    except Exception:
        pass
    # 额外按原文件名保存一份，便于人工查看（不覆盖已存在）
    if original_name:
        safe_name = Path(original_name).stem + ".md"
        alt = OUTPUT_DIR / safe_name
        if not alt.exists():
            try:
                alt.write_text(md_text, encoding="utf-8")
            except Exception:
                pass


# 纯文本进度描述
def _prog_text(pct: int, msg: str) -> str:
    pct = max(0, min(100, int(pct)))
    return f"{pct}% · {msg}"

# 自适应读取超时：支持通过环境变量覆盖，否则按文件大小和类型估算
def _read_timeout_for(file_path: Path, ext: str) -> float:
    env = os.environ.get("DOTS_READ_TIMEOUT_SECS")
    if env:
        try:
            v = float(env)
            return max(60.0, v)
        except Exception:
            pass
    try:
        size_mb = max(1.0, file_path.stat().st_size / (1024 * 1024))
    except Exception:
        size_mb = 50.0
    # PDF/图片通常慢：基准600秒 + 每MB 25秒，范围[600, 3600]
    if ext == ".pdf" or ext in IMAGE_EXTS:
        rt = 600 + size_mb * 25
        return float(min(max(rt, 600), 3600))
    # 其他类型（基本不会用到 post 长时阻塞）：给出保守上限
    return 600.0


# 后端健康检查：返回 Markdown 文本
def check_health(api_base: str) -> str:
    base = (api_base or DEFAULT_API_BASE).rstrip("/")
    url = f"{base}/health"
    try:
        r = requests.get(url, timeout=(5, 5))
        if not r.ok:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
        d = r.json()
        lines = []
        mode = d.get("mode")
        model_name = d.get("model_name") or "(unknown)"
        weights_present = d.get("weights_present")
        lines.append(f"模式：{mode} · 模型：{model_name} · 权重：{'已就绪' if weights_present else '缺失'}")
        if mode == "hf":
            gpu_ok = d.get("torch_cuda_available")
            dev_cnt = d.get("torch_device_count")
            dev_names = d.get("cuda_device_names") or []
            cvd = d.get("cuda_visible_devices")
            attn_impl = d.get("attn_impl")
            gpu_line = f"GPU：{'可用' if gpu_ok else '不可用'} · 数量：{dev_cnt}"
            if dev_names:
                gpu_line += f" · 设备：{', '.join(dev_names)}"
            lines.append(gpu_line)
            if cvd is not None:
                lines.append(f"CUDA_VISIBLE_DEVICES：{cvd}")
            if attn_impl:
                lines.append(f"注意力实现：{attn_impl}")
            lines.append("提示：若 GPU 不可用，则会使用 CPU 推理，速度会明显变慢。")
        else:
            ip = d.get("ip")
            port = d.get("port")
            lines.append(f"后端服务：{ip}:{port}")
        return "\n\n".join(lines)
    except Exception as e:
        return f"健康检查失败：{e}\n请确认 API 已启动：{url}"


# 主转换逻辑：返回 (进度文本, markdown)
def convert_to_markdown(file_obj, api_base: str, prompt: str):
    # 未选择文件
    if not file_obj:
        yield _prog_text(0, "未选择文件"), ""
        return

    # 保证单任务串行执行；若正在运行，先提示排队再等待
    acquired = _convert_lock.acquire(blocking=False)
    if not acquired:
        yield _prog_text(0, "排队中，等待前一任务完成…"), ""
        _convert_lock.acquire()
        acquired = True

    try:
        file_path = Path(getattr(file_obj, "name", file_obj))
        ext = file_path.suffix.lower()

        # 缓存命中：直接返回
        try:
            key = _sha1_of_file(file_path)
            cached = _cache_get(key)
            if cached:
                yield _prog_text(100, "命中缓存，直接展示"), cached
                return
        except Exception:
            key = ""

        # 直接读取文本/Markdown
        if ext in TEXT_EXTS:
            try:
                yield _prog_text(20, "读取文本…"), ""
                md_text = file_path.read_text(encoding="utf-8", errors="ignore")
                if key:
                    _cache_set(key, md_text, file_path.name)
                yield _prog_text(100, "完成"), md_text
            except Exception as e:
                yield _prog_text(100, "读取失败"), f"读取文本失败: {e}"
            return

        # DOCX 直转 Markdown（若安装 mammoth）
        if ext == ".docx" and mammoth is not None:
            try:
                yield _prog_text(10, "DOCX -> Markdown…"), ""
                with open(file_path, "rb") as f:
                    result = mammoth.convert_to_markdown(f)
                md_text = result.value  # type: ignore
                if key:
                    _cache_set(key, md_text, file_path.name)
                yield _prog_text(100, "完成"), md_text
                return
            except Exception as e:
                yield _prog_text(25, "DOCX 直转失败，回退 PDF 流程"), f"DOCX 直转失败：{e}\n将尝试通过 PDF 流程转换。"
                # 继续走 Office->PDF 流程

        # Office 文档（doc/ppt/pptx 或 docx直转失败）→ 先转 PDF
        if ext in OFFICE_EXTS:
            exe = shutil.which("soffice") or shutil.which("libreoffice")
            if not exe:
                yield _prog_text(100, "失败"), "未检测到 LibreOffice(soffice)，无法将 Office 文档转换为 PDF。请安装 libreoffice 或改用 PDF。"
                return
            try:
                yield _prog_text(30, "Office 转 PDF…"), ""
                out_dir = TMP_BASE / "office2pdf"
                out_dir.mkdir(parents=True, exist_ok=True)
                cmd = [exe, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(file_path)]
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr or proc.stdout)
                pdf_path = out_dir / (file_path.stem + ".pdf")
                if not pdf_path.exists():
                    # 兼容不同命名
                    cands = list(out_dir.glob(f"{file_path.stem}*.pdf"))
                    if cands:
                        pdf_path = cands[0]
                if not pdf_path.exists():
                    raise RuntimeError("未找到转换后的 PDF 文件")
                file_path = pdf_path
                ext = ".pdf"
            except Exception as e:
                yield _prog_text(100, "失败"), f"Office 转 PDF 失败：{e}"
                return

        # 走后端 API：PDF 或图片
        if ext == ".pdf" or ext in IMAGE_EXTS:
            api_base = (api_base or DEFAULT_API_BASE).rstrip("/")
            predict_url = f"{api_base}/predict"
            md_url = f"{api_base}/markdown"
            params = {
                "prompt": prompt or DEFAULT_PROMPT,
                "fitz_preprocess": "true" if ext == ".pdf" else "false",
            }
            ctype = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            try:
                read_timeout = _read_timeout_for(file_path, ext)
                yield _prog_text(40, f"正在上传与转换…（最长等待约 {int(read_timeout)} 秒）"), ""
                with open(file_path, "rb") as f:
                    files = {"file": (file_path.name, f, ctype)}
                    # 10s 连接超时，自适应读取超时（避免后端仍在处理时过早超时）
                    resp = requests.post(predict_url, params=params, files=files, timeout=(10, read_timeout))
                if not resp.ok:
                    raise RuntimeError(f"后端返回非200：{resp.status_code} {resp.text[:200]}")
                payload = resp.json()
                md_text = payload.get("md")
                md_path = payload.get("md_path")
                if not md_text and md_path:
                    yield _prog_text(80, "获取 Markdown 文本…"), ""
                    r2 = requests.get(md_url, params={"path": md_path}, timeout=(10, 60))
                    if r2.ok:
                        md_text = r2.text
                if not md_text:
                    if key:
                        _cache_set(key, "", file_path.name)
                    md_text = f"未返回 Markdown 内容。返回键：{list(payload.keys())}"
                if key:
                    _cache_set(key, md_text, file_path.name)
                yield _prog_text(100, "完成"), md_text
                return
            except requests.exceptions.Timeout:
                hint = (
                    f"调用 API 超时，但后端可能仍在处理中（可在终端查看进度）。\n"
                    f"建议增大超时：设置环境变量 DOTS_READ_TIMEOUT_SECS（当前估算 {int(_read_timeout_for(file_path, ext))} 秒）"
                )
                yield _prog_text(100, "超时"), hint
                return
            except Exception as e:
                yield _prog_text(100, "失败"), f"调用 API 失败: {e}\n请确认 API 已启动并可访问：{predict_url}"
                return

        # 其他类型不支持
        yield _prog_text(100, "失败"), f"暂不支持该文件类型：{ext}。请上传 PDF、图片、Markdown、文本或 Office 文档。"
    finally:
        if acquired:
            _convert_lock.release()


def build_ui():
    with gr.Blocks(title="文档转 Markdown") as demo:
        # 顶部横排：文件 / API / Prompt
        with gr.Row():
            in_file = gr.File(label="选择文件", file_count="single", type="filepath")
            api_base = gr.Textbox(value=DEFAULT_API_BASE, label="API Base URL")
            prompt = gr.Textbox(value=DEFAULT_PROMPT, label="Prompt")

        # 模型/设备信息（自动刷新）
        health_md = gr.Markdown(value="未检测到后端信息。", label="模型/设备")

        # 纯文本进度
        progress_text = gr.Markdown(value=_prog_text(0, "就绪"), label="进度")

        # Markdown 展示区
        md_out = gr.Markdown(label="输出 Markdown")

        # 自动触发：页面加载与 API Base 变更时刷新健康信息
        demo.load(fn=check_health, inputs=[api_base], outputs=[health_md])
        api_base.change(fn=check_health, inputs=[api_base], outputs=[health_md])

        # 自动触发：选择文件即开始
        in_file.change(convert_to_markdown, inputs=[in_file, api_base, prompt], outputs=[progress_text, md_out])
    return demo


if __name__ == "__main__":
    ui = build_ui()
    # 旧版 gradio 不支持 concurrency_count 参数，这里仅启用队列，串行由内部锁控制
    ui.queue()
    ui.launch(server_name="127.0.0.1", server_port=int(os.environ.get("GRADIO_PORT", 7860)))