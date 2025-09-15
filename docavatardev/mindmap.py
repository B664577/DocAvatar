from __future__ import annotations

import html
import re
from typing import List, Dict, Tuple
from pathlib import Path
import base64
import json


def _compute_layout(tree: List[Dict], max_level: int = 3) -> Tuple[List[Tuple[str, str, int, int, int]], List[Tuple[Tuple[int, int], Tuple[int, int]]]]:
    """径向思维导图布局（1..3级）。
    返回 (nodes, edges)，nodes: [(id, title, level, x, y)]，单位像素。
    策略：
      - 以画布中心为圆心，不放 root 节点，直接将 level 1 均匀分布在半径 r1 上；
      - level 2/3 在各自父节点扇区内均匀分布，半径按级别递增；
      - 曲线使用三次贝塞尔，控制点沿径向方向。
    """

    import math

    cx, cy = 480, 320
    r1, r2, r3 = 160, 260, 360
    nodes: List[Tuple[str, str, int, int, int]] = []
    edges: List[Tuple[Tuple[int, int], Tuple[int, int]]] = []

    lvl1 = [n for n in tree if (n.get("level") or 1) <= 1]
    n1 = max(1, len(lvl1))

    def place(level: int, angle: float, radius: float) -> Tuple[int, int]:
        x = int(cx + radius * math.cos(angle))
        y = int(cy + radius * math.sin(angle))
        return x, y

    def add_node(hid: str, title: str, level: int, x: int, y: int):
        title = (title or "").strip() or "(无题)"
        nodes.append((hid, title, level, x, y))

    def add_edge(p1: Tuple[int, int], p2: Tuple[int, int]):
        edges.append((p1, p2))

    # Level 1 分布在整圆
    for i, n in enumerate(lvl1):
        ang1 = (2 * math.pi * i) / n1
        x1, y1 = place(1, ang1, r1)
        add_node(n.get("id"), n.get("title"), 1, x1, y1)

        # Level 2：在父角附近分配扇区
        children2 = [] if 1 >= max_level else (n.get("children") or [])
        m2 = len(children2)
        if m2:
            start = ang1 - min(math.pi / 4, math.pi / (m2 + 1))
            end = ang1 + min(math.pi / 4, math.pi / (m2 + 1))
            for j, ch in enumerate(children2):
                ang2 = start + (end - start) * (j + 1) / (m2 + 1)
                x2, y2 = place(2, ang2, r2)
                add_node(ch.get("id"), ch.get("title"), 2, x2, y2)
                add_edge((x1, y1), (x2, y2))

                # Level 3：在二级子扇区进一步分配
                children3 = [] if 2 >= max_level else (ch.get("children") or [])
                m3 = len(children3)
                if m3:
                    start3 = ang2 - min(math.pi / 10, math.pi / (m3 + 2))
                    end3 = ang2 + min(math.pi / 10, math.pi / (m3 + 2))
                    for k, ch3 in enumerate(children3):
                        ang3 = start3 + (end3 - start3) * (k + 1) / (m3 + 1)
                        x3, y3 = place(3, ang3, r3)
                        add_node(ch3.get("id"), ch3.get("title"), 3, x3, y3)
                        add_edge((x2, y2), (x3, y3))

    return nodes, edges


def build_mindmap_svg(tree: List[Dict], snippets: Dict[str, str] | None = None) -> str:
    """生成纯前端 SVG 思维导图（1..3级），并附带伪模态预览。
    - 每个节点为圆角矩形 + 文本；
    - 点击标题跳到左侧对应 anchor（#h-id）；
    - 右上角“预览”链接打开 #mm-modal-id 伪模态；
    - 无外部脚本/样式依赖。
    """
    nodes, edges = _compute_layout(tree)

    # 画布大小
    width = 860
    height = 0
    if nodes:
        height = max(y for _, _, _, _, y in nodes) + 60
        width = max(x for _, _, _, x, _ in nodes) + 220

    # SVG 元素
    def esc(s: str) -> str:
        return html.escape(s, quote=True)

    edge_elems = []
    for (x1, y1), (x2, y2) in edges:
        mx = (x1 + x2) // 2
        edge_elems.append(f'<path d="M{x1},{y1} C{mx},{y1} {mx},{y2} {x2},{y2}" stroke="#bbb" fill="none"/>')

    node_elems = []
    for hid, title, level, x, y in nodes:
        w = 180
        h = 36
        rx = 8
        fill = {1: "#eef5ff", 2: "#f5f9ff", 3: "#fafcff"}.get(level, "#fff")
        stroke = {1: "#6aa0ff", 2: "#8fb5ff", 3: "#bcd2ff"}.get(level, "#cfd9ff")
        title_short = title if len(title) <= 22 else (title[:21] + "…")
        node_elems.append(
            """
<g>
  <a href="#%HID%"><rect x="%X%" y="%Y%" width="%W%" height="%H%" rx="%RX%" ry="%RX%" fill="%FILL%" stroke="%STK%"/></a>
  <a href="#%HID%"><text x="%TX%" y="%TY%" fill="#333" font-size="13" font-weight="%FW%">%TXT%</text></a>
  <a href="#mm-modal-%HID%"><text x="%PX%" y="%TY%" fill="#06c" font-size="12" text-decoration="underline">预览</text></a>
</g>
""".replace("%HID%", esc(hid))
              .replace("%X%", str(x))
              .replace("%Y%", str(y - h // 2))
              .replace("%W%", str(w))
              .replace("%H%", str(h))
              .replace("%RX%", str(rx))
              .replace("%FILL%", fill)
              .replace("%STK%", stroke)
              .replace("%TX%", str(x + 10))
              .replace("%TY%", str(y + 5))
              .replace("%FW%", "700" if level == 1 else ("600" if level == 2 else "500"))
              .replace("%TXT%", esc(title_short))
              .replace("%PX%", str(x + w - 40))
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        + "".join(edge_elems)
        + "".join(node_elems)
        + "</svg>"
    )

    # 伪模态集合
    style = """
<style>
.mm-modal { position:fixed; inset:0; display:none; z-index:9999; }
.mm-modal:target { display:block; }
.mm-mask { position:absolute; inset:0; background:rgba(0,0,0,0.35); display:block; }
.mm-dialog { position:absolute; right:20px; top:20px; background:#fff; border:1px solid #ddd; border-radius:8px; max-width:560px; max-height:70vh; overflow:auto; padding:12px; box-shadow:0 6px 18px rgba(0,0,0,0.2); }
.mm-close { position:absolute; right:10px; top:8px; color:#666; text-decoration:none; font-size:14px; }
.mm-title { font-weight:600; margin-bottom:8px; }
.mm-wrap { max-height:520px; overflow:auto; border:1px solid #ccc; padding:8px; }
</style>
"""
    base_anchor = "<a id=\"mm\"></a>"

    snips = snippets or {}
    modals = []
    for hid, title, *_ in nodes:
        body = snips.get(hid, "")
        if not body:
            continue
        modals.append(
            """
<div id="mm-modal-%HID%" class="mm-modal">
  <a href="#mm" class="mm-mask"></a>
  <div class="mm-dialog">
    <a href="#mm" class="mm-close">关闭</a>
    <div class="mm-title">%TITLE%</div>
    <div class="mm-body">%BODY%</div>
  </div>
</div>
""".replace("%HID%", html.escape(hid))
              .replace("%TITLE%", html.escape(title))
              .replace("%BODY%", body)
        )

    return style + base_anchor + f'<div class="mm-wrap">{svg}</div>' + "".join(modals)


def build_markmap_html(tree: List[Dict]) -> str:
    """使用 Markmap（CDN）渲染真正的思维导图。
    说明：
      - 依赖 d3 与 markmap-autoloader（从 jsdelivr 载入）；
      - 内容为生成的 Markdown，仅包含 1..3 级标题；
      - 若浏览器/网络阻止脚本，导图区域会显示原始 Markdown 文本作为降级。
    """
    def md_from_tree(nodes: List[Dict], level: int = 1) -> str:
        lines: List[str] = []
        for n in nodes:
            title = str(n.get("title") or "").strip() or "(无题)"
            lines.append("#" * level + " " + title)
            if n.get("children"):
                lines.append(md_from_tree(n["children"], min(level + 1, 3)))
        return "\n".join(lines)

    md = md_from_tree(tree, 1)
    # 生成独立页面，通过 iframe srcdoc 承载，避免外层 HTML 清洗脚本
    # 优先使用本地 assets（若存在），否则使用 CDN
    def _asset_text(name: str) -> str | None:
        try:
            p = Path(__file__).resolve().parent / "assets" / name
            if p.exists():
                return p.read_text(encoding="utf-8")
        except Exception:
            return None
        return None

    d3_js = _asset_text("d3.v7.min.js")
    # 注意顺序：先 lib 再 view，避免 window.markmap 被覆盖导致缺少 Transformer
    lib_js = _asset_text("markmap-lib.min.js")
    view_js = _asset_text("markmap-view.min.js")

    scripts_html = []
    if d3_js:
        d3_b64 = base64.b64encode(d3_js.encode('utf-8')).decode('ascii')
        scripts_html.append(f"<script src=\"data:application/javascript;base64,{d3_b64}\"></script>")
    else:
        scripts_html.append("<script src='https://cdn.jsdelivr.net/npm/d3@7'></script>")
    if lib_js and view_js:
        lib_b64 = base64.b64encode(lib_js.encode('utf-8')).decode('ascii')
        view_b64 = base64.b64encode(view_js.encode('utf-8')).decode('ascii')
        scripts_html.append(f"<script src=\"data:application/javascript;base64,{lib_b64}\"></script>")
        scripts_html.append(f"<script src=\"data:application/javascript;base64,{view_b64}\"></script>")
        init_code = """
<script>
  (function(){
    try{
      var md = %MD%;
      var transformer = new window.markmap.Transformer();
      var res = transformer.transform(md);
      var svg = document.getElementById('mm-svg');
      window.markmap.Markmap.create(svg, {initialExpandLevel:2}, res.root);
    }catch(e){ console.error(e); }
  })();
</script>
"""
    else:
        # 回退到 autoloader + CDN
        scripts_html.append("<script src='https://cdn.jsdelivr.net/npm/markmap-lib@0.15.7/dist/browser/index.min.js'></script>")
        scripts_html.append("<script src='https://cdn.jsdelivr.net/npm/markmap-view@0.15.7/dist/browser/index.min.js'></script>")
        init_code = """
<script>
  (function(){
    try{
      var md = %MD%;
      var transformer = new window.markmap.Transformer();
      var res = transformer.transform(md);
      var svg = document.getElementById('mm-svg');
      window.markmap.Markmap.create(svg, {initialExpandLevel:2}, res.root);
    }catch(e){ console.error(e); }
  })();
</script>
"""

    page = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<style>html,body{margin:0;padding:0;height:100%;} .wrap{height:100%;} svg{width:100%;height:100%}</style>"
        + "".join(scripts_html) +
        "</head><body><div class='wrap'>"
        # 放置数据容器，避免直接把 md 拼进 JS 造成转义问题
        + f"<script id='mm-data' type='application/json'>{html.escape(json.dumps(md))}</script>"
        + "<svg id='mm-svg'></svg>"
        + init_code.replace("%MD%", "JSON.parse(document.getElementById('mm-data').textContent)") +
        "</div></body></html>"
    )
    # 用单引号包裹 srcdoc，只转义单引号，保持 HTML 语义
    page_attr = page.replace("'", "&#39;")
    return f"<iframe style='width:100%;height:520px;border:1px solid #ccc;' sandbox='allow-scripts allow-same-origin' srcdoc='{page_attr}'></iframe>"


def build_markmap_html_with_data(tree: List[Dict], id_order: List[str], snippets: Dict[str, str]) -> str:
    """与 build_markmap_html 相同的导图渲染，但附加：
    - 在 iframe 内部实现节点点击 → 弹出预览卡片（展示传入的 snippets[id] HTML）
    - 同时 postMessage 给父窗口：{type:'mm-scroll', id}
    不改变导图显示方式。
    """
    # 复用纯导图页面
    base = build_markmap_html(tree)
    # 将 srcdoc 取出，追加增强脚本与数据容器
    import re as _re
    m = _re.search(r"srcdoc='(.*)'", base)
    if not m:
        return base
    src = html.unescape(m.group(1))
    # 插入 ids/snips 数据容器与增强脚本（尽量不影响现有导图）
    enhanced = src.replace(
        "</div></body></html>",
        (
            f"<script id='mm-ids' type='application/json'>{html.escape(json.dumps(id_order))}</script>"
            f"<script id='mm-snips' type='application/json'>{html.escape(json.dumps(snippets or {}))}</script>"
            "<div id='mm-mask' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9998'></div>"
            "<div id='mm-overlay' style='display:none;position:fixed;right:20px;top:20px;background:#fff;border:1px solid #ddd;border-radius:8px;max-width:560px;max-height:70vh;overflow:auto;padding:12px;box-shadow:0 6px 18px rgba(0,0,0,0.2);z-index:9999'>"
            "<a id='mm-close' href='#' style='position:absolute;right:10px;top:8px;color:#666;text-decoration:none;font-size:14px'>关闭</a>"
            "<div class='mm-title' style='font-weight:600;margin-bottom:8px'></div>"
            "<div class='mm-body'></div>"
            "</div>"
            "<script>(function(){try{var svg=document.getElementById('mm-svg');"
            "var ids=JSON.parse(document.getElementById('mm-ids').textContent)||[];"
            "var snips=JSON.parse(document.getElementById('mm-snips').textContent)||{};"
            "var mask=document.getElementById('mm-mask');var ov=document.getElementById('mm-overlay');"
            "var ovTitle=ov.querySelector('.mm-title');var ovBody=ov.querySelector('.mm-body');"
            "function hide(){mask.style.display='none';ov.style.display='none';}"
            "document.getElementById('mm-close').onclick=function(e){e.preventDefault();hide();};"
            "mask.onclick=hide;"
            "setTimeout(function(){var texts=svg.querySelectorAll('g.markmap-node > text');texts.forEach(function(el,i){"
            "el.style.cursor='pointer';el.addEventListener('click',function(){var id=(ids[i]||'');if(!id)return;"
            "ovTitle.textContent=el.textContent||'';ovBody.innerHTML=snips[id]||'';mask.style.display='block';ov.style.display='block';"
            "try{var pdoc=window.parent&&window.parent.document;var pane=pdoc&&pdoc.querySelector('#md_preview');var tgt=pane&&pane.querySelector('#'+id);if(tgt&&pane){pane.scrollTo({top:Math.max(tgt.offsetTop-20,0),behavior:'smooth'});} }catch(e){}"
            "});});},400);}catch(e){console.log(e);}})();</script>"
            "</div></body></html>"
        ),
        1,
    )
    page_attr = enhanced.replace("'", "&#39;")
    return f"<iframe style='width:100%;height:520px;border:1px solid #ccc;' sandbox='allow-scripts allow-same-origin' srcdoc='{page_attr}'></iframe>"


