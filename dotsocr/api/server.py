import os
import io
import sys
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import Optional
from pathlib import Path
from fastapi.concurrency import run_in_threadpool
import json
import hashlib
import threading

# Ensure local package is preferred over any installed one
ROOT_DIR = str(Path(__file__).resolve().parents[1])
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from dots_ocr.parser import DotsOCRParser

app = FastAPI(title="dots.ocr API", version="1.0")

# Environment configuration
DEFAULT_MODE = os.getenv("DOTS_MODE", "hf").lower()  # hf | vllm | online
VLLM_IP = os.getenv("DOTS_VLLM_IP", "localhost")
VLLM_PORT = int(os.getenv("DOTS_VLLM_PORT", "8000"))
MODEL_NAME = os.getenv("DOTS_MODEL_NAME", "model")
OUTPUT_DIR = os.getenv("DOTS_OUTPUT_DIR", "./output_api")
MAX_COMPLETION_TOKENS = int(os.getenv("DOTS_MAX_COMPLETION_TOKENS", "16384"))
TEMPERATURE = float(os.getenv("DOTS_TEMPERATURE", "0.1"))
TOP_P = float(os.getenv("DOTS_TOP_P", "1.0"))
NUM_THREAD = int(os.getenv("DOTS_NUM_THREAD", "8"))
DPI = int(os.getenv("DOTS_DPI", "200"))
ATTN_IMPL = os.getenv("DOTS_ATTN_IMPL", "flash_attention_2")

# Online inference (StepFun) optional envs
ONLINE_VENDOR = os.getenv("DOTS_ONLINE_VENDOR")
ONLINE_MODEL = os.getenv("DOTS_ONLINE_MODEL")
ONLINE_API_KEY = os.getenv("DOTS_ONLINE_API_KEY")
ONLINE_BASE_URL = os.getenv("DOTS_ONLINE_BASE_URL")
ONLINE_SYSTEM_PROMPT = os.getenv("DOTS_ONLINE_SYSTEM_PROMPT")

WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights" / "DotsOCR"
TMP_DIR = Path(__file__).resolve().parent / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
USER_MD_DIR = Path(__file__).resolve().parent / "user_md"
USER_MD_DIR.mkdir(parents=True, exist_ok=True)

_parser_singleton = None
_current_mode = None
_inflight_locks = {}
_inflight_mutex = threading.Lock()


def _norm_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return " ".join(str(s).strip().split())

def _sha1_of_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def _make_cache_key(file_path: Path, prompt: str, user_hint: Optional[str], mode: str, fitz_preprocess: bool) -> str:
    base = _sha1_of_file(file_path)
    meta = f"|m={_norm_text(mode)}|p={_norm_text(prompt)}|u={_norm_text(user_hint)}|f={int(bool(fitz_preprocess))}"
    h = hashlib.sha1(meta.encode("utf-8", errors="ignore")).hexdigest()[:8]
    return f"{base}{h}"


def _weights_ready() -> bool:
    return WEIGHTS_DIR.exists() and any(WEIGHTS_DIR.iterdir())


def _create_parser(mode: str) -> DotsOCRParser:
    mode = (mode or DEFAULT_MODE).lower()
    use_hf = mode == "hf"
    # 构建兼容参数集
    kwargs = dict(
        ip=VLLM_IP,
        port=VLLM_PORT,
        model_name=MODEL_NAME,
        temperature=TEMPERATURE,
        top_p=TOP_P,
        max_completion_tokens=MAX_COMPLETION_TOKENS,
        num_thread=NUM_THREAD,
        dpi=DPI,
        output_dir=OUTPUT_DIR,
        use_hf=use_hf,
    )
    if mode == "online":
        kwargs.update(
            use_online=True,
            online_vendor=ONLINE_VENDOR,
            online_model=ONLINE_MODEL,
            online_api_key=ONLINE_API_KEY,
            online_base_url=ONLINE_BASE_URL,
            online_system_prompt=ONLINE_SYSTEM_PROMPT,
        )
    # hf 模式需要本地权重
    if use_hf and not _weights_ready():
        raise HTTPException(status_code=503, detail="HF weights not found. Please run: python tools/download_model.py")
    # 先尝试带 online 关键字（若存在），若报未知关键字则移除后重试
    try:
        parser = DotsOCRParser(**kwargs)
    except TypeError as e:
        msg = str(e)
        if "unexpected keyword argument 'use_online'" in msg or "unexpected keyword argument 'online_" in msg:
            for k in [
                "use_online",
                "online_vendor",
                "online_model",
                "online_api_key",
                "online_base_url",
                "online_system_prompt",
            ]:
                kwargs.pop(k, None)
            parser = DotsOCRParser(**kwargs)
        else:
            raise
    return parser


def get_parser(mode: Optional[str] = None) -> DotsOCRParser:
    global _parser_singleton, _current_mode
    desired = (mode or DEFAULT_MODE).lower()
    if _parser_singleton is None or _current_mode != desired:
        _parser_singleton = _create_parser(desired)
        _current_mode = desired
    return _parser_singleton


def _torch_env_info():
    info = {
        "torch_cuda_available": False,
        "torch_device_count": 0,
        "cuda_device_names": [],
        "cuda_visible_devices": os.getenv("CUDA_VISIBLE_DEVICES"),
        "attn_impl": ATTN_IMPL,
    }
    try:
        import torch  # type: ignore
        info["torch_cuda_available"] = bool(torch.cuda.is_available())
        info["torch_device_count"] = int(torch.cuda.device_count())
        names = []
        for i in range(info["torch_device_count"]):
            try:
                names.append(torch.cuda.get_device_name(i))
            except Exception:
                names.append(f"cuda:{i}")
        info["cuda_device_names"] = names
    except Exception:
        pass
    return info


@app.get("/health")
def health(mode: Optional[str] = Query(default=None)):
    m = (mode or DEFAULT_MODE).lower()
    torch_info = _torch_env_info() if m == "hf" else {}
    return {
        "status": "ok",
        "mode": m,
        "model_name": MODEL_NAME,
        "weights_present": _weights_ready(),
        "output_dir": str(Path(OUTPUT_DIR).resolve()),
        "ip": VLLM_IP,
        "port": VLLM_PORT,
        **torch_info,
    }


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    prompt: str = Query(default="prompt_layout_all_en"),
    fitz_preprocess: bool = Query(default=True),
    mode: Optional[str] = Query(default=None),
    user_hint: Optional[str] = Query(default=None, description="附加到基础提示词后，用于用户自定义约束"),
):
    try:
        parser = get_parser(mode)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize parser: {e}")

    # Save upload to temp file
    suffix = Path(file.filename).suffix or ".bin"
    tmp_path = TMP_DIR / f"upload_{os.getpid()}_{os.urandom(4).hex()}{suffix}"
    content = await file.read()
    with open(tmp_path, "wb") as f:
        f.write(content)

    # 永久缓存：以文件内容+配置为键，缓存 JSON 结果到磁盘
    cache_key = _make_cache_key(tmp_path, prompt, user_hint, (mode or DEFAULT_MODE).lower(), fitz_preprocess)
    cache_path = CACHE_DIR / f"{cache_key}.json"
    if cache_path.exists():
        try:
            data = cache_path.read_text(encoding="utf-8")
            return JSONResponse(content=json.loads(data))
        except Exception:
            pass

    # 单飞：相同 Key 并发只允许一个请求执行
    with _inflight_mutex:
        ev = _inflight_locks.get(cache_key)
        if ev is None:
            ev = threading.Event()
            _inflight_locks[cache_key] = ev
            leader = True
        else:
            leader = False

    if not leader:
        # 等待 leader 完成或超时 30 分钟
        ev.wait(timeout=1800)
        if cache_path.exists():
            try:
                data = cache_path.read_text(encoding="utf-8")
                return JSONResponse(content=json.loads(data))
            except Exception:
                pass
        # 未命中则降级继续执行

    try:
        results = await run_in_threadpool(
            parser.parse_file,
            str(tmp_path),
            prompt_mode=prompt,
            fitz_preprocess=fitz_preprocess,
            user_hint=user_hint,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    if not results:
        raise HTTPException(status_code=500, detail="No result returned by parser")

    res0 = results[0]
    md_text = None
    md_path = res0.get("md_content_path")
    if md_path and os.path.exists(md_path):
        try:
            with open(md_path, "r", encoding="utf-8") as rf:
                md_text = rf.read()
        except Exception:
            md_text = None

    payload = {
        "file_path": res0.get("file_path"),
        "page_no": res0.get("page_no"),
        "input_height": res0.get("input_height"),
        "input_width": res0.get("input_width"),
        "layout_info_path": res0.get("layout_info_path"),
        "layout_image_path": res0.get("layout_image_path"),
        "md_path": md_path,
        "md": md_text,
        "filtered": res0.get("filtered", False),
        "output_dir": str(Path(OUTPUT_DIR).resolve()),
    }
    # 写入永久缓存
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        import json as _json
        cache_path.write_text(_json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    # 通知等待者
    with _inflight_mutex:
        ev = _inflight_locks.pop(cache_key, None)
        if ev:
            try:
                ev.set()
            except Exception:
                pass
    return JSONResponse(content=payload)
@app.post("/save_markdown")
async def save_markdown(payload: dict):
    try:
        key = str(payload.get("key") or "").strip()
        content = str(payload.get("content") or "")
        if not key:
            raise HTTPException(status_code=400, detail="missing key")
        target = USER_MD_DIR / f"{key}.md"
        target.write_text(content, encoding="utf-8")
        return {"status": "ok", "path": str(target)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"save failed: {e}")


@app.get("/load_user_markdown")
async def load_user_markdown(key: str = Query(...)):
    try:
        key = (key or "").strip()
        target = USER_MD_DIR / f"{key}.md"
        if not target.exists():
            return PlainTextResponse(content="", media_type="text/plain; charset=utf-8")
        txt = target.read_text(encoding="utf-8")
        return PlainTextResponse(content=txt, media_type="text/plain; charset=utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"load failed: {e}")


@app.get("/markdown")
async def get_markdown(path: str = Query(..., description="Absolute or relative path to markdown file on server")):
    target = Path(path)
    if not target.is_absolute():
        target = Path.cwd() / target
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"Markdown file not found: {target}")
    try:
        txt = target.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read markdown: {e}")
    return PlainTextResponse(content=txt, media_type="text/plain; charset=utf-8")


if __name__ == "__main__":
    # 直接传入 app 避免错误的模块路径解析
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=False)