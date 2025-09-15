from docavatardev.mindmap import build_mindmap_svg, build_markmap_html, build_markmap_html_with_data
from urllib.parse import quote_plus
import os
from pathlib import Path
import mimetypes
import requests
import gradio as gr
import shutil
import subprocess
import hashlib
import re
import json
from collections import Counter
import threading
import time
from typing import Optional
from fastapi.responses import JSONResponse
from fastapi import Request

# 可选：DOCX -> Markdown 直转（若未安装 mammoth 将自动忽略并回退到 PDF 流程）
try:
    import mammoth  # type: ignore
except Exception:
    mammoth = None

# 可选：用于 PDF 页数统计（仅用于界面进度提示）
try:
    import fitz  # type: ignore  # PyMuPDF
except Exception:
    fitz = None

DEFAULT_API_BASE = os.environ.get("DOTS_API_BASE", "http://127.0.0.1:8080")
DEFAULT_PROMPT = os.environ.get("DOTS_PROMPT", "prompt_layout_all_en")

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
TEXT_EXTS = {".txt", ".md", ".markdown"}
OFFICE_EXTS = {".doc", ".docx", ".ppt", ".pptx"}

TMP_BASE = Path(os.environ.get("DOTS_TMP", "./dotsocr/api/tmp"))
TMP_BASE.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR = Path("./output/parsed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# UI 状态目录：保存最近一次会话路径等状态
STATE_DIR = Path(__file__).resolve().parent / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)
LAST_SESSION_FILE = STATE_DIR / "last_session.txt"

# 项目根与后端缓存/输出目录（用于清理）
ROOT_DIR = Path(__file__).resolve().parent.parent
API_CACHE_DIR = ROOT_DIR / "dotsocr" / "api" / "cache"
API_USER_MD_DIR = ROOT_DIR / "dotsocr" / "api" / "user_md"
API_OUTPUT_DIR = ROOT_DIR / "output_api"

# 缓存版本号：变更后将强制绕过旧的本地磁盘缓存
UI_CACHE_VERSION = "hfold-v3-20250906"

# 转换并发控制：保证同一时间只跑一个任务（兼容旧版 gradio 无 concurrency_count 参数）
_convert_lock = threading.Lock()

# ====== Automindmap 集成（懒加载子应用） ======
AUTOMINDMAP_PORT = int(os.environ.get("AUTOMINDMAP_PORT", "5173"))
AUTOMINDMAP_HOST = os.environ.get("AUTOMINDMAP_HOST", "127.0.0.1")
_am_proc: Optional[subprocess.Popen] = None

def _url_alive(url: str, timeout: float = 2.0) -> bool:
    try:
        r = requests.get(url, timeout=(1, timeout))
        return r.ok
    except Exception:
        return False

def _ensure_automindmap_running() -> str | None:
    """确保 automindmap 子应用已启动，返回其 URL（http://host:port）。
    尝试顺序：已在端口运行 → 以包运行 → 以 app.py/main.py/__main__ 启动 → start.sh。
    """
    global _am_proc
    base_url = f"http://{AUTOMINDMAP_HOST}:{AUTOMINDMAP_PORT}"
    if _url_alive(base_url):
        return base_url
    # 若已有进程但未就绪，等待片刻
    if _am_proc is not None and _am_proc.poll() is None:
        deadline = time.time() + 20
        while time.time() < deadline:
            if _url_alive(base_url):
                return base_url
            time.sleep(0.5)
        return None
    # 构造候选入口（优先 npm start）
    root = Path(__file__).resolve().parent / "automindmap"
    env = os.environ.copy()
    env.setdefault("HOST", AUTOMINDMAP_HOST)
    env.setdefault("PORT", str(AUTOMINDMAP_PORT))
    # 尝试读取 package.json 端口配置
    pkg = root / "package.json"
    if pkg.exists():
        try:
            pkg_json = json.loads(pkg.read_text(encoding="utf-8"))
            scripts = (pkg_json.get("scripts") or {})
            start_cmd = scripts.get("start") or ""
            # 粗略提取 --port N
            m = re.search(r"--port\s+(\d+)", start_cmd)
            if m:
                env["PORT"] = m.group(1)
        except Exception:
            pass

    # 1) npm start
    if shutil.which("npm"):
        try:
            _am_proc = subprocess.Popen(["npm", "start"], cwd=str(root), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
            deadline = time.time() + 40
            while time.time() < deadline:
                if _url_alive(base_url):
                    return base_url
                time.sleep(0.5)
        except Exception:
            pass

    # 2) 兜底：start.sh / python 脚本
    candidates: list[list[str]] = []
    sh = root / "start.sh"
    if sh.exists():
        candidates.append(["bash", str(sh)])
    for name in ("app.py", "main.py", "server.py"):
        p = root / name
        if p.exists():
            candidates.append(["python", str(p)])
    for cmd in candidates:
        try:
            _am_proc = subprocess.Popen(cmd, cwd=str(root), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
            deadline = time.time() + 40
            while time.time() < deadline:
                if _url_alive(base_url):
                    return base_url
                time.sleep(0.5)
        except Exception:
            continue
    return None

# 选择可用的 automindmap 基址（支持 5173/5079/环境端口）
def _detect_automindmap_base() -> str:
    host = os.environ.get("AUTOMINDMAP_PUBLIC_HOST", AUTOMINDMAP_HOST)
    ports: list[str] = []
    env_port = os.environ.get("AUTOMINDMAP_PORT")
    if env_port:
        ports.append(env_port)
    # 优先常见端口
    if "5173" not in ports:
        ports.append("5173")
    if "5079" not in ports:
        ports.append("5079")
    for p in ports:
        base = f"http://{host}:{p}"
        if _url_alive(base):
            return base
    # 默认回退到第一个候选
    return f"http://{host}:{ports[0] if ports else AUTOMINDMAP_PORT}"

# 计算文件内容的 SHA1 用于缓存键
def _sha1_of_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def _norm_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return " ".join(str(s).strip().split())

def _make_cache_key(file_path: Path, prompt: str, user_hint: str, mode: str) -> str:
    # 以文件内容哈希为主，附加模式/基础提示词/用户提示词，保证不同设置不串用缓存
    base = _sha1_of_file(file_path)
    meta = f"|m={_norm_text(mode)}|p={_norm_text(prompt)}|u={_norm_text(user_hint)}|v={UI_CACHE_VERSION}"
    h = hashlib.sha1()
    h.update(meta.encode("utf-8", errors="ignore"))
    return f"{base}{h.hexdigest()[:8]}"

# ========== 跨页清洗工具 ==========
_SENT_END = "。！？!?.;：:"

def _norm_line(s: str) -> str:
    s = s.strip()
    # 去掉 markdown 装饰符与多余空白
    s = re.sub(r"[`*_>#\-]+", " ", s)
    # 将图片语法统一为占位符
    s = re.sub(r"!\[[^\]]*\]\([^\)]*\)", "<img>", s)
    # 仅保留中英文与数字，统一小写；数字归一化避免页码影响
    s = re.sub(r"\d+", "#", s)
    s = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff#]+", "", s)
    return s.lower()

def _head_tail_lines(md: str, k: int = 3):
    lines = [ln for ln in md.splitlines() if ln.strip()]
    head = lines[:k]
    tail = lines[-k:] if len(lines) >= k else lines
    return head, tail

def _remove_repeated_headers_footers(pages: list[str], ratio: float = 0.6, k: int = 3) -> list[str]:
    n = max(1, len(pages))
    cnt = Counter()
    loc = {}
    for i, md in enumerate(pages):
        head, tail = _head_tail_lines(md, k=k)
        for tag, seq in (("h", head), ("t", tail)):
            for raw in seq:
                norm = _norm_line(raw)
                if not norm:
                    continue
                key = (tag, norm)
                cnt[key] += 1
                loc.setdefault(key, []).append((i, raw))
    thr = max(2, int(n * ratio + 0.5))
    repeated = {key for key, c in cnt.items() if c >= thr}

    cleaned = []
    for i, md in enumerate(pages):
        lines = md.splitlines()
        # 只在页头/页尾窗口内剔除
        head_idx = set(range(min(k, len(lines))))
        tail_idx = set(range(max(0, len(lines) - k), len(lines)))
        keep = []
        for j, ln in enumerate(lines):
            tag = "h" if j in head_idx else ("t" if j in tail_idx else None)
            if tag is None:
                keep.append(ln)
                continue
            norm = _norm_line(ln)
            if (tag, norm) in repeated:
                continue  # drop as header/footer
            keep.append(ln)
        cleaned.append("\n".join(keep))
    return cleaned

def _should_join(a: str, b: str) -> bool:
    a = a.rstrip()
    b = b.lstrip()
    if not a or not b:
        return False
    if a.endswith("  "):
        return False
    if a[-1] in _SENT_END:
        return False
    if b.startswith(("#", "|", "- ", "* ", "!", "`")):
        return False
    return True

def _join_cross_pages(pages: list[str]) -> list[str]:
    if not pages:
        return pages
    res = [pages[0]]
    for i in range(1, len(pages)):
        prev = res[-1].splitlines()
        curr = pages[i].splitlines()
        # 找上一页最后一行与下一页第一行（忽略空白）
        while prev and not prev[-1].strip():
            prev.pop()
        k = 0
        while k < len(curr) and not curr[k].strip():
            k += 1
        if prev and k < len(curr) and _should_join(prev[-1], curr[k]):
            last = prev.pop()
            if last.endswith("-") and not last.endswith("--"):
                merged_line = last[:-1] + curr[k].lstrip()
            else:
                merged_line = last + " " + curr[k].lstrip()
            prev.append(merged_line)
            curr = curr[k+1:]
        res[-1] = "\n".join(prev)
        res.append("\n".join(curr))
    return res

def _normalize_headings(md: str, max_level: int = 5) -> str:
    lines = md.splitlines()
    out: list[str] = []
    prev_level = 0
    for ln in lines:
        s = ln.lstrip()
        m = re.match(r"^(#{1,6})\s+(.+)$", s)
        if not m:
            out.append(ln)
            continue
        raw_level = len(m.group(1))
        title = m.group(2).strip()
        # 只做"下调"与"平滑"，不做提升：防止正文被放大为上层标题
        level = min(max_level, raw_level)
        if prev_level and level > prev_level + 1:
            level = prev_level + 1
        out.append("#" * level + " " + title)
        prev_level = level
    return "\n".join(out)


def _rebase_headings(md: str, target_min: int = 1, max_level: int = 6) -> str:
    """将全文的标题级别重新基线化：
    - 找到文中出现的最小级别（例如全是以 ### 开头），统一下调至 H1；
    - 只做等量平移，不改变相对层级；
    - 结果级别不会超过 max_level。
    """
    lines = md.splitlines()
    levels = []
    for ln in lines:
        s = ln.lstrip()
        m = re.match(r"^(#{1,6})\s+(.+)$", s)
        if m:
            levels.append(len(m.group(1)))
    if not levels:
        return md
    min_level = min(levels)
    shift = max(0, min_level - target_min)
    if shift <= 0:
        return md
    out = []
    for ln in lines:
        s = ln.lstrip()
        m = re.match(r"^(#{1,6})\s+(.+)$", s)
        if not m:
            out.append(ln)
            continue
        raw_level = len(m.group(1))
        title = m.group(2).strip()
        level = max(1, min(max_level, raw_level - shift))
        out.append("#" * level + " " + title)
    return "\n".join(out)

def _fold_by_headings(md: str, max_level: int = 5) -> str:
    lines = md.splitlines()
    out = []
    stack = []  # 打开的 heading 级别
    def close_to(level: int):
        while stack and stack[-1] >= level:
            out.append("\n</details>")
            stack.pop()
    i = 0
    while i < len(lines):
        ln = lines[i]
        s = ln.lstrip()
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            level = min(len(m.group(1)), max_level)
            title = m.group(2).strip()
            close_to(level)
            # 使用不同级别的 CSS 类，确保视觉差异明显（配合上方 .h1~.h5 样式）
            css_class = f"h{level}"
            out.append(f"<details open><summary><span class=\"{css_class}\">{title}</span></summary>")
            stack.append(level)
        else:
            out.append(ln)
        i += 1
    close_to(0)
    return "\n".join(out)

def _demote_false_headings(md: str) -> str:
    """将不应作为标题的行降级为正文。
    规则：
    - 行首有 # 的短句才视为标题；
    - 若标题文本以句号/分号/冒号/感叹/问号结尾，或包含大量逗号、或包含①②③编号，且长度较长，则认为是正文。
    """
    lines = md.splitlines()
    out = []
    for ln in lines:
        s = ln.lstrip()
        m = re.match(r"^(#{1,6})\s+(.+)$", s)
        if not m:
            out.append(ln)
            continue
        text = m.group(2).strip()
        long_text = len(text) >= 20
        suspicious_end = text.endswith(tuple("。；;：:！？!?"))
        many_commas = text.count("，") + text.count(",") >= 2
        has_enumeration = re.search(r"[①②③④⑤⑥⑦⑧⑨⑩]", text) is not None
        if long_text and (suspicious_end or many_commas or has_enumeration):
            # 降级为正文：去掉 #
            out.append(re.sub(r"^\s*#+\s+", "", ln))
        else:
            out.append(ln)
    return "\n".join(out)


_CN_NUM = "零一二三四五六七八九十百千两"
_CN_SEC = "篇章部节回卷集编卷章节部分"
_ROMAN = "IVXLCDM"

def _refine_headings(md: str) -> str:
    """二次全文清洗：
    - 识别常见中文/英文/罗马数字章节模式（如"第1章""第一节""一、""(一)"等）；
    - 若该行当前不是标题，则提升为合适级别的标题；
    - 保持已有 # 的标题不变，只做级别平滑。
    仅依据文本形态，不依赖 bbox。
    """
    def looks_like_h1(s: str) -> bool:
        s = s.strip()
        return bool(re.match(rf"^(第[0-9{_CN_NUM}]+[{_CN_SEC}]|[A-Z]{{1,2}}\.|[{_ROMAN}]+\.)", s))

    def looks_like_h2(s: str) -> bool:
        s = s.strip()
        if re.match(r"^[一二三四五六七八九十]{1,3}[、.]\s*", s):
            return True
        if re.match(r"^\([一二三四五六七八九十]{1,3}\)\s*", s):
            return True
        if re.match(r"^[0-9]{1,2}[、.]\s*", s):
            return True
        return False

    def looks_like_h3(s: str) -> bool:
        s = s.strip()
        return bool(re.match(r"^\([0-9]{1,2}\)\s*", s) or re.match(r"^[（(][一二三四五六七八九十]{1,3}[)）]", s))

    lines = md.splitlines()
    out = []
    for ln in lines:
        s = ln.lstrip()
        # 已是标题：保留
        if re.match(r"^#{1,6}\s+", s):
            out.append(ln)
            continue
        s_clean = s.strip()
        if not s_clean:
            out.append(ln)
            continue
        # 过长且像正文的不提升
        if len(s_clean) > 60 and (s_clean.endswith(tuple("。；;：:！？!?")) or s_clean.count("，") >= 2):
            out.append(ln)
            continue
        # 规则匹配
        if looks_like_h1(s_clean):
            out.append("# " + s_clean)
        elif looks_like_h2(s_clean):
            out.append("## " + s_clean)
        elif looks_like_h3(s_clean):
            out.append("### " + s_clean)
        else:
            out.append(ln)
    return "\n".join(out)

# —— 二次优化后级别的启发式微调：将 (1)/(2)/(3) 等视为上一个数字类 H3 的子级（降为 H4） ——
_RE_NUMERIC_H3 = re.compile(r"^\s*[0-9]{1,2}[\．\.]\s")
_RE_PAREN_NUM = re.compile(r"^\s*[\(（][0-9一二三四五六七八九十]{1,3}[\)）]\s*")

def _heuristic_demote_subnumbered(refined: list[tuple[str, int]]) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    current_h3_active = False
    for text, lvl in refined:
        t = str(text or "").strip()
        if _RE_NUMERIC_H3.match(t):
            current_h3_active = True
            out.append((text, lvl))
            continue
        if current_h3_active and _RE_PAREN_NUM.match(t):
            # 将括号编号行降为子级（但不低于 H4），直到遇到下一个数字类标题重置
            out.append((text, max(lvl + 1, 4)))
            continue
        # 遇到新段，重置标记
        if _RE_NUMERIC_H3.match(t) is None and _RE_PAREN_NUM.match(t) is None and lvl <= 3:
            current_h3_active = False
        out.append((text, lvl))
    return out

# ====== 分层分批：基于"篇/章/节/一、/1./(1)"等锚点进行分组，避免定长切片打断上下级 ======
_RE_PIAN = re.compile(r"^第[0-9一二三四五六七八九十百千两]+(篇|部|卷|编|集|回|部分)")
_RE_ZHANG = re.compile(r"^第[0-9一二三四五六七八九十百千两]+章")
_RE_JIE = re.compile(r"^第[0-9一二三四五六七八九十百千两]+节")
_RE_CN_LIST = re.compile(r"^[一二三四五六七八九十]{1,3}[、.]\s*")
_RE_NUM_DOT = re.compile(r"^[0-9]{1,2}[、.]\s*")
_RE_PAREN_ANY = re.compile(r"^[（(][0-9一二三四五六七八九十]{1,3}[)）]\s*")

def _classify_heading_kind(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return "other"
    if re.search(r"^(目录|附录|参考文献|前言|引言|绪论)\b", s):
        return "pian"  # 视作最上层
    if _RE_PIAN.match(s):
        return "pian"
    if _RE_ZHANG.match(s):
        return "zhang"
    if _RE_JIE.match(s):
        return "jie"
    if _RE_CN_LIST.match(s):
        return "cn_list"
    if _RE_NUM_DOT.match(s):
        return "num_dot"
    if _RE_PAREN_ANY.match(s):
        return "paren_num"
    return "other"

def _split_by_kind(items: list[tuple[int, str, str]], kind: str) -> list[list[tuple[int, str, str]]]:
    segs: list[list[tuple[int, str, str]]] = []
    cur: list[tuple[int, str, str]] = []
    for it in items:
        idx, txt, k = it
        if k == kind:
            if cur:
                segs.append(cur)
            cur = [it]
        else:
            cur.append(it)
    if cur:
        segs.append(cur)
    return segs

def _group_headings_for_refine(texts: list[str], max_items_per_batch: int = 180) -> list[tuple[list[str], str]]:
    # 保留顺序，不去重
    items = [(i, _normalize_heading_text(t), _classify_heading_kind(_normalize_heading_text(t))) for i, t in enumerate(texts) if _normalize_heading_text(t)]
    if not items:
        return []
    present = {k for _, _, k in items}
    order = [k for k in ["pian", "zhang", "jie", "cn_list", "num_dot", "paren_num"] if k in present]
    if not order:
        # 无法识别结构时，退回定长切片
        out = []
        for i in range(0, len(items), max_items_per_batch):
            chunk = items[i:i+max_items_per_batch]
            out.append(([t for _, t, _ in chunk], ""))
        return out

    results: list[tuple[list[str], str]] = []

    def helper(segment: list[tuple[int, str, str]], oi: int, parent_labels: list[str]):
        if len(segment) <= max_items_per_batch or oi >= len(order):
            # 仍然过大但没有更细的锚，只能定长切片
            if len(segment) <= max_items_per_batch:
                results.append(([t for _, t, _ in segment], " > ".join([p for p in parent_labels if p])))
                return
            for j in range(0, len(segment), max_items_per_batch):
                chunk = segment[j:j+max_items_per_batch]
                results.append(([t for _, t, _ in chunk], " > ".join([p for p in parent_labels if p])))
            return
        kind = order[oi]
        segs = _split_by_kind(segment, kind)
        # 若此段内不存在该 kind，则尝试更深一层
        has_kind = any((seg and seg[0][2] == kind) for seg in segs)
        if not has_kind:
            helper(segment, oi + 1, parent_labels)
            return
        for seg in segs:
            # 取该段的锚文本（若首项为该 kind）作为上级标签
            labels = list(parent_labels)
            if seg and seg[0][2] == kind:
                labels.append(seg[0][1])
            # 若本段仍过大，继续向下细分
            if len(seg) > max_items_per_batch and (oi + 1) < len(order):
                helper(seg, oi + 1, labels)
            else:
                if len(seg) <= max_items_per_batch:
                    results.append(([t for _, t, _ in seg], " > ".join([p for p in labels if p])))
                else:
                    for j in range(0, len(seg), max_items_per_batch):
                        chunk = seg[j:j+max_items_per_batch]
                        results.append(([t for _, t, _ in chunk], " > ".join([p for p in labels if p])))

    helper(items, 0, [])
    return results

# ====== 基于 dotsocr JSON 的分级标题重建（保守：仅使用 JSON 的 Section-header/Title） ======
def _normalize_heading_text(s: str) -> str:
    s = str(s or "").strip()
    s = re.sub(r"^#+\s+", "", s)
    s = s.replace("（", "(").replace("）", ")").replace("：", ":").replace("，", ",")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[。；;:!?！?]+$", "", s)
    return s


def _infer_heading_level_from_text(text: str) -> int:
    s = (text or "").strip()
    if not s:
        return 2
    if re.search(r"^第[0-9一二三四五六七八九十百千两]+[章篇部卷编]", s):
        return 1
    if re.search(r"^(附录|参考文献|目录)\b", s):
        return 1
    if re.search(r"^[一二三四五六七八九十]{1,3}[、.]\s*", s):
        return 2
    # 阿拉伯数字编号通常作为 H3 小节
    if re.search(r"^[0-9]{1,2}[、.]\s*", s):
        return 3
    # 罗马数字更偏向小节，避免与大节混淆
    if re.search(r"^[A-Z]{1,2}\.[\s\S]*", s):
        return 3
    if re.search(r"^[IVXLCDM]+\.[\s\S]*", s):
        return 2
    if re.search(r"^[（(][一二三四五六七八九十]{1,3}[)）]\s*", s):
        return 3
    if re.search(r"^[（(][0-9]{1,2}[)）]\s*", s):
        return 3
    if re.search(r"^[0-9]+\.[0-9]+", s):
        return 3
    return 2


def _extract_section_sequence_from_json(json_files: list[Path]) -> list[tuple[str, int]]:
    """提取 JSON 中的 Section-header/Title 序列（保持阅读顺序）。
    返回列表 [(纯文本标题, 级别)]。
    """
    seq: list[tuple[str, int]] = []
    for jp in json_files:
        try:
            data = json.loads(jp.read_text(encoding="utf-8"))
        except Exception:
            continue
        cells = None
        if isinstance(data, list):
            cells = data
        elif isinstance(data, dict):
            for key in ("cells", "elements", "items", "data"):
                if key in data and isinstance(data[key], list):
                    cells = data[key]
                    break
        if not isinstance(cells, list):
            continue
        for it in cells:
            if not isinstance(it, dict):
                continue
            cat = str(it.get("category") or it.get("label") or it.get("type") or "")
            if cat not in ("Section-header", "Title", "section_header", "section-header"):
                continue
            raw = (it.get("text") or it.get("content") or "").strip()
            if not raw:
                continue
            # 过滤选择题/列表项
            raw_no_hash = re.sub(r"^#+\s*", "", raw)
            if re.match(r"^[-*•]\s+", raw_no_hash):
                continue
            if re.match(r"^▼?[A-Z]\.\s", raw_no_hash):
                continue
            # 计算级别
            m = re.match(r"^(#{1,6})\s*(.*)$", raw)
            if m:
                level = len(m.group(1))
                text = _normalize_heading_text(m.group(2))
            else:
                text = _normalize_heading_text(raw)
                level = 1 if cat.lower().startswith("title") else _infer_heading_level_from_text(text)
            if text:
                seq.append((text, level))
    return seq


def _apply_section_sequence_to_markdown(md: str, seq: list[tuple[str, int]], max_level: int = 5) -> str:
    """将 JSON 提取的标题序列应用到 Markdown：
    - 仅调整匹配到的行，不做启发式提升
    - 匹配规则：忽略行首 #、空白与中英文括号/冒号差异
    """
    if not seq:
        return md
    lines = md.splitlines()
    i = 0  # 从上次命中位置继续向后匹配，保持顺序
    def norm(s: str) -> str:
        s = s.strip()
        s = re.sub(r"^#+\s+", "", s)
        s = s.replace("（", "(").replace("）", ")").replace("：", ":").replace("，", ",")
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"[。；;:!?！?]+$", "", s)
        return s
    for text, level in seq:
        target = norm(text)
        level = max(1, min(max_level, int(level)))
        j = i
        while j < len(lines):
            candidate = norm(lines[j])
            if candidate == target and not lines[j].lstrip().startswith(("- ", "* ", "• ", "▼")):
                lines[j] = "#" * level + " " + target
                i = j + 1
                break
            j += 1
    return "\n".join(lines)


# ====== 二次分级：调用本地 vLLM（DotsOCR 模型）对标题文本进行层级校正 ======
def _vllm_chat_refine_headings(texts: list[str], api: str = "http://127.0.0.1:8000/v1/chat/completions", model: str = "model", timeout: int = 60, log_dir: Optional[Path] = None) -> list[tuple[str, int]]:
    """调用本地 vLLM 服务，对输入的标题文本进行层级校正，返回 [(text, level)]。
    若调用失败，返回空列表。
    """
    if not texts:
        return []
    # 去重但保持顺序
    ordered = []
    seen = set()
    for t in texts:
        n = _normalize_heading_text(t)
        if n and n not in seen:
            seen.add(n)
            ordered.append(n)
    if not ordered:
        return []
    # 分层分批由上层控制；这里直接使用极简协议：返回 Markdown 标题行
    sys_prompt = (
        "任务：你将获得若干行候选标题文本（已去掉#，按阅读顺序）。\n"
        "请为每一行标注正确的层级，并直接按 Markdown 标题输出：\n"
        "输出要求：\n"
        "- 仅输出 N 行结果，与输入一一对应，不得增删，不得改写原文；\n"
        "- 第 i 行形如 '## 原文' 或 '### 原文' … 表示层级；层级无上限；如果1.；(1)同时出现，那么(1)应该比1.级别更低\n"
        "- 不要输出任何解释、前后缀、编号或额外文本。\n"
    )
    count = len(ordered)
    user_content = f"共有 {count} 行候选标题，请按顺序输出 {count} 行 Markdown 标题：\n" + "\n".join(ordered)
    payload = {
        "model": model,
        "temperature": 0.1,
        "top_p": 1.0,
        "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    try:
        r = requests.post(api, json=payload, timeout=(5, timeout))
        if not r.ok:
            return []
        d = r.json()
        # 兼容不同返回格式
        content = None
        try:
            content = d["choices"][0]["message"]["content"]
        except Exception:
            try:
                content = d["choices"][0]["delta"]["content"]
            except Exception:
                content = None
        if not content:
            return []
        # 优先解析 Markdown 标题行
        txt = content.strip()
        # 记录原始返回
        try:
            if log_dir is not None:
                (log_dir / "refine_vllm_last.txt").write_text(txt, encoding="utf-8")
        except Exception:
            pass
        lines = [ln for ln in txt.splitlines() if ln.strip()]
        out: list[tuple[str, int]] = []
        for ln in lines:
            m = re.match(r"^\s*(#{1,})\s+(.+)$", ln.strip())
            if not m:
                continue
            level = len(m.group(1))
            title = _normalize_heading_text(m.group(2))
            if title:
                out.append((title, max(1, min(5, level))))
        # 若未解析到任何标题，尝试 JSON 兼容
        if not out:
            start = txt.find("[")
            end = txt.rfind("]")
            if start != -1 and end != -1 and end > start:
                try:
                    arr = json.loads(txt[start:end+1])
                    if isinstance(arr, list):
                        for it in arr:
                            if not isinstance(it, dict):
                                continue
                            t = _normalize_heading_text(it.get("t"))
                            try:
                                lv = int(it.get("level", 2))
                            except Exception:
                                lv = 2
                            if t:
                                out.append((t, max(1, min(5, lv))))
                except Exception:
                    out = []
        return out
    except Exception:
        return []


# ---- HF 兜底：若 vLLM 不可用，则本地用 transformers 直接生成 ----
_refine_hf_model = None
_refine_hf_processor = None

def _ensure_hf_refiner():
    global _refine_hf_model, _refine_hf_processor
    if _refine_hf_model is not None and _refine_hf_processor is not None:
        return
    import os
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor
    model_dir = os.environ.get("DOTS_WEIGHTS_DIR") or str((Path(__file__).resolve().parent.parent / "dotsocr" / "weights" / "DotsOCR").resolve())
    attn_impl = os.environ.get("DOTS_ATTN_IMPL", "flash_attention_2")
    try:
        _refine_hf_model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            attn_implementation=attn_impl,
            torch_dtype=(torch.bfloat16 if torch.cuda.is_available() else torch.float32),
            device_map="auto",
            trust_remote_code=True,
        )
    except Exception:
        # 回退到 sdpa
        _refine_hf_model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            attn_implementation="sdpa",
            torch_dtype=(torch.bfloat16 if torch.cuda.is_available() else torch.float32),
            device_map="auto",
            trust_remote_code=True,
        )
    _refine_hf_processor = AutoProcessor.from_pretrained(model_dir, trust_remote_code=True, use_fast=True)


def _hf_chat_refine_headings(texts: list[str], max_new_tokens: int = 1024, log_dir: Optional[Path] = None) -> list[tuple[str, int]]:
    if not texts:
        return []
    # 去重顺序
    ordered = []
    seen = set()
    for t in texts:
        n = _normalize_heading_text(t)
        if n and n not in seen:
            seen.add(n)
            ordered.append(n)
    if not ordered:
        return []
    # 分层分批，避免上下级断裂，并携带父级上下文提示
    grouped = _group_headings_for_refine(ordered, max_items_per_batch=180)
    results: list[tuple[str, int]] = []
    system_prompt = (
        "任务：你将获得若干行候选标题文本（已去掉#，按阅读顺序）。\n"
        "请为每一行标注正确的层级，并直接按 Markdown 标题输出：\n"
        "输出要求：\n"
        "- 仅输出 N 行结果，与输入一一对应，不得增删，不得改写原文；\n"
        "- 第 i 行形如 '## 原文' 或 '### 原文' … 表示层级；层级无上限；如果1.；(1)同时出现，那么(1)应该比1.级别更低\n"
        "- 不要输出任何解释、JSON、前后缀、编号或额外文本。\n"
    )
    user_content = "\n".join(f"- {i+1}. {t}" for i, t in enumerate(ordered))
    try:
        _ensure_hf_refiner()
        for chunk, ctx in grouped:
            header = (f"父级上下文：{ctx}\n" if ctx else "")
            user_content = header + f"共有 {len(chunk)} 行候选标题，请按顺序输出 {len(chunk)} 行 Markdown 标题：\n" + "\n".join(chunk)
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]
            # 组装输入
            text = _refine_hf_processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = _refine_hf_processor(text=[text], padding=True, return_tensors="pt")
            if hasattr(inputs, "to"):
                inputs = inputs.to("cuda" if _refine_hf_model.device.type == "cuda" else "cpu")
            gen = _refine_hf_model.generate(**inputs, max_new_tokens=max_new_tokens)
            out_ids = [out[len(inputs.input_ids[0]):] for out in gen]
            content = _refine_hf_processor.batch_decode(out_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
            txt = content.strip()
            # 记录原始返回
            try:
                if log_dir is not None:
                    (log_dir / "refine_hf_last.txt").write_text(txt, encoding="utf-8")
            except Exception:
                pass
            # 优先解析为 Markdown 标题行
            lines = [ln for ln in txt.splitlines() if ln.strip()]
            out: list[tuple[str, int]] = []
            for ln in lines:
                m = re.match(r"^\s*(#{1,})\s+(.+)$", ln.strip())
                if not m:
                    continue
                level = len(m.group(1))
                title = _normalize_heading_text(m.group(2))
                if title:
                    out.append((title, max(1, min(5, level))))
            # 若模型未返回可解析 Markdown，则退回基于文本规则
            if not out:
                out = [(_normalize_heading_text(t), _infer_heading_level_from_text(t)) for t in chunk]
            results.extend(out)
        return results
    except Exception:
        # 发生异常时，直接使用确定性规则兜底（对全部 ordered）
        return [(_normalize_heading_text(t), _infer_heading_level_from_text(t)) for t in ordered]


# ====== 为预览与思维导图注入 heading 锚点并构建索引 ======
def _inject_heading_ids_and_index(md_html: str, max_mm_level: int = 3) -> tuple[str, list[dict]]:
    """在折叠 HTML 中为每个 <summary><span class="hN">Title</span></summary> 注入唯一 id，
    并返回（更新后的 HTML, 索引树）。索引树仅保留前 3 级。
    结构：[{id, title, level, children:[...]}, ...]
    """
    idx = 0
    headings: list[tuple[int, str, str]] = []  # (level, title, id)

    def repl(m: re.Match) -> str:
        nonlocal idx, headings
        level = int(m.group(1))
        title = m.group(2).strip()
        idx += 1
        hid = f"h-{idx}"
        headings.append((level, title, hid))
        return f"<summary id=\"{hid}\"><span class=\"h{level}\">{title}</span></summary>"

    # 更宽松匹配：允许 <summary ...> 与任意空白/属性
    html2 = re.sub(r"<summary[^>]*>\s*<span class=\"h(\d)\">(.*?)</span>\s*</summary>", repl, md_html, flags=re.DOTALL)

    # 构建 1..3 级的树
    tree: list[dict] = []
    stack: list[dict] = []
    for level, title, hid in headings:
        if level > max_mm_level:
            continue
        node = {"id": hid, "title": title, "level": level, "children": []}
        while stack and stack[-1]["level"] >= level:
            stack.pop()
        if not stack:
            tree.append(node)
        else:
            stack[-1]["children"].append(node)
        stack.append(node)

    return html2, tree


def _build_mindmap_html(tree: list[dict], snippets: dict[str, str] | None = None) -> str:
    """生成可折叠的 3 级思维导图 HTML。
    - 采用 <details>/<summary> 折叠结构；
    - 提供"定位"（内联 onclick，滚动左侧容器）与"预览"（纯锚点伪模态，无脚本）两种操作；
    - 伪模态通过 :target CSS 展示，点击遮罩或关闭按钮返回 #mm 关闭。
    """
    def render(nodes: list[dict]) -> str:
        if not nodes:
            return ""
        items = []
        for n in nodes:
            children_html = render(n.get("children") or [])
            # 行为：定位（滚动 md_preview），预览（打开伪模态）
            loc_js = (
                "(function(){try{const p=document.querySelector('#md_preview');"
                f"const t=p&&p.querySelector('#{n['id']}');"
                "if(!p||!t)return;"
                "p.scrollTo({top:Math.max(t.offsetTop-20,0),behavior:'smooth'});"
                "}catch(e){}})()"
            )
            loc_link = f"<a href=\"#\" onclick=\"{loc_js}\" style=\"margin-left:8px;color:#06c;text-decoration:underline;\">定位</a>"
            prev_link = f"<a href=\"#mm-modal-{n['id']}\" style=\"margin-left:8px;color:#06c;text-decoration:underline;\">预览</a>"
            items.append(
                "<li>"
                f"<details><summary><span style=\"font-weight:{700 if n['level']==1 else (600 if n['level']==2 else 500)};\">{n['title']}</span>{loc_link}{prev_link}</summary>"
                + (f"<ul style=\"list-style:none;padding-left:16px;margin:6px 0;\">{children_html}</ul>" if children_html else "")
                + "</details>"
                + "</li>"
            )
        return "".join(items)

    # 伪模态：使用 :target CSS
    style_tag = """
<style>
.mm-wrap { max-height:520px; overflow:auto; border:1px solid #ccc; padding:8px; }
.mm-wrap ul { list-style:none; padding-left:16px; margin:6px 0; }
.mm-modal { position:fixed; inset:0; display:none; z-index:9999; }
.mm-modal:target { display:block; }
.mm-mask { position:absolute; inset:0; background:rgba(0,0,0,0.35); display:block; }
.mm-dialog { position:absolute; right:20px; top:20px; background:#fff; border:1px solid #ddd; border-radius:8px; max-width:520px; max-height:70vh; overflow:auto; padding:12px; box-shadow:0 6px 18px rgba(0,0,0,0.2); }
.mm-close { position:absolute; right:10px; top:8px; color:#666; text-decoration:none; font-size:14px; }
.mm-title { font-weight:600; margin-bottom:8px; }
</style>
"""
    # 根锚点（关闭模态时跳回）
    base_anchor = "<a id=\"mm\"></a>"

    # 模态内容集合
    modals = []
    # 收集所有 id 顺序
    def collect_ids(nodes: list[dict], acc: list[str]):
        for n in nodes:
            acc.append(n["id"])
            collect_ids(n.get("children") or [], acc)
    ids: list[str] = []
    collect_ids(tree, ids)
    snip_map = snippets or {}
    for hid in ids:
        raw = snip_map.get(hid, "")
        # 将 Markdown/HTML 片段转换为可渲染 HTML（避免展示 markdown 源码）
        content = raw
        # 若片段看起来像 Markdown（含 ![]() 或 ** 或 ``` 或 ` ）则做最简转换
        if re.search(r"!\[[^\]]*\]\(|\*\*|```|`", raw):
            content = _simple_md_to_html(raw)
        modals.append(
            """
<div id="mm-modal-%HID%" class="mm-modal">
  <a href="#mm" class="mm-mask"></a>
  <div class="mm-dialog">
    <a href="#mm" class="mm-close">关闭</a>
    <div class="mm-title">正文预览</div>
    <div class="mm-body">%BODY%</div>
  </div>
</div>
""".replace("%HID%", hid).replace("%BODY%", content)
        )

    wrap = f"<div class=\"mm-wrap\"><ul>{render(tree)}</ul></div>"
    return style_tag + base_anchor + wrap + "".join(modals)


def _extract_head_snippets_from_html(md_html: str, ids: list[str]) -> dict[str, str]:
    """从折叠 HTML 中，提取每个 heading 的"正文片段"（从 </summary> 后直到第一个 <details 或 </details>）。
    返回 {id: html_snippet}，保留基础换行。
    """
    res: dict[str, str] = {}
    for hid in ids:
        # 找到对应 summary 结束位置（宽松匹配）
        m = re.search(rf"<summary[^>]*id=\"{re.escape(hid)}\"[^>]*>\s*<span class=\"h\d\">.*?</span>\s*</summary>", md_html, flags=re.DOTALL)
        if not m:
            continue
        start = m.end()
        rest = md_html[start:]
        # 截止到第一个子 details 或当前 details 结束
        p1 = rest.find("<details")
        p2 = rest.find("</details>")
        cut = None
        if p1 != -1 and p2 != -1:
            cut = min(p1, p2)
        elif p1 != -1:
            cut = p1
        elif p2 != -1:
            cut = p2
        else:
            cut = len(rest)
        snippet = rest[: max(0, cut)].strip()
        # 简化：若非常长，截断一段
        if len(snippet) > 1200:
            snippet = snippet[:1200] + "…"
        res[hid] = snippet
    return res


def _simple_md_to_html(md: str) -> str:
    """极简 Markdown -> HTML：支持图片、链接、粗体、换行段落。"""
    if not md:
        return ""
    txt = md
    # 图片 ![](src)
    txt = re.sub(r"!\[[^\]]*\]\(([^\)\s]+)[^\)]*\)", r'<img src="\1" style="max-width:100%;height:auto;"/>', txt)
    # 链接 [text](url)
    txt = re.sub(r"\[([^\]]+)\]\(([^\)\s]+)[^\)]*\)", r'<a href="\2" target="_blank">\1</a>', txt)
    # 粗体 **text**
    txt = re.sub(r"\*\*([^*]+)\*\*", r'<strong>\1</strong>', txt)
    # 代码块（粗略） ```...```
    txt = re.sub(r"```([\s\S]*?)```", r'<pre style="white-space:pre-wrap;">\1</pre>', txt)
    # 行内代码 `code`
    txt = re.sub(r"`([^`]+)`", r'<code>\1</code>', txt)
    # 段落换行
    lines = [ln.strip() for ln in txt.splitlines()]
    paras = [f"<p>{ln}</p>" for ln in lines if ln]
    return "\n".join(paras)


def _prepare_ui_outputs(md_text: str) -> tuple[str, str]:
    """对最终 Markdown/HTML 进行 UI 定制：注入 heading 锚点，并生成思维导图 HTML。"""
    try:
        md2, tree = _inject_heading_ids_and_index(md_text, max_mm_level=3)
        mm_html = _build_mindmap_html(tree)
        return md2, mm_html
    except Exception:
        return md_text, ""

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


def _wait_vllm_ready(timeout_secs: int = 180) -> bool:
    deadline = time.time() + max(1, timeout_secs)
    url = "http://127.0.0.1:8000/v1/models"
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=(2, 3))
            if r.ok:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False

_inflight_events = {}
_inflight_lock = threading.Lock()

# 主转换逻辑：返回 (进度文本, markdown)
def convert_to_markdown(file_obj, api_base: str, prompt: str, user_hint: str, mode: str):
    # 未选择文件
    if not file_obj:
        yield _prog_text(0, "未选择文件"), ""
        return

    acquired = False  # 仅在需要真正处理时才获取全局锁，缓存命中不加锁

    try:
        file_path = Path(getattr(file_obj, "name", file_obj))
        ext = file_path.suffix.lower()

        # 缓存/单飞键
        try:
            key = _make_cache_key(file_path, prompt or DEFAULT_PROMPT, user_hint or "", (mode or "hf").lower())
        except Exception:
            key = ""

        # 若磁盘已有缓存，直接返回（跨会话持久）
        if key:
            cached_disk = _cache_get(key)
            if cached_disk is not None:
                # 如为旧版 inline-style 折叠，升级为 class 版以得到新样式
                def _upgrade_legacy_summary(md: str) -> str:
                    try:
                        # 捕获旧版 style 中的 font-size 映射
                        def repl(m):
                            size = m.group(1)
                            title = m.group(2)
                            try:
                                v = float(size)
                            except Exception:
                                v = 1.0
                            level = 5
                            if v >= 1.55:
                                level = 1
                            elif v >= 1.35:
                                level = 2
                            elif v >= 1.15:
                                level = 3
                            elif v >= 1.075:
                                level = 4
                            return f"<summary><span class=\"h{level}\">{title}</span></summary>"
                        return re.sub(r"<summary[^>]*font-size\s*:\s*([0-9.]+)em[^>]*>(.*?)</summary>", repl, md, flags=re.DOTALL)
                    except Exception:
                        return md

                upgraded = _upgrade_legacy_summary(cached_disk)
                if upgraded != cached_disk:
                    _def_cache[key] = upgraded
                    _cache_set(key, upgraded, file_path.name)
                    yield _prog_text(100, "命中缓存（已自动升级样式）"), upgraded
                else:
                    # 写入内存缓存，避免并发分支误判为未命中而继续排队/接管
                    _def_cache[key] = cached_disk
                    yield _prog_text(100, "命中缓存（本地磁盘），直接展示"), cached_disk
                return

        # 单飞：相同文件并发只跑一次
        ev = None
        created_leader = False
        if key:
            with _inflight_lock:
                ev = _inflight_events.get(key)
                if ev is None and key not in _def_cache:
                    ev = threading.Event()
                    _inflight_events[key] = ev
                    created_leader = True
            # 若已有进行中任务且无缓存，则等待一小段时间；超时则接管为leader，避免长期卡住
            if ev is not None and not created_leader and key not in _def_cache:
                yield _prog_text(0, "排队中，等待相同文件任务完成…"), ""
                waited = ev.wait(timeout=30)
                cached = _def_cache.get(key)
                if waited and cached is not None:
                    yield _prog_text(100, "命中缓存，直接展示"), cached
                    return
                # 认为对方异常，接管为leader
                with _inflight_lock:
                    ev = threading.Event()
                    _inflight_events[key] = ev
                    created_leader = True
            # 若已有缓存，直接返回
            if key in _def_cache:
                yield _prog_text(100, "命中缓存，直接展示"), _def_cache[key]
                return

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
            finally:
                if key and created_leader:
                    with _inflight_lock:
                        ev2 = _inflight_events.pop(key, None)
                        if ev2:
                            try: ev2.set()
                            except Exception: pass
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
            # 到这里说明没有命中缓存，才尝试获取全局处理锁
            if not acquired:
                acquired = _convert_lock.acquire(blocking=False)
                if not acquired:
                    yield _prog_text(0, "排队中，等待前一任务完成…"), ""
                    _convert_lock.acquire()
                    acquired = True
            api_base = (api_base or DEFAULT_API_BASE).rstrip("/")
            predict_url = f"{api_base}/predict"
            md_url = f"{api_base}/markdown"
            params = {
                "prompt": prompt or DEFAULT_PROMPT,
                "fitz_preprocess": "true" if ext == ".pdf" else "false",
                "mode": (mode or "hf").lower(),
            }
            # 附加用户提示词到后端，由后端在基础提示词后拼接
            if user_hint and str(user_hint).strip():
                params["user_hint"] = str(user_hint).strip()
            ctype = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            try:
                if (mode or "hf").lower() == "vllm":
                    yield _prog_text(10, "等待 vLLM 就绪…（最多 180 秒）"), ""
                    if not _wait_vllm_ready(180):
                        yield _prog_text(100, "失败"), "vLLM 尚未就绪，请稍后重试或切换 HF 模式。"
                        return
                read_timeout = _read_timeout_for(file_path, ext)
                page_count: Optional[int] = None
                if ext == ".pdf" and fitz is not None:
                    try:
                        with fitz.open(str(file_path)) as doc:
                            page_count = doc.page_count
                    except Exception:
                        page_count = None

                if page_count is not None:
                    yield _prog_text(30, f"检测到 PDF 共 {page_count} 页，开始上传并后台解析…"), ""
                else:
                    yield _prog_text(30, "开始上传并后台解析…"), ""

                with open(file_path, "rb") as f:
                    files = {"file": (file_path.name, f, ctype)}
                    resp = requests.post(predict_url, params=params, files=files, timeout=(10, read_timeout))
                if not resp.ok:
                    raise RuntimeError(f"后端返回非200：{resp.status_code} {resp.text[:200]}")

                payload = resp.json()
                md_text = payload.get("md")
                md_path = payload.get("md_path")

                if not md_text and md_path:
                    yield _prog_text(80, "后台转换完成，获取 Markdown 文本…"), ""
                    r2 = requests.get(md_url, params={"path": md_path}, timeout=(10, 60))
                    if r2.ok:
                        md_text = r2.text

                if ext == ".pdf" and md_path:
                    try:
                        md_file = Path(md_path)
                        folder = md_file.parent
                        stem = md_file.stem
                        parts = stem.split("_page_")
                        prefix = parts[0] if len(parts) > 1 else stem
                        # 仅合并标准页文件，过滤 *_nohf.md 以避免重复
                        page_files = sorted(
                            [p for p in folder.glob(f"{prefix}_page_*.md") if not p.name.endswith("_nohf.md")],
                            key=lambda p: p.name,
                        )
                        if page_files:
                            raw_pages = []
                            total_pf = len(page_files)
                            for idx, pf in enumerate(page_files, start=1):
                                try:
                                    raw_pages.append(pf.read_text(encoding="utf-8"))
                                except Exception:
                                    raw_pages.append("")
                                # 页面级进度提示（仅合并阶段可见）
                                try:
                                    pct = 70 + int(idx * 20 / max(1, total_pf))
                                    yield _prog_text(pct, f"合并页 {idx}/{total_pf}…"), ""
                                except Exception:
                                    pass
                            # 先跨页去页眉/页脚，再续接段落
                            cleaned_pages = _remove_repeated_headers_footers(raw_pages, ratio=0.6, k=3)
                            cleaned_pages = _join_cross_pages(cleaned_pages)
                            # 读取对应 JSON，提取 Section 序列并严格应用
                            json_files = []
                            for pf in page_files:
                                jp = pf.with_suffix('.json')
                                if jp.exists():
                                    json_files.append(jp)
                            combined = "\n\n".join(cleaned_pages)
                            seq = _extract_section_sequence_from_json(json_files) if json_files else []
                            if seq:
                                # 先用 JSON 序列粗定位（不限制级别）
                                combined = _apply_section_sequence_to_markdown(combined, seq, max_level=99)
                                # 仅 LLM 回填：HF 优先；HF 为空再尝试 vLLM；均失败则不做任何代码优化
                                refined = _hf_chat_refine_headings([t for t, _ in seq])
                                if refined:
                                    combined = _apply_section_sequence_to_markdown(combined, refined, max_level=99)
                                else:
                                    refined = _vllm_chat_refine_headings([t for t, _ in seq])
                                    if refined:
                                        combined = _apply_section_sequence_to_markdown(combined, refined, max_level=99)
                                # 不再进行 rebase/normalize/启发式等代码级优化
                            else:
                                # 无 JSON 时不做任何代码优化
                                combined = combined
                            md_text = _fold_by_headings(combined, max_level=5)
                            # 记录最近会话目录，供"重做二次分级优化"使用
                            try:
                                LAST_SESSION_FILE.write_text(str(folder.resolve()), encoding='utf-8')
                            except Exception:
                                pass
                            # 另存清洗后的版本
                            try:
                                (folder / (prefix + "_clean.md")).write_text(md_text, encoding="utf-8")
                            except Exception:
                                pass
                    except Exception:
                        pass

                # 优先加载用户自定义版本（如存在）
                if key:
                    try:
                        r_user = requests.get(f"{api_base}/load_user_markdown", params={"key": key}, timeout=(5, 5))
                        if r_user.ok:
                            txt = r_user.text or ""
                            if txt.strip():
                                md_text = _fold_by_headings(txt, max_level=5)
                    except Exception:
                        pass

                # 最终兜底与缓存
                if md_text and "<details" not in md_text:
                    # 仅折叠显示，不做任何代码级优化
                    try:
                        md_text = _fold_by_headings(md_text, max_level=5)
                    except Exception:
                        pass
                if not md_text:
                    if key:
                        _cache_set(key, "", file_path.name)
                    md_text = f"未返回 Markdown 内容。返回键：{list(payload.keys())}"
                if key and md_text:
                    _cache_set(key, md_text, file_path.name)
                if page_count is not None:
                    yield _prog_text(100, f"完成（{page_count}/{page_count} 页）"), md_text
                else:
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
                # vLLM 失败时自动回退到 HF
                if (mode or "hf").lower() == "vllm":
                    try:
                        yield _prog_text(50, "vLLM 调用失败，自动切换 HF 重试…"), ""
                        params["mode"] = "hf"
                        with open(file_path, "rb") as f:
                            files = {"file": (file_path.name, f, ctype)}
                            resp = requests.post(predict_url, params=params, files=files, timeout=(10, _read_timeout_for(file_path, ext)))
                        if resp.ok:
                            payload = resp.json()
                            md_text = payload.get("md")
                            md_path = payload.get("md_path")
                            if not md_text and md_path:
                                r2 = requests.get(md_url, params={"path": md_path}, timeout=(10, 60))
                                if r2.ok:
                                    md_text = r2.text
                            if not md_text:
                                md_text = f"未返回 Markdown 内容。返回键：{list(payload.keys())}"
                            if key:
                                _cache_set(key, md_text, file_path.name)
                            yield _prog_text(100, "完成(HF)"), md_text
                            return
                    except Exception:
                        pass
                yield _prog_text(100, "失败"), f"调用 API 失败: {e}\n请确认 API 已启动并可访问：{predict_url}"
                return
        
        yield _prog_text(100, "失败"), f"暂不支持该文件类型：{ext}。请上传 PDF、图片、Markdown、文本或 Office 文档。"
    finally:
        if key and created_leader:
            with _inflight_lock:
                ev2 = _inflight_events.pop(key, None)
                if ev2:
                    try: ev2.set()
                    except Exception: pass
        if acquired:
            _convert_lock.release()


def build_ui():
    with gr.Blocks(title="文档转 Markdown", css="""
.scroll-box { height: 520px; overflow: auto; border: 1px solid #ccc; padding: 8px; }
details > summary { cursor: pointer; }
.h1 { font-size: 1.6em; font-weight: 700; }
.h2 { font-size: 1.4em; font-weight: 700; }
.h3 { font-size: 1.2em; font-weight: 700; }
.h4 { font-size: 1.1em; font-weight: 600; }
.h5 { font-size: 1.05em; font-weight: 600; }
/* 全局覆盖层 */
#mode-overlay-root { position: relative; }
#top-nav { position: sticky; top: 0; z-index: 1000; background: #fff; padding: 6px 0; border-bottom: 1px solid #eee; }
.overlay-blank { position: fixed; left: 0; right: 0; top: 56px; bottom: 0; background: #fff; z-index: 999; }
""") as demo:
        gr.HTML(value=(
            "<script>(function(){try{function ok(e){var m=String((e&&(e.reason&&e.reason.message||e.message))||'');if(m.indexOf(\"target origin provided ('https://huggingface.co')\")!==-1){e.preventDefault&&e.preventDefault();e.stopImmediatePropagation&&e.stopImmediatePropagation();return false;}return true;}window.addEventListener('error',function(e){ok(e);},true);window.addEventListener('unhandledrejection',function(e){ok(e);},true);}catch(e){}})();</script>"
        ), visible=False)
        # 全局脚本修复：有些环境下 Gradio 前端会向 huggingface.co postMessage，导致控制台报错
        gr.HTML(
            value=(
                "<script>(function(){try{"
                "var origPM = (window.Window && window.Window.prototype && window.Window.prototype.postMessage) ? window.Window.prototype.postMessage : null;"
                "if(origPM){window.Window.prototype.postMessage=function(msg,origin,transfer){try{if(typeof origin==='string'&&origin.indexOf('huggingface.co')!==-1){origin='*';}return origPM.call(this,msg,origin,transfer);}catch(e){try{return origPM.call(this,msg,'*',transfer);}catch(_){}}};}"
                "var _pm = (window.postMessage?window.postMessage.bind(window):null);"
                "if(_pm){window.postMessage=function(msg,origin,transfer){try{if(typeof origin==='string'&&origin.indexOf('huggingface.co')!==-1){origin='*';}return _pm(msg,origin,transfer);}catch(e){try{return _pm(msg,'*',transfer);}catch(_){}}};}"
                "}catch(e){}})();</script>"
            ),
            visible=False,
        )
        # 顶部导航：预览/带背/讲解/播客/研学/练习/设置
        with gr.Row(elem_id="top-nav"):
            nav_preview = gr.Button("预览模式", variant="primary")
            nav_mem = gr.Button("带背模式", variant="secondary")
            nav_explain = gr.Button("讲解模式", variant="secondary")
            nav_podcast = gr.Button("播客模式", variant="secondary")
            nav_study = gr.Button("研学模式", variant="secondary")
            nav_practice = gr.Button("练习模式", variant="secondary")
            nav_settings = gr.Button("设置", variant="secondary")

        # 页面覆盖层（用于显示空白页或内嵌子应用）
        mode_overlay = gr.HTML(value="", elem_id="mode-overlay-root")

        # 设置页（初始隐藏，仅界面，不改逻辑）
        with gr.Column(visible=False) as settings_panel:
            # 带背模型候选（允许自定义）
            MEM_MODEL_CHOICES = [
                "kimi-k2-0711-preview",
                "qwen",
                "gpt-4",
                "gpt-3.5",
                "claude",
                "gemini",
            ]
            gr.Markdown("## 设置 · 模型与提示词（仅界面，占位待接入）")
            gr.Markdown("为 6 种模式各提供 2 组配置，共 12 个配置框。保存时仅将'预览模式 A'应用到当前页面的基础配置，不改变分析逻辑。")

            def _build_mode_group(title: str, suffix: str):
                with gr.Group():
                    gr.Markdown(f"**{title}（{suffix}）**")
                    if title == "带背模式":
                        # 与 automindmap 左侧"思维导图生成模型"保持一致的字段与默认值
                        vendor = gr.Textbox(label="API Key", value="", placeholder="思维导图模型API密钥", interactive=True, elem_id="memA-api-key" if suffix=="A" else None)
                        model = gr.Dropdown(
                            label="选择思维导图模型",
                            choices=MEM_MODEL_CHOICES,
                            value="kimi-k2-0711-preview",
                            interactive=True,
                            allow_custom_value=True,
                            elem_id="memA-model-select" if suffix=="A" else None,
                        )
                        api_base_cfg = gr.Textbox(label="API Base", value="", interactive=True, elem_id="memA-api-base")  # 原子项目无此必填，留空即可
                        prompt_cfg = gr.Textbox(
                            label="系统提示词",
                            value=(
                                "你是一位专业的内容分析和思维导图生成专家。请根据用户提供的内容，生成一个结构清晰、层次分明的思维导图。"
                                "使用Markdown格式，以中心主题开始，逐步展开分支主题，每个主题都要简洁明了。"
                                "使用适当的层级结构（#、##、###等）来表示思维导图的层次关系。确保内容逻辑清晰，重点突出，便于理解和记忆。"
                            ),
                            lines=5,
                            interactive=True,
                            elem_id="memA-system-prompt" if suffix=="A" else None,
                        )
                        user_hint_cfg = gr.Textbox(label="用户提示词模板", value="请根据以下内容生成一个结构化的思维导图：{content}", lines=2, interactive=True, elem_id="memA-user-prompt")
                        return vendor, model, api_base_cfg, prompt_cfg, user_hint_cfg
                    else:
                        vendor = gr.Dropdown(label="模型厂商", choices=["hf", "vllm", "openai", "deepseek", "others"], value="hf", interactive=True)
                        model = gr.Textbox(label="模型名称", value="", interactive=True)
                        api_base_cfg = gr.Textbox(label="API Base", value=DEFAULT_API_BASE, interactive=True)
                        prompt_cfg = gr.Textbox(label="基础提示词", value=DEFAULT_PROMPT, lines=2, interactive=True)
                        user_hint_cfg = gr.Textbox(label="用户提示词", value="", lines=2, interactive=True)
                        return vendor, model, api_base_cfg, prompt_cfg, user_hint_cfg

            modes = ["预览模式", "带背模式", "讲解模式", "播客模式", "研学模式", "练习模式"]
            cfg_refs = {}
            for m in modes:
                with gr.Row():
                    v1, m1, a1, p1, u1 = _build_mode_group(m, "A")
                    v2, m2, a2, p2, u2 = _build_mode_group(m, "B")
                    cfg_refs[(m, "A")] = (v1, m1, a1, p1, u1)
                    cfg_refs[(m, "B")] = (v2, m2, a2, p2, u2)

            # 为“带背模式”提供显式保存按钮（A/B），直接回传到 automindmap /save-settings
            try:
                with gr.Row():
                    save_memA = gr.Button("保存带背模式 A 配置", variant="primary")
                    save_memB = gr.Button("保存带背模式 B 配置", variant="secondary")
            except Exception:
                save_memA = None
                save_memB = None

            # 保存按钮：仅将"预览模式 A"的基础配置应用到现有隐藏字段
            save_settings_btn = gr.Button("保存设置（应用到预览模式）", variant="primary")

            # 在前端直接监听带背模式 A 的输入变化并通过 10222 的 /am/save-settings 直写 5173，避免队列/刷新丢失
            gr.HTML(value="""
<script>
(function(){
  function $(sel){ return document.querySelector(sel); }
  function val(id){
    try{
      var root = document.getElementById(id);
      if(!root) return '';
      var inp = root.querySelector('input,textarea,select');
      return inp ? (inp.value||'') : '';
    }catch(e){ return ''; }
  }
  async function push(){
    try{
      const payload = {
        mindmap_api_base: val('memA-api-base'),
        mindmap_model: val('memA-model-select'),
        mindmap_system_prompt: val('memA-system-prompt'),
        mindmap_user_prompt: val('memA-user-prompt'),
        mindmap_api_key: val('memA-api-key'),
        mindmap_slot: 'A',
        ui_values: {
          'mindmap-api-base': val('memA-api-base'),
          'mindmap-model-select': val('memA-model-select'),
          'mindmap-system-prompt': val('memA-system-prompt'),
          'mindmap-user-prompt-template': val('memA-user-prompt'),
          'mindmap-api-key': val('memA-api-key')
        }
      };
      await fetch('/am/save-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    }catch(e){ /* ignore */ }
  }
  function bind(){
    ['memA-api-base','memA-model-select','memA-system-prompt','memA-user-prompt','memA-api-key'].forEach(function(id){
      try{
        var root = document.getElementById(id);
        if(!root) return;
        var el = root.querySelector('input,textarea,select');
        if(!el) return;
        var evt = (el.tagName==='SELECT') ? 'change' : 'input';
        el.addEventListener(evt, function(){ push(); });
      }catch(_e){}
    });
    // 初次加载也推一次，确保 5173 立刻同步当前页值
    setTimeout(push, 100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
</script>
            """)

            # 事件绑定在底部（在顶部基础输入创建后进行）
        # end settings panel
        # 顶部横排：文件 / API / Prompt
        with gr.Row():
            in_file = gr.File(label="选择文件", file_count="single", type="filepath")
            api_base = gr.Textbox(value=DEFAULT_API_BASE, label="API Base URL")
            prompt = gr.Textbox(value=DEFAULT_PROMPT, label="Prompt（基础提示词/模式名）")
        # 用户提示词 + 重做优化 按钮同排
        with gr.Row():
            user_hint = gr.Textbox(value="", label="用户提示词（可选，附加在基础提示词后）", placeholder="例如：去掉页眉页脚；忽略水印；只要正文……")
            reopt_btn = gr.Button("重做二次分级优化", variant="primary")

        # 模型/设备信息（自动刷新）
        health_md = gr.Markdown(value="未检测到后端信息。", label="模型/设备")

        # 纯文本进度
        progress_text = gr.Markdown(value=_prog_text(0, "就绪"), label="进度")

        # 预览区（保持渲染），新增"编辑模式"与编辑器 + 预览模式（思维导图）
        with gr.Row():
            md_out = gr.Markdown(label="输出 Markdown", elem_id="md_preview", elem_classes=["scroll-box"])
            with gr.Column(scale=1):
                preview_btn = gr.Button("更新导图预览", variant="secondary")
                mm_out = gr.HTML(value="", label="思维导图(3级)")
                mm_state = gr.State("")
        edit_mode = gr.Checkbox(label="编辑模式", value=False)
        with gr.Row(visible=False) as edit_tools_row:
            toolbar = gr.Radio(
                choices=["B","I","S","H1","H2","H3","Code","Quote","List","Todo","Color"],
                value=None,
                label="编辑工具（点击在选中文本处插入标注）",
            )
        md_editor = gr.Textbox(label="Markdown 源（可编辑）", lines=22, elem_classes=["scroll-box"], interactive=True, visible=False)
        save_info = gr.Markdown(value="")

        # 推理模式选择（默认 HF）
        inference_mode = gr.Radio(choices=["hf", "vllm"], value="hf", label="推理模式")

        # 自动触发：页面加载与 API Base 变更时刷新健康信息
        demo.load(fn=check_health, inputs=[api_base], outputs=[health_md])
        api_base.change(fn=check_health, inputs=[api_base], outputs=[health_md])

        # 自动触发事件统一放在底部（带 then 同步编辑器），避免重复触发导致二次调用

        key_state = gr.State("")
        def _compute_key_state(file_obj, prompt_value, user_hint_value, mode_value):
            try:
                if not file_obj:
                    return ""
                p = Path(getattr(file_obj, "name", file_obj))
                return _make_cache_key(p, prompt_value or DEFAULT_PROMPT, user_hint_value or "", (mode_value or "hf").lower())
            except Exception:
                return ""

        in_file.change(_compute_key_state, inputs=[in_file, prompt, user_hint, inference_mode], outputs=[key_state])
        prompt.change(_compute_key_state, inputs=[in_file, prompt, user_hint, inference_mode], outputs=[key_state])
        user_hint.change(_compute_key_state, inputs=[in_file, prompt, user_hint, inference_mode], outputs=[key_state])
        inference_mode.change(_compute_key_state, inputs=[in_file, prompt, user_hint, inference_mode], outputs=[key_state])

        def _apply_tool(current: str, tool: str):
            if not tool or not current:
                return current
            sel_prefix = ""
            sel_suffix = ""
            if tool == "B": sel_prefix, sel_suffix = "**", "**"
            elif tool == "I": sel_prefix, sel_suffix = "*", "*"
            elif tool == "S": sel_prefix, sel_suffix = "~~", "~~"
            elif tool == "H1": sel_prefix = "# "
            elif tool == "H2": sel_prefix = "## "
            elif tool == "H3": sel_prefix = "### "
            elif tool == "Code": sel_prefix, sel_suffix = "`", "`"
            elif tool == "Quote": sel_prefix = "> "
            elif tool == "List": sel_prefix = "- "
            elif tool == "Todo": sel_prefix = "- [ ] "
            elif tool == "Color": sel_prefix, sel_suffix = "<span style=\"color:red\">", "</span>"
            return sel_prefix + current + sel_suffix

        toolbar.change(_apply_tool, inputs=[md_editor, toolbar], outputs=[md_editor])

        def _save_user_md(content: str, key: str, api_base_val: str):
            try:
                base = (api_base_val or DEFAULT_API_BASE).rstrip("/")
                url = f"{base}/save_markdown"
                r = requests.post(url, json={"key": key, "content": content}, timeout=(5,10))
                if r.ok:
                    return f"已保存 ({key})"
                return f"保存失败：{r.status_code} {r.text[:120]}"
            except Exception as e:
                return f"保存失败：{e}"

        def _on_change_auto_save(content, key, api_base_val):
            if not key:
                return ""
            return _save_user_md(content, key, api_base_val)

        md_editor.change(_on_change_auto_save, inputs=[md_editor, key_state, api_base], outputs=[save_info])

        # 预览 -> 编辑器同步（当有新结果时，自动填充编辑器）
        def _copy_to_editor(md: str):
            return md
        # 单一触发：选择文件→处理→复制到编辑器，同时生成思维导图
        def _post_process_for_mm(md: str):
            # 注入 id 并构建树，再基于 id 抽取正文片段，最后构建纯 HTML 思维导图
            try:
                md2, tree = _inject_heading_ids_and_index(md, max_mm_level=3)
                ids = []
                def _collect(nodes):
                    for n in nodes:
                        ids.append(n["id"])
                        _collect(n.get("children") or [])
                _collect(tree)
                snips = _extract_head_snippets_from_html(md2, ids)
                # 优先使用带数据的 Markmap（节点点击 → 预览 + 定位），失败时退回纯导图
                try:
                    mm = build_markmap_html_with_data(tree, ids, snips)
                except Exception:
                    try:
                        mm = build_markmap_html(tree)
                    except Exception:
                        mm = build_mindmap_svg(tree, snippets=snips)
                return md2, md2, mm, mm
            except Exception:
                return md, md, "", ""

        in_file.upload(convert_to_markdown, inputs=[in_file, api_base, prompt, user_hint, inference_mode], outputs=[progress_text, md_out])\
              .then(_post_process_for_mm, inputs=[md_out], outputs=[md_out, md_editor, mm_out, mm_state])

        # 编辑模式显隐
        def _toggle_edit(v: bool):
            return gr.update(visible=v), gr.update(visible=v)
        edit_mode.change(_toggle_edit, inputs=[edit_mode], outputs=[edit_tools_row, md_editor])

        # 保存后实时预览：将编辑器内容回填到预览，并更新思维导图
        def _preview_after_edit(md: str, prev_mm: str):
            try:
                md2, tree = _inject_heading_ids_and_index(md, max_mm_level=3)
                ids = []
                def _collect(nodes):
                    for n in nodes:
                        ids.append(n["id"])
                        _collect(n.get("children") or [])
                _collect(tree)
                snips = _extract_head_snippets_from_html(md2, ids)
                try:
                    mm = build_markmap_html_with_data(tree, ids, snips)
                except Exception:
                    try:
                        mm = build_markmap_html(tree)
                    except Exception:
                        mm = build_mindmap_svg(tree, snippets=snips)
                return md2, mm, mm
            except Exception:
                # 回退到上一次的思维导图，避免闪退
                return md, prev_mm, prev_mm
        md_editor.change(_preview_after_edit, inputs=[md_editor, mm_state], outputs=[md_out, mm_out, mm_state])

        # 预览模式按钮：仅更新思维导图（不改内容）
        def _refresh_mm(md: str, prev_mm: str):
            try:
                md2, tree = _inject_heading_ids_and_index(md, max_mm_level=3)
                ids = []
                def _collect(nodes):
                    for n in nodes:
                        ids.append(n["id"])
                        _collect(n.get("children") or [])
                _collect(tree)
                snips = _extract_head_snippets_from_html(md2, ids)
                try:
                    mm = build_markmap_html_with_data(tree, ids, snips)
                except Exception:
                    try:
                        mm = build_markmap_html(tree)
                    except Exception:
                        mm = build_mindmap_svg(tree, snippets=snips)
                return mm
            except Exception:
                return prev_mm
        preview_btn.click(_refresh_mm, inputs=[md_out, mm_state], outputs=[mm_out])
        nav_preview.click(lambda: "", inputs=[], outputs=[]).then(_refresh_mm, inputs=[md_out, mm_state], outputs=[mm_out])

        # 顶部其他模式：显示空白覆盖层
        def _show_blank_page(title: str):
            # 右侧全屏嵌入右栏，隐藏左栏（最小侵入：通过 CSS 裁剪左侧，保留按钮与右侧配色不变）
            # 使用左侧裁剪宽度（环境可通过 AUTOMINDMAP_LEFT_CROP 指定，默认 520px）
            crop = os.environ.get("AUTOMINDMAP_LEFT_CROP", "520")
            css = (
                "<style>"
                ".overlay-blank{left:0;right:0;top:56px;bottom:0;}"
                "#automindmap-embed{position:absolute;left:0;right:0;top:0;bottom:0;}"
                "#automindmap-embed iframe{border:0;width:100%;height:100%;clip-path:inset(0 0 0 " + crop + "px);}"
                "</style>"
            )
            return css + f"<div class=\"overlay-blank\"><div style=\"position:absolute;left:50%;top:30%;transform:translateX(-50%);color:#777;font-size:18px;\">{title} · 即将上线</div></div>"
        def _hide_blank_page():
            return ""

        def _open_automindmap(md_text: str = ""):
            # 从"带背模式 A"读取设置，透传给子项目（模型/提示词/API/可选密钥）
            try:
                v1, m1, a1, p1, u1 = cfg_refs[("带背模式", "A")]
                api_base_val = (a1.value or "").strip()
                model_val = (m1.value or "").strip()
                sys_prompt_val = (p1.value or "").strip()
                user_prompt_val = (u1.value or "").strip()
            except Exception:
                api_base_val = ""
                model_val = ""
                sys_prompt_val = ""
                user_prompt_val = ""

            # 解析可能写在用户提示词里的 API key（如: api_key: sk-xxxx 或 key=sk-xxxx）
            mm_key = ""
            try:
                m = re.search(r"(?i)(?:api[_-]?key|token|key)\s*[:=]\s*([A-Za-z0-9._\-]+)", user_prompt_val)
                if m:
                    mm_key = m.group(1)
            except Exception:
                pass

            q = (
                f"embed=1&mode=mem&mm_override=1&mm_no_server=1&mm_force_update=1"
                f"&mm_api_base={quote_plus(api_base_val)}"
                f"&mm_model={quote_plus(model_val)}"
                f"&mm_sys={quote_plus(sys_prompt_val)}"
                f"&mm_user={quote_plus(user_prompt_val)}"
                f"&mm_key={quote_plus(mm_key)}"
            )
            # 直接把 init_md 上限传 URL（<= 8KB）以彻底绕过 postMessage 与本地请求失败
            try:
                init_md = _prefer_preview_md()
                if init_md:
                    md_bytes = init_md.encode('utf-8')
                    if len(md_bytes) <= 8 * 1024:
                        q += f"&init_md={quote_plus(init_md)}"
            except Exception:
                pass
            # 使用公共访问主机（WSL/容器等场景下 127.0.0.1 可能不可达）
            # 向前端透传 automindmap 基址，便于跨源持久化 /save-settings 与 /export-settings
            base = _detect_automindmap_base()

            # 在 iframe 加载前，将 7860 当前配置推送到 automindmap 的 /save-settings，包含 ui_values，避免首屏被旧配置覆盖
            try:
                payload_cfg = {
                    "mindmap_api_key": (mm_key or ""),
                    "mindmap_model": (model_val or ""),
                    "mindmap_api_base": (api_base_val or ""),
                    "mindmap_system_prompt": (sys_prompt_val or ""),
                    "mindmap_user_prompt": (user_prompt_val or ""),
                    "ui_values": {
                        "mindmap-api-base": (api_base_val or ""),
                        "mindmap-model-select": (model_val or ""),
                        "mindmap-system-prompt": (sys_prompt_val or ""),
                        "mindmap-user-prompt-template": (user_prompt_val or ""),
                        "mindmap-api-key": (mm_key or ""),
                    },
                }
                if base:
                    try:
                        requests.post(f"{base}/save-settings", json=payload_cfg, timeout=(2, 4))
                    except Exception:
                        pass
            except Exception:
                pass
            url = f"{base}/?{q}&am_base={quote_plus(base)}"
            if not url:
                return _show_blank_page("带背模式启动中…")
            # 旧的内联控制区（已弃用）；改用双 iframe：左侧控制板用 srcdoc（保证脚本执行），右侧为 automindmap
            left_doc = r"""<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}#controls{padding:8px;border-bottom:1px solid #eee;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:auto;gap:8px}#controls button{padding:6px 10px}#view{position:absolute;left:0;right:0;top:64px;bottom:24px;overflow:auto;padding:8px;white-space:pre-wrap;font-family:monospace}#prog{position:absolute;left:0;right:0;bottom:0;padding:6px 10px;border-top:1px solid #eee;color:#666;font-size:12px}</style></head><body><div id="controls"><button id="start">开始</button><button id="resume">继续</button><button id="choose">选择MD文件</button><input id="file" type="file" accept=".md,.markdown,.txt" style="display:none"/></div><div id="view"></div><div id="prog">未开始</div><script>(function(){function split(md){var lines=md.split(/\r?\n/),blocks=[],buf=[],last=false;function flush(){if(buf.length){blocks.push(buf.join('\n'));buf=[];}}var h=/^#{1,6}\s+/;for(var i=0;i<lines.length;i++){var L=lines[i];if(h.test(L)){if(!last){flush();}buf.push(L);last=true;}else{buf.push(L);last=false;}}flush();var segs=[];for(var b=0;b<blocks.length;b++){var ls=blocks[b].split(/\r?\n/),cur=[];for(var j=0;j<ls.length;j++){var l=ls[j];if(j>0&&/^#{1,6}\s+/.test(l)){segs.push(cur.join('\n'));cur=[l];}else{cur.push(l);}}if(cur.length)segs.push(cur.join('\n'));}return segs.filter(function(x){return x.trim().length>0;});}function stripImgs(md){return md.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g,'');}function render(md){var html=md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,function(_m,a,s){if(/^data:image\//.test(s)){return '<div style=\"margin:6px 0;color:#999;border:1px dashed #ddd;padding:4px;\">[跳过作为输入的图片预览]</div>'; }return '<div style=\"margin:6px 0\"><img alt=\"'+(a||'')+'\" src=\"'+s+'\" style=\"max-width:100%\"/></div>';});document.getElementById('view').innerHTML=html;}var segs=[],idx=0,rawMd='';function send(){if(!segs.length)return;var seg=stripImgs(segs[idx]||'');var rf=parent.document.getElementById('mem-am-iframe');if(rf&&rf.contentWindow){rf.contentWindow.postMessage({type:'mem-segment',index:idx,total:segs.length,text:seg},'*');}else{parent.postMessage({type:'mem-segment',index:idx,total:segs.length,text:seg},'*');}document.getElementById('prog').textContent='进度 '+(idx+1)+'/'+segs.length;render(segs[idx]||'');}function start(){if(!rawMd)return;segs=split(rawMd);idx=0;localStorage.setItem('mem_progress_key',JSON.stringify({idx:idx,total:segs.length}));send();}function resume(){var p;try{p=JSON.parse(localStorage.getItem('mem_progress_key')||'{}');}catch(e){}if(!rawMd||!p||p.total==null){return start();}segs=split(rawMd);idx=Math.min(p.idx||0,segs.length-1);send();}window.addEventListener('message',function(ev){var d=ev.data||{};if(d.type==='mem-ack'){idx=Math.min(idx+1,segs.length-1);localStorage.setItem('mem_progress_key',JSON.stringify({idx:idx,total:segs.length}));if(idx<segs.length)send();}else if(d.type==='mem-set-md'){rawMd=d.text||'';try{var tmp=split(rawMd);render(tmp[0]||rawMd);document.getElementById('prog').textContent='就绪 1/'+tmp.length;}catch(e){render(rawMd);}}});document.getElementById('start').onclick=start;document.getElementById('resume').onclick=resume;document.getElementById('choose').onclick=function(){document.getElementById('file').click();};document.getElementById('file').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){rawMd=String(r.result||'');render(rawMd);};r.readAsText(f,'utf-8');})();</script></body></html>"""
            # 覆盖左侧内联 HTML：新增“打开/开始/继续”、最深标题分块、图片仅展示与缓存续跑
            left_doc = r"""<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}#controls{padding:8px;border-bottom:1px solid #eee;display:grid;grid-template-columns:auto auto 1fr auto;grid-auto-rows:auto;gap:8px;align-items:center}#controls button{padding:6px 10px}#docname{font-size:12px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#view{position:absolute;left:0;right:0;top:64px;bottom:24px;overflow:auto;padding:8px;white-space:normal;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}#view img{max-width:100%;display:block;margin:6px 0}#prog{position:absolute;left:0;right:0;bottom:0;padding:6px 10px;border-top:1px solid #eee;color:#666;font-size:12px}</style></head><body><div id=\"controls\"><button id=\"start\">开始</button><button id=\"resume\">继续</button><span id=\"docname\">未加载MD，点击“选择MD文件”</span><button id=\"choose\">选择MD文件</button><input id=\"file\" type=\"file\" accept=\".md,.markdown,.txt\" style=\"display:none\"/></div><div id=\"view\"></div><div id=\"prog\">未开始</div><script>(function(){function fnv1a(str){var h=2166136261>>>0;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;}return('00000000'+(h>>>0).toString(16)).slice(-8);}function keyFor(hash){return 'mem_progress:'+hash;}function stripBase64Imgs(md){return md.replace(/!\[[^\]]*\]\(data:image\/[\w+\-.]+;base64,[^)]+\)/g,'');}function renderPreview(md){var esc=md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');var html=esc.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,function(_m,alt,src){return '<img alt="'+(alt||'')+'" src="'+src+'" />';});document.getElementById('view').innerHTML=html;}function detectDeepestLevel(lines){var inCode=false,deep=0;for(var i=0;i<lines.length;i++){var L=lines[i];if(/^```/.test(L)){inCode=!inCode;continue;}if(inCode)continue;var m=/^(#{1,6})\s+/.exec(L);if(m){var lv=m[1].length;if(lv>deep)deep=lv;}}return deep;}function splitByDeepest(md){var lines=md.split(/\r?\n/);var L=detectDeepestLevel(lines);if(!L){var parts=md.split(/\n{2,}/);return parts.map(function(s){return s.trim();}).filter(Boolean);}var inCode=false,idxs=[];for(var i=0;i<lines.length;i++){var line=lines[i];if(/^```/.test(line)){inCode=!inCode;continue;}if(inCode)continue;var re=new RegExp('^#{'+L+'}\\s+');if(re.test(line))idxs.push(i);}var segs=[];function join(a,b){return lines.slice(a,b).join('\n').trim();}if(idxs.length){if(idxs[0]>0){segs.push(join(0, idxs[0]));}for(var k=0;k<idxs.length;k++){var a=idxs[k];var b=(k+1<idxs.length)?idxs[k+1]:lines.length;segs.push(join(a,b));}}else{segs=[md];}return segs.filter(Boolean);}var segs=[],idx=0,rawMd='',docHash='';function saveProgress(nextIndex,total){try{localStorage.setItem(keyFor(docHash),JSON.stringify({nextIndex:nextIndex,total:total,ts:Date.now(),ver:1}));}catch(e){}}function loadProgress(){try{return JSON.parse(localStorage.getItem(keyFor(docHash))||'{}');}catch(e){return{};}}function send(){if(!segs.length)return;var sendText=stripBase64Imgs(segs[idx]||'');var rf=parent.document.getElementById('mem-am-iframe');if(rf&&rf.contentWindow){rf.contentWindow.postMessage({type:'mem-segment',index:idx,total:segs.length,text:sendText},'*');}else{parent.postMessage({type:'mem-segment',index:idx,total:segs.length,text:sendText},'*');}document.getElementById('prog').textContent='进度 '+(idx+1)+'/'+segs.length;renderPreview(segs[idx]||'');saveProgress(idx,segs.length);}function start(){if(!rawMd){document.getElementById('prog').textContent='请先加载MD';return;}segs=splitByDeepest(rawMd);idx=0;saveProgress(idx,segs.length);send();}function resume(){if(!rawMd){document.getElementById('prog').textContent='请先加载MD';return;}segs=splitByDeepest(rawMd);var p=loadProgress();idx=Math.min((p&&p.nextIndex!=null)?p.nextIndex:0,segs.length-1);send();}window.addEventListener('message',function(ev){var d=ev.data||{};if(d.type==='mem-ack'){idx=Math.min(idx+1,segs.length);saveProgress(idx,segs.length);if(idx<segs.length){send();}else{document.getElementById('prog').textContent='已完成 '+segs.length+'/'+segs.length;}}else if(d.type==='mem-set-md'){rawMd=d.text||'';docHash=fnv1a(rawMd);document.getElementById('docname').textContent='当前文档: '+docHash;try{var tmp=splitByDeepest(rawMd);renderPreview(tmp[0]||rawMd);document.getElementById('prog').textContent='就绪 '+(tmp.length?('1/'+tmp.length):'');}catch(e){renderPreview(rawMd);}}});document.getElementById('start').onclick=start;document.getElementById('resume').onclick=resume;document.getElementById('choose').onclick=function(){document.getElementById('file').click();};document.getElementById('file').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(!f)return;document.getElementById('docname').textContent=f.name;var r=new FileReader();r.onload=function(){rawMd=String(r.result||'');docHash=fnv1a(rawMd);var tmp=splitByDeepest(rawMd);renderPreview(tmp[0]||rawMd);document.getElementById('prog').textContent='就绪 '+(tmp.length?('1/'+tmp.length):'');saveProgress(0,tmp.length||0);};r.readAsText(f,'utf-8');});})();</script></body></html>"""
            # 防止内联 </script> 早闭合，安全转义
            left_doc_json = json.dumps(left_doc.replace("</script>", "<\\/script>"))
            # 预先准备要注入的 md 文本（JSON 安全字符串）
            # 取预览面板当前值作为首选注入文本，若为空再用传入的 md_text
            def _prefer_preview_md() -> str:
                try:
                    # 重要：优先选择原始 Markdown（md_editor），避免把折叠HTML注入到 MEM 模式
                    preferred = ""
                    try:
                        preferred = (md_editor.value or "").strip()
                    except Exception:
                        preferred = ""
                    # 如编辑器无内容，再回退到传入值
                    if not preferred:
                        preferred = (md_text or "").strip()
                    return preferred
                except Exception:
                    return md_text or ""
            try:
                init_md = _prefer_preview_md()
                md_init_json = json.dumps(init_md)
            except Exception:
                md_init_json = "\"\""
            # 同步一份到 automindmap 本地：用于 postMessage 失败时的兜底
            try:
                public_host = os.environ.get("AUTOMINDMAP_PUBLIC_HOST", AUTOMINDMAP_HOST)
                url_save = f"http://{public_host}:{AUTOMINDMAP_PORT}/save-settings"
                payload_init = {"mindmap_init_md": init_md, "mindmap_init_ts": int(time.time())}
                try:
                    requests.post(url_save, json=payload_init, timeout=(2, 4))
                except Exception:
                    pass
            except Exception:
                pass
            css = (
                "<style>"
                ".overlay-blank{position:fixed;left:0;right:0;top:56px;bottom:0;z-index:9999;background:#fff;}"
                "#mem-am-iframe{border:0;width:100%;height:100%;}"
                "</style>"
            )
            # 预备配置 JSON（供 iframe 收到后应用到 UI 并持久化到其自身源）
            try:
                cfg_json = json.dumps({
                    "api_base": api_base_val or "",
                    "model": model_val or "",
                    "sys": sys_prompt_val or "",
                    "user": user_prompt_val or "",
                    "key": mm_key or "",
                })
            except Exception:
                cfg_json = "{}"

            mem_html = css + (
                f"<div class=\"overlay-blank\" style=\"padding:0;\">"
                f"  <iframe id=\"mem-am-iframe\" src='{url}' style='border:0; width:100%; height:100%;'></iframe>"
                f"</div>"
            )
            # 初始化：在右侧 iframe onload 及多次重试时注入 md 文本
            mem_html += (
                "<script>(function(){try{var rf=document.getElementById('mem-am-iframe');if(!rf) return;var payload="
                + md_init_json
                + ";var cfg=" + cfg_json + ";function post(){try{if(rf.contentWindow){rf.contentWindow.postMessage({type:'mem-set-config',cfg:cfg},'*');rf.contentWindow.postMessage({type:'mem-set-md',text:payload},'*');}}catch(e){}};function loop(n){if(n<=0)return;post();setTimeout(function(){loop(n-1);},500);}rf.addEventListener('load',function(){post();setTimeout(function(){loop(6);},400);});setTimeout(function(){loop(8);},900); window.addEventListener('message',function(ev){var d=ev.data||{}; if(d.type==='mem-ack'){ /* 右侧段落处理完成的确认，可记录到日志或状态 */ }}); }catch(e){}})();</script>"
            )
            return mem_html

        def _open_automindmap_settings():
            # 同样透传设置到设置页，便于自动填充
            try:
                v1, m1, a1, p1, u1 = cfg_refs[("带背模式", "A")]
                api_base_val = (a1.value or "").strip()
                model_val = (m1.value or "").strip()
                sys_prompt_val = (p1.value or "").strip()
                user_prompt_val = (u1.value or "").strip()
            except Exception:
                api_base_val = ""
                model_val = ""
                sys_prompt_val = ""
                user_prompt_val = ""
            mm_key = ""
            try:
                m = re.search(r"(?i)(?:api[_-]?key|token|key)\s*[:=]\s*([A-Za-z0-9._\-]+)", user_prompt_val)
                if m:
                    mm_key = m.group(1)
            except Exception:
                pass
            q = (
                f"embed=1&mode=settings&mm_override=1&mm_no_server=1&mm_force_update=1"
                f"&mm_api_base={quote_plus(api_base_val)}"
                f"&mm_model={quote_plus(model_val)}"
                f"&mm_sys={quote_plus(sys_prompt_val)}"
                f"&mm_user={quote_plus(user_prompt_val)}"
                f"&mm_key={quote_plus(mm_key)}"
            )
            base = _detect_automindmap_base()
            # 同步一次配置到 /save-settings，保证设置页首屏即展示 7860 的配置
            try:
                payload_cfg = {
                    "mindmap_api_key": (mm_key or ""),
                    "mindmap_model": (model_val or ""),
                    "mindmap_api_base": (api_base_val or ""),
                    "mindmap_system_prompt": (sys_prompt_val or ""),
                    "mindmap_user_prompt": (user_prompt_val or ""),
                    "ui_values": {
                        "mindmap-api-base": (api_base_val or ""),
                        "mindmap-model-select": (model_val or ""),
                        "mindmap-system-prompt": (sys_prompt_val or ""),
                        "mindmap-user-prompt-template": (user_prompt_val or ""),
                        "mindmap-api-key": (mm_key or ""),
                    },
                }
                if base:
                    try:
                        requests.post(f"{base}/save-settings", json=payload_cfg, timeout=(2, 4))
                    except Exception:
                        pass
            except Exception:
                pass
            url = f"{base}/?{q}&am_base={quote_plus(base)}"
            # 同步把配置以 postMessage 注入设置页，避免初始值回跳
            try:
                cfg_json2 = json.dumps({
                    "api_base": api_base_val or "",
                    "model": model_val or "",
                    "sys": sys_prompt_val or "",
                    "user": user_prompt_val or "",
                    "key": mm_key or "",
                })
            except Exception:
                cfg_json2 = "{}"
            return (
                f"<div class=\"overlay-blank\" style=\"padding:0;\">"
                f"<iframe id=\"mem-am-iframe\" src='{url}' style='border:0; width:100%; height:100%;'></iframe>"
                f"</div>"
                "<script>(function(){try{var rf=document.getElementById('mem-am-iframe'); if(!rf) return; var cfg="
                + cfg_json2 +
                "; function post(){ try{ rf.contentWindow&&rf.contentWindow.postMessage({type:'mem-set-config',cfg:cfg}, '*'); }catch(_e){} }; function loop(n){ if(n<=0) return; post(); setTimeout(function(){ loop(n-1); }, 500); } rf.addEventListener('load', function(){ post(); setTimeout(function(){ loop(6); }, 400); }); setTimeout(function(){ loop(8); }, 900); }catch(_e){} })();</script>"
            )

        nav_mem.click(_open_automindmap, inputs=[md_out], outputs=[mode_overlay])
        nav_explain.click(lambda: _show_blank_page("讲解模式"), inputs=[], outputs=[mode_overlay])
        nav_podcast.click(lambda: _show_blank_page("播客模式"), inputs=[], outputs=[mode_overlay])
        nav_study.click(lambda: _show_blank_page("研学模式"), inputs=[], outputs=[mode_overlay])
        nav_practice.click(lambda: _show_blank_page("练习模式"), inputs=[], outputs=[mode_overlay])
        nav_preview.click(_hide_blank_page, inputs=[], outputs=[mode_overlay])

        # 设置面板显隐与保存（仅将"预览模式 A"映射到基础输入，不改变逻辑）
        def _toggle_settings():
            return gr.update(visible=True)
        def _hide_settings():
            return gr.update(visible=False)

        # 从 automindmap 拉取已有缓存，填充"带背模式 A"
        def _pull_mem_settings():
            try:
                public_host = os.environ.get("AUTOMINDMAP_PUBLIC_HOST", AUTOMINDMAP_HOST)
                url = f"http://{public_host}:{AUTOMINDMAP_PORT}/export-settings"
                data = {}
                try:
                    r = requests.get(url, timeout=(3, 5))
                    if r.ok:
                        data = r.json() or {}
                except Exception:
                    data = {}
                # 优先从 ui_values 读取当前 UI 值，再回退到顶层字段，避免显示默认值
                ui = data.get("ui_values") or {}
                vendor = (data.get("mindmap_api_key")
                          or ui.get("mindmap-api-key")
                          or "")
                model_val = (data.get("mindmap_model")
                             or ui.get("mindmap-model-select")
                             or "kimi-k2-0711")
                api_base_val = (data.get("mindmap_api_base")
                                or ui.get("mindmap-api-base")
                                or "")
                sys_prompt_val = (data.get("mindmap_system_prompt")
                                  or ui.get("mindmap-system-prompt")
                                  or "你是一位专业的内容分析和思维导图生成专家。请根据用户提供的内容，生成一个结构清晰、层次分明的思维导图。使用Markdown格式，以中心主题开始，逐步展开分支主题，每个主题都要简洁明了。使用适当的层级结构（#、##、###等）来表示思维导图的层次关系。确保内容逻辑清晰，重点突出，便于理解和记忆。")
                user_prompt_val = (data.get("mindmap_user_prompt")
                                   or ui.get("mindmap-user-prompt-template")
                                   or "请根据以下内容生成一个结构化的思维导图：{content}")
                # 若 5173 返回的模型值不在候选中，则动态加入，避免 Dropdown 报错
                try:
                    dyn_choices = list(MEM_MODEL_CHOICES)
                    if model_val and model_val not in dyn_choices:
                        dyn_choices.append(model_val)
                    model_update = gr.update(value=model_val, choices=dyn_choices)
                except Exception:
                    model_update = gr.update(value=model_val)
                return (
                    gr.update(value=vendor),
                    model_update,
                    gr.update(value=api_base_val),
                    gr.update(value=sys_prompt_val),
                    gr.update(value=user_prompt_val),
                )
            except Exception:
                # 返回空更新，避免报错
                return gr.update(), gr.update(), gr.update(), gr.update(), gr.update()

        # 设置显示：仅显示本地设置面板（不再从 5173 自动拉取覆盖）
        try:
            # 打开设置面板时，立即从 5173 拉取最新配置回填到“带背模式 A”控件，避免默认值回写覆盖
            nav_settings.click(_hide_blank_page, inputs=[], outputs=[mode_overlay])\
                .then(_toggle_settings, inputs=[], outputs=[settings_panel])\
                .then(_pull_mem_settings, inputs=[], outputs=[
                    cfg_refs[("带背模式", "A")][0],  # vA
                    cfg_refs[("带背模式", "A")][1],  # mA
                    cfg_refs[("带背模式", "A")][2],  # aA
                    cfg_refs[("带背模式", "A")][3],  # pA
                    cfg_refs[("带背模式", "A")][4],  # uA
                ])
        except Exception:
            nav_settings.click(_hide_blank_page, inputs=[], outputs=[mode_overlay])\
                .then(_toggle_settings, inputs=[], outputs=[settings_panel])\
                .then(_pull_mem_settings, inputs=[], outputs=[
                    cfg_refs[("带背模式", "A")][0],
                    cfg_refs[("带背模式", "A")][1],
                    cfg_refs[("带背模式", "A")][2],
                    cfg_refs[("带背模式", "A")][3],
                    cfg_refs[("带背模式", "A")][4],
                ])

        nav_preview.click(_hide_settings, inputs=[], outputs=[settings_panel])
        
        # 取消页面加载时从 5173 自动拉取，避免覆盖本地“带背模式 A”设置

        # 将"带背模式"设置实时回传到 automindmap 的思维导图 API 配置
        def _push_mem_settings(suffix: str, v_val: str, m_val: str, a_val: str, p_val: str, u_val: str):
            try:
                payload = {
                    "mindmap_api_key": (v_val or ""),
                    "mindmap_model": (m_val or ""),
                    "mindmap_api_base": (a_val or ""),
                    "mindmap_system_prompt": (p_val or ""),
                    "mindmap_user_prompt": (u_val or ""),
                    "mindmap_slot": suffix,
                    "ui_values": {
                        "mindmap-api-base": (a_val or ""),
                        "mindmap-model-select": (m_val or ""),
                        "mindmap-system-prompt": (p_val or ""),
                        "mindmap-user-prompt-template": (u_val or ""),
                        "mindmap-api-key": (v_val or ""),
                    },
                }
                base = _detect_automindmap_base()
                url = f"{base}/save-settings"
                try:
                    requests.post(url, json=payload, timeout=(3, 5))
                except Exception:
                    pass
            except Exception:
                pass
            return gr.update()

        try:
            vA, mA, aA, pA, uA = cfg_refs[("带背模式", "A")]
            # 变更或输入时即刻推送到 automindmap（使用组件值作为函数输入）
            vA.change(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            mA.change(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            aA.change(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            pA.change(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            uA.change(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            # 文本框 input 实时推送
            try:
                aA.input(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            except Exception:
                pass
            try:
                pA.input(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            except Exception:
                pass
            try:
                uA.input(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            except Exception:
                pass
            if save_memA is not None:
                save_memA.click(lambda v,m,a,p,u: _push_mem_settings("A", v, m, a, p, u), inputs=[vA,mA,aA,pA,uA], outputs=[mode_overlay])
            # 页面加载即回填一次，避免刷新后显示为默认值
            try:
                demo.load(_pull_mem_settings, inputs=[], outputs=[vA, mA, aA, pA, uA])
            except Exception:
                pass
        except Exception:
            pass

        try:
            vB, mB, aB, pB, uB = cfg_refs[("带背模式", "B")]
            vB.change(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
            mB.change(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
            aB.change(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
            pB.change(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
            uB.change(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
            if save_memB is not None:
                save_memB.click(lambda v,m,a,p,u: _push_mem_settings("B", v, m, a, p, u), inputs=[vB,mB,aB,pB,uB], outputs=[mode_overlay])
        except Exception:
            pass

        # 设置保存：读取"预览模式 A"配置应用到顶部基础输入
        def _apply_preview_settings():
            try:
                v1, m1, a1, p1, u1 = cfg_refs[("预览模式", "A")]
                return (
                    gr.update(value=a1.value),
                    gr.update(value=p1.value),
                    gr.update(value=u1.value),
                    gr.update(value=(v1.value if v1.value in ("hf","vllm") else "hf")),
                )
            except Exception:
                return gr.update(), gr.update(), gr.update(), gr.update()

        save_settings_btn.click(_apply_preview_settings, inputs=[], outputs=[api_base, prompt, user_hint, inference_mode])

        # 重做二次分级优化：仅本地对最近会话重建合并与二次优化（不走后端、绕过缓存）
        def _redo_refine_local(file_obj, api_base_val, prompt_val, user_hint_val, mode_val, current_md):
            try:
                # 优先读取上次记录的会话目录
                sess_dir = None
                try:
                    if LAST_SESSION_FILE.exists():
                        cand = Path(LAST_SESSION_FILE.read_text(encoding='utf-8').strip())
                        if cand.exists() and cand.is_dir():
                            sess_dir = cand
                except Exception:
                    sess_dir = None
                if sess_dir is None:
                    base = Path('/home/long/mnt/d/AIPJ/016DocAvatar/output_api')
                    sessions = sorted([p for p in base.glob('upload_*') if p.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)
                    if sessions:
                        sess_dir = sessions[0]
                if not sess_dir:
                    # 保留现有内容，给出可操作提示
                    return _prog_text(100, '未找到最近会话输出：请先重新上传/转换产生会话，再点击本按钮'), current_md
                # 找到页 markdown 与对应 json
                page_md = sorted(sess_dir.glob('*_page_*.md'))
                if not page_md:
                    return _prog_text(100, '会话中未找到分页 Markdown'), current_md
                raw_pages = []
                for pf in page_md:
                    try:
                        raw_pages.append(pf.read_text(encoding='utf-8'))
                    except Exception:
                        raw_pages.append('')
                cleaned_pages = _remove_repeated_headers_footers(raw_pages, ratio=0.6, k=3)
                cleaned_pages = _join_cross_pages(cleaned_pages)
                # 提取 JSON 标题
                json_files = sorted(sess_dir.glob('*_page_*.json'))
                level_map_seq = _extract_section_sequence_from_json(json_files) if json_files else []
                combined = "\n\n".join(cleaned_pages)
                if level_map_seq:
                    # 先按 JSON 序列回填（不限制级别），再做模型二次校正；失败时不再代码兜底
                    combined = _apply_section_sequence_to_markdown(combined, level_map_seq, max_level=99)
                    refined = _hf_chat_refine_headings([t for t,_ in level_map_seq])
                    if refined:
                        combined = _apply_section_sequence_to_markdown(combined, refined, max_level=99)
                    else:
                        refined = _vllm_chat_refine_headings([t for t,_ in level_map_seq])
                        if refined:
                            combined = _apply_section_sequence_to_markdown(combined, refined, max_level=99)
                # 仅折叠显示
                md_final = _fold_by_headings(combined, max_level=5)
                return _prog_text(100, '重做优化完成'), md_final
            except Exception as e:
                return _prog_text(100, f'重做优化失败：{e}'), current_md

        reopt_btn.click(_redo_refine_local, inputs=[in_file, api_base, prompt, user_hint, inference_mode, md_out], outputs=[progress_text, md_out])\
                 .then(_post_process_for_mm, inputs=[md_out], outputs=[md_out, md_editor, mm_out, mm_state])

        # 重置当前文件缓存按钮
        def reset_current_cache(file_obj, prompt_value, user_hint_value, mode_value):
            if not file_obj:
                return _prog_text(0, "未选择文件"), "", True
            try:
                p = Path(getattr(file_obj, "name", file_obj))
            except Exception:
                return _prog_text(0, "未选择文件"), "", True
            try:
                key = _make_cache_key(p, prompt_value or DEFAULT_PROMPT, user_hint_value or "", (mode_value or "hf").lower())
            except Exception:
                key = None

            removed = []
            if key:
                _def_cache.pop(key, None)
                hashed = OUTPUT_DIR / f"{key}.md"
                try:
                    if hashed.exists():
                        hashed.unlink()
                        removed.append(hashed.name)
                except Exception:
                    pass
                with _inflight_lock:
                    ev = _inflight_events.pop(key, None)
                    if ev:
                        try:
                            ev.set()
                        except Exception:
                            pass
            # 也尝试清理按原文件名保存的副本
            alt = OUTPUT_DIR / (p.stem + ".md")
            try:
                if alt.exists():
                    alt.unlink()
                    removed.append(alt.name)
            except Exception:
                pass

            msg = "已清空缓存" if (key or removed) else "无可清理缓存"
            if key:
                msg += f" · key={key[:8]}..."
            return _prog_text(0, msg), "", False

        reset_btn = gr.Button("重置当前缓存", interactive=False)

        def _enable_reset_if_cached(file_obj, prompt_value, user_hint_value, mode_value):
            try:
                p = Path(getattr(file_obj, "name", file_obj))
                key = _make_cache_key(p, prompt_value or DEFAULT_PROMPT, user_hint_value or "", (mode_value or "hf").lower())
            except Exception:
                key = None
            cached = bool(key and _def_cache.get(key) is not None)
            return gr.update(interactive=cached)

        # 处理完成后，若缓存存在则启用"重置"按钮
        in_file.change(_enable_reset_if_cached, inputs=[in_file, prompt, user_hint, inference_mode], outputs=[reset_btn])

        def reset_current_cache_and_disable(file_obj, prompt_value, user_hint_value, mode_value):
            pt, md = reset_current_cache(file_obj, prompt_value, user_hint_value, mode_value)
            return pt, md, gr.update(interactive=False)

        def _clear_all_caches(_: str):
            cleared = []
            # 内存/磁盘 UI 缓存
            _def_cache.clear()
            for p in OUTPUT_DIR.glob("*.md"):
                try:
                    p.unlink()
                    cleared.append(str(p))
                except Exception:
                    pass
            # 后端缓存：api cache/json、用户保存、输出
            for d in (API_CACHE_DIR, API_USER_MD_DIR, API_OUTPUT_DIR):
                if d.exists():
                    for f in d.rglob("*"):
                        try:
                            if f.is_file():
                                f.unlink()
                        except Exception:
                            pass
            return _prog_text(0, "已清空前端与后端缓存（包括 api/cache、api/user_md、output_api、output/parsed）"), "", gr.update(interactive=False)

        reset_btn.click(_clear_all_caches, inputs=[key_state], outputs=[progress_text, md_out, reset_btn])
        # 用户提示词变更时，如已有文件则自动重跑（可命中缓存）
        user_hint.change(convert_to_markdown, inputs=[in_file, api_base, prompt, user_hint, inference_mode], outputs=[progress_text, md_out])
    return demo


if __name__ == "__main__":
    ui = build_ui()
    # 在 Gradio(FastAPI) 上增加转发路由，解决被 7860 转发到随机端口时的跨源/路径问题
    try:
        app = ui.app

        @app.get("/am/export-settings")
        def am_export_settings():
            try:
                base = _detect_automindmap_base()
                r = requests.get(f"{base}/export-settings", timeout=(3, 5))
                data = r.json() if r.ok else {}
                return JSONResponse(content=data, status_code=200)
            except Exception as e:
                return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)

        @app.post("/am/save-settings")
        async def am_save_settings(req: Request):
            """
            接收来自前端(10222)的设置保存请求，并转发到 automindmap 服务的 /save-settings。
            作用：确保 10222 上输入的配置成为 5173 的默认配置。
            """
            try:
                body = await req.json()
            except Exception:
                body = {}
            try:
                base = _detect_automindmap_base()
                if not base:
                    return JSONResponse(content={"ok": False, "error": "automindmap base not found"}, status_code=500)
                r = requests.post(f"{base}/save-settings", json=body, timeout=(5, 8))
                ok = bool(r.ok)
                return JSONResponse(content={"ok": ok}, status_code=200 if ok else 502)
            except Exception as e:
                return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)

        # 兼容前端直接请求 /save-settings 与 /export-settings（无需依赖代理层重写路径）
        @app.post("/save-settings")
        async def save_settings_proxy(req: Request):
            try:
                body = await req.json()
            except Exception:
                body = {}
            try:
                base = _detect_automindmap_base()
                if not base:
                    return JSONResponse(content={"ok": False, "error": "automindmap base not found"}, status_code=500)
                r = requests.post(f"{base}/save-settings", json=body, timeout=(5, 8))
                ok = bool(r.ok)
                return JSONResponse(content={"ok": ok}, status_code=200 if ok else 502)
            except Exception as e:
                return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)

        @app.get("/export-settings")
        def export_settings_proxy():
            try:
                base = _detect_automindmap_base()
                if not base:
                    return JSONResponse(content={}, status_code=200)
                r = requests.get(f"{base}/export-settings", timeout=(5, 8))
                if r.ok:
                    return JSONResponse(content=r.json(), status_code=200)
                return JSONResponse(content={}, status_code=502)
            except Exception:
                return JSONResponse(content={}, status_code=200)
    except Exception:
        pass
    # 旧版 gradio 不支持 concurrency_count 参数，这里仅启用队列，串行由内部锁控制
    ui.queue()
    # 优先使用环境端口（start_docavatar.sh 已固定为 10222），避免频繁随机端口
    ui.launch(server_name="127.0.0.1", server_port=int(os.environ.get("GRADIO_PORT", 10222)))


