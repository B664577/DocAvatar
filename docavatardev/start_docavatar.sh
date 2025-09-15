#!/bin/bash
# DocAvatar 开发专用一键启动脚本（不改动原项目与 dotsocr.sh）

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}$*${NC}"; }
log_ok()   { echo -e "${GREEN}$*${NC}"; }
log_warn() { echo -e "${YELLOW}$*${NC}"; }
log_err()  { echo -e "${RED}$*${NC}"; }

log_info "🔧 初始化环境..."

# 1) 预清理：停止原项目服务（不改动原脚本逻辑，仅调用其 stop）
if [ -f "$PROJECT_ROOT/dotsocr.sh" ]; then
  log_info "🧹 清理原项目服务: ./dotsocr.sh stop"
  bash -c "cd '$PROJECT_ROOT' && ./dotsocr.sh stop" || true
fi

# 也清理可能残留的开发版界面与 API
pkill -f "docavatar_gradio.py" 2>/dev/null || true
pkill -f "dotsocr/api/server.py" 2>/dev/null || true

# 2) 加载 conda 环境：docavatar（严格使用指定环境）
if [ -f "/home/long/miniconda3/etc/profile.d/conda.sh" ]; then
  # shellcheck disable=SC1091
  source /home/long/miniconda3/etc/profile.d/conda.sh
else
  log_err "未找到 conda.sh，请确认 Miniconda/Anaconda 安装路径。"
  exit 1
fi

log_info "📦 激活环境: conda activate docavatar"
conda activate docavatar || { log_err "激活 docavatar 失败"; exit 1; }

# 打印当前环境信息
PY_BIN=$(python -c 'import sys; print(sys.executable)')
CONDA_ENV=${CONDA_DEFAULT_ENV:-unknown}
log_info "🔎 当前环境: ${CONDA_ENV} (${PY_BIN})"
python - <<'PY'
try:
    import torch
    ver = getattr(torch, "__version__", "?")
    has_cuda = bool(getattr(torch, "cuda", None) and torch.cuda.is_available())
    cuda_ver = getattr(getattr(torch, "version", None), "cuda", None)
    print(f"[torch] {ver} | cuda_available={has_cuda} | cuda={cuda_ver}")
except Exception as e:
    print(f"[torch] ERR: {e}")
try:
    import vllm  # type: ignore
    print("[vllm] OK")
except Exception as e:
    print(f"[vllm] ERR: {e}")
PY

# 3) 统一环境校验（严格版本）
PY_BIN=$(python -c 'import sys; print(sys.executable)')
CONDA_ENV=${CONDA_DEFAULT_ENV:-unknown}
log_info "🔎 当前环境: ${CONDA_ENV} (${PY_BIN})"

# Torch 校验
python - <<'PY'
try:
    import torch
    ver = getattr(torch, "__version__", "?")
    ok = ver.startswith("2.7.0")
    has_cuda = bool(getattr(torch, "cuda", None) and torch.cuda.is_available())
    cuda_ver = getattr(getattr(torch, "version", None), "cuda", None)
    print(f"[torch] {ver} | ok={ok} | cuda_available={has_cuda} | cuda={cuda_ver}")
except Exception as e:
    print(f"[torch] ERR: {e}")
PY

# 4) 解析权重路径（支持传入父目录，例如 .../weights 会自动使用其中的 DotsOCR 子目录）
HF_INCOMING_PATH="${HF_MODEL_PATH:-/home/long/mnt/d/AIPJ/016DocAvatar/dotsocr/weights}"

# 若传入的是父目录且存在 DotsOCR 子目录，则自动使用该子目录
if [ -d "$HF_INCOMING_PATH/DotsOCR" ]; then
  HF_MODEL_PATH="$HF_INCOMING_PATH/DotsOCR"
else
  HF_MODEL_PATH="$HF_INCOMING_PATH"
fi

MODEL_DIR_NAME="$(basename "$HF_MODEL_PATH")"
MODEL_PARENT_DIR="$(dirname "$HF_MODEL_PATH")"

if [ ! -d "$HF_MODEL_PATH" ]; then
  log_warn "未找到权重目录: $HF_MODEL_PATH"
  log_warn "请设置环境变量 HF_MODEL_PATH 指向实际的权重目录（目录名不能包含点号）"
else
  log_info "使用权重目录: $HF_MODEL_PATH"
fi

# 5) 设置 PYTHONPATH（对齐官方：加入权重父目录；同时加入项目依赖）
export PYTHONPATH="$MODEL_PARENT_DIR:$PROJECT_ROOT/dotsocr:$PROJECT_ROOT/dots_ocr_plugin:$PYTHONPATH"
log_info "PYTHONPATH 已设置: $PYTHONPATH"
export DOTS_WEIGHTS_DIR="$HF_MODEL_PATH"
log_info "DOTS_WEIGHTS_DIR=$DOTS_WEIGHTS_DIR"
# 增大读取超时，避免大文件/慢设备导致 API 超时
export DOTS_READ_TIMEOUT_SECS=${DOTS_READ_TIMEOUT_SECS:-1800}
log_info "DOTS_READ_TIMEOUT_SECS=$DOTS_READ_TIMEOUT_SECS"

# 6) 构建 flash-attn（如未安装，同步执行，输出日志到 flashattn_build.log）
log_info "⚙️ 检查/构建 flash-attn（HF 加速）..."
python - <<'PY'
import importlib.util, os, shutil, sys, subprocess

def which(x):
    return shutil.which(x) is not None

has_fa = importlib.util.find_spec('flash_attn') is not None
if has_fa:
    print('[flash-attn] already installed')
    sys.exit(0)

# 发现 CUDA_HOME
cuda_home = os.environ.get('CUDA_HOME')
if not cuda_home:
    cands = ['/usr/local/cuda', '/usr/local/cuda-12.8', '/usr/lib/cuda']
    nvcc = shutil.which('nvcc')
    if nvcc:
        cands.insert(0, os.path.dirname(os.path.dirname(nvcc)))
    for c in cands:
        if os.path.isdir(c):
            cuda_home = c
            break
if cuda_home:
    os.environ['CUDA_HOME'] = cuda_home
    print('[flash-attn] CUDA_HOME=', cuda_home)
else:
    print('[flash-attn] WARN: CUDA_HOME not found; build may fail')

log = os.path.join(os.getcwd(), 'flashattn_build.log')
cmds = [
    [sys.executable, '-m', 'pip', 'install', '-U', 'pip', 'setuptools', 'wheel', 'packaging', 'cmake', 'ninja'],
]
# 依次尝试多个版本
for ver in ['2.6.3', '2.7.4.post1', '2.7.2', '2.6.1']:
    cmds.append([sys.executable, '-m', 'pip', 'install', '--no-cache-dir', '--default-timeout', '1800', f'flash-attn=={ver}', '-v'])

with open(log, 'w') as f:
    rc = 0
    for c in cmds:
        f.write('$ ' + ' '.join(c) + '\n')
        f.flush()
        p = subprocess.run(c, stdout=f, stderr=subprocess.STDOUT)
        rc = p.returncode
        if rc != 0:
            f.write(f'cmd failed with code {rc}\n')
        # 检查是否已装上
        if importlib.util.find_spec('flash_attn') is not None:
            f.write('flash-attn import OK\n')
            print('[flash-attn] build OK')
            sys.exit(0)

print('[flash-attn] build FAILED, details in flashattn_build.log')
sys.exit(0)
PY

# 6) 安装/校验 vLLM（仅检测，不自动更换环境）
python - <<'PY'
import importlib.util
print("[vllm] installed=", importlib.util.find_spec("vllm") is not None)
PY

# 7) 注入 vLLM CLI 对模型导入（按官方要求，使用自定义目录名）
VLLM_BIN="$(which vllm || true)"
if [ -n "$VLLM_BIN" ]; then
  if ! grep -q "modeling_dots_ocr_vllm" "$VLLM_BIN" 2>/dev/null; then
    log_info "注入 vLLM CLI 导入: from ${MODEL_DIR_NAME} import modeling_dots_ocr_vllm"
    sed -i "/^from vllm\\.entrypoints\\.cli\\.main import main$/a\\
from ${MODEL_DIR_NAME} import modeling_dots_ocr_vllm" "$VLLM_BIN" || true
  else
    log_info "已存在 vLLM CLI 注入，跳过"
  fi
else
  log_warn "未找到 vllm 可执行文件（which vllm 为空），请先在 docavatar 环境安装 vllm==0.9.1"
fi

# 8) 启动 vLLM（严格官方方式，使用 vllm serve）
log_info "🚀 启动 vLLM 服务器 (vllm serve)..."
cd "$PROJECT_ROOT"
if [ -n "$VLLM_BIN" ]; then
  # 仅当 flash-attn 不可用或 GPU 不支持时才切换到 SDPA
  CHECK_FA=$(python - <<'PY'
import importlib.util, torch
fa_ok = importlib.util.find_spec('flash_attn') is not None
gpu_ok = torch.cuda.is_available()
print('OK' if (fa_ok and gpu_ok) else 'NO')
PY
  )
  if echo "$CHECK_FA" | grep -q OK; then
    unset VLLM_ATTENTION_BACKEND
    unset VLLM_USE_FLASH_ATTENTION
    log_info "注意力实现：优先使用 flash-attn（检测到可用）"
  else
    export VLLM_ATTENTION_BACKEND=SDPA
    export VLLM_USE_FLASH_ATTENTION=0
    log_warn "flash-attn 不可用或 GPU 不支持，降级到 SDPA"
  fi
  nohup bash -lc "CUDA_VISIBLE_DEVICES=0 vllm serve '$HF_MODEL_PATH' \
    --tensor-parallel-size 1 \
    --gpu-memory-utilization 0.75 \
    --max-model-len 16384 \
    --chat-template-content-format string \
    --served-model-name model \
    --trust-remote-code" > vllm.log 2>&1 &
  VLLM_PID=$!
  echo $VLLM_PID > vllm.pid
  log_ok "vLLM 已启动 (PID: $VLLM_PID) · 模型: $HF_MODEL_PATH"
else
  log_err "vLLM 未安装或未找到。请先在 docavatar 环境执行: pip install -i https://pypi.org/simple --no-cache-dir --default-timeout 600 vllm==0.9.1"
fi

# 9) 启动 API 服务（8080，后台，默认使用 HF；vLLM 后台加载中可随时切换）
log_info "🌐 启动 API 服务 (FastAPI on 8080, mode=hf 默认；可随时切换 vllm/hf/cpu)..."
export DOTS_MODE=hf
export DOTS_VLLM_IP=127.0.0.1
export DOTS_VLLM_PORT=8000
export DOTS_MODEL_NAME=model
# 限制单次生成 token 上限，避免超过上下文报 400（对用户透明，可按需再调）
export DOTS_MAX_COMPLETION_TOKENS=${DOTS_MAX_COMPLETION_TOKENS:-1024}
# 控制每次 PDF 页面并发（vllm 侧更稳）
export DOTS_NUM_THREAD=${DOTS_NUM_THREAD:-2}
# 自动检测 flash-attn 是否可用，不可用则退回 sdpa 以避免无谓的 fallback 日志
HAS_FA=$(python - <<'PY'
import importlib.util
print('1' if importlib.util.find_spec('flash_attn') is not None else '0')
PY
)
if [ "$HAS_FA" = "1" ]; then
  export DOTS_ATTN_IMPL=flash_attention_2
  log_info "注意力实现: flash_attention_2 (flash-attn 已安装)"
else
  export DOTS_ATTN_IMPL=sdpa
  log_warn "未检测到 flash-attn，将使用 sdpa（可用 GPU 仍会加速；日志不再提示 fallback）"
fi
nohup python dotsocr/api/server.py > api.log 2>&1 &
API_PID=$!
echo $API_PID > api.pid
sleep 2
if curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
  log_ok "API 就绪 (http://127.0.0.1:8080)"
else
  log_warn "API 启动中... 可稍后访问 /health 检查"
fi

# 10) 启动新的 Gradio 界面（后台）
# 并同步启动 automindmap (npm start) 以避免首次点击延迟
export AUTOMINDMAP_PORT=${AUTOMINDMAP_PORT:-5173}
# 固定端口策略：内部 Gradio 仍监听 7860；对外统一转发到 10222
export GRADIO_INTERNAL_PORT=${GRADIO_INTERNAL_PORT:-7860}
export GRADIO_PUBLIC_PORT=${GRADIO_PUBLIC_PORT:-10222}
# 供 gradio 读取的环境变量（内部实际监听端口）
export GRADIO_PORT="$GRADIO_INTERNAL_PORT"
export GRADIO_SERVER_PORT="$GRADIO_INTERNAL_PORT"
# 绑定地址用于 dev server 监听，公开访问使用 PUBLIC_HOST（供浏览器/iframe 访问）
export AUTOMINDMAP_BIND=${AUTOMINDMAP_BIND:-0.0.0.0}
export AUTOMINDMAP_PUBLIC_HOST=${AUTOMINDMAP_PUBLIC_HOST:-localhost}
export AUTOMINDMAP_HOST=${AUTOMINDMAP_HOST:-$AUTOMINDMAP_PUBLIC_HOST}
export AUTOMINDMAP_LEFT_CROP=${AUTOMINDMAP_LEFT_CROP:-520}

if [ -d "$SCRIPT_DIR/automindmap" ]; then
  log_info "🧩 启动 automindmap (npm start on ${AUTOMINDMAP_HOST}:${AUTOMINDMAP_PORT})..."
  if command -v npm >/dev/null 2>&1; then
    (
      cd "$SCRIPT_DIR/automindmap"
      # 先杀掉可能残留的旧进程，避免端口被占用导致自动换端口
      pkill -f "docavatardev/automindmap/server.js" 2>/dev/null || true
      pkill -f "node .*automindmap/server.js" 2>/dev/null || true
      if [ ! -d node_modules ]; then
        npm ci || npm install
      fi
      HOST="${AUTOMINDMAP_BIND}" PORT="${AUTOMINDMAP_PORT}" nohup npm start > automindmap.log 2>&1 &
      echo $! > automindmap.pid
    )
    log_ok "automindmap 已启动 (监听 ${AUTOMINDMAP_BIND}:${AUTOMINDMAP_PORT} · 访问 http://${AUTOMINDMAP_PUBLIC_HOST}:${AUTOMINDMAP_PORT})"
  else
    log_warn "未检测到 npm，已跳过 automindmap 启动。请安装 Node.js 后重试。"
  fi
fi
# 清理前端与后端缓存目录，保证“重跑即新结果”；随后立即重建必要目录
rm -rf "$PROJECT_ROOT/dotsocr/api/cache" "$PROJECT_ROOT/dotsocr/api/user_md" "$PROJECT_ROOT/output_api" "$PROJECT_ROOT/docavatardev/output/parsed" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/dotsocr/api/cache" "$PROJECT_ROOT/dotsocr/api/user_md" "$PROJECT_ROOT/output_api" "$PROJECT_ROOT/docavatardev/output/parsed" 2>/dev/null || true

log_info "🖼️ 启动 DocAvatar Gradio 界面..."
nohup bash -lc "GRADIO_PORT=$GRADIO_INTERNAL_PORT GRADIO_SERVER_PORT=$GRADIO_INTERNAL_PORT python '$SCRIPT_DIR/docavatar_gradio.py'" > "$PROJECT_ROOT/docavatar_gradio.log" 2>&1 &
GRADIO_PID=$!
echo $GRADIO_PID > "$PROJECT_ROOT/docavatar_gradio.pid"

# 启动 10222 → 7860 的本地转发代理（HTTP + WebSocket）
if command -v node >/dev/null 2>&1; then
  pkill -f "docavatardev/forward_10222.js" 2>/dev/null || true
  nohup bash -lc "GRADIO_INTERNAL_PORT=$GRADIO_INTERNAL_PORT GRADIO_PUBLIC_PORT=$GRADIO_PUBLIC_PORT node '$SCRIPT_DIR/forward_10222.js'" > "$PROJECT_ROOT/forward_10222.log" 2>&1 &
  echo $! > "$PROJECT_ROOT/forward_10222.pid"
  log_ok "转发已启用: http://localhost:${GRADIO_PUBLIC_PORT} -> http://127.0.0.1:${GRADIO_INTERNAL_PORT}"
else
  log_warn "未检测到 node，无法启用端口转发。请安装 Node.js 或使用 nginx/socat 自行转发 ${GRADIO_PUBLIC_PORT} -> ${GRADIO_INTERNAL_PORT}."
fi

sleep 3
if curl -s http://127.0.0.1:${GRADIO_INTERNAL_PORT} > /dev/null 2>&1; then
  log_ok "Gradio(内部) 就绪！(http://127.0.0.1:${GRADIO_INTERNAL_PORT})"
  log_info "对外访问请使用: http://localhost:${GRADIO_PUBLIC_PORT}"
  log_info "Automindmap 目标: http://${AUTOMINDMAP_PUBLIC_HOST}:${AUTOMINDMAP_PORT}"
else
  log_warn "Gradio 界面启动中..."
fi

# 11) 打开浏览器
sleep 5  # 给Gradio更多时间完全启动
log_info "检测浏览器并打开界面..."

# WSL环境特殊处理
if grep -q Microsoft /proc/version 2>/dev/null; then
  log_info "检测到WSL环境，尝试使用Windows浏览器..."
  # 尝试通过WSL打开Windows浏览器
  if command -v cmd.exe > /dev/null 2>&1; then
    cmd.exe /c start "http://localhost:${GRADIO_PUBLIC_PORT}" > /dev/null 2>&1 &
    log_ok "已通过Windows浏览器打开"
  elif command -v powershell.exe > /dev/null 2>&1; then
    powershell.exe -Command "Start-Process 'http://localhost:${GRADIO_PUBLIC_PORT}'" > /dev/null 2>&1 &
    log_ok "已通过PowerShell打开"
  else
    log_warn "WSL环境下未找到Windows命令，请手动访问: http://localhost:${GRADIO_PUBLIC_PORT}"
  fi
elif command -v xdg-open > /dev/null 2>&1; then
  log_info "正在打开浏览器..."
  xdg-open "http://localhost:${GRADIO_PUBLIC_PORT}" > /dev/null 2>&1 &
  log_ok "已通过xdg-open打开"
elif command -v firefox > /dev/null 2>&1; then
  log_info "正在用 Firefox 打开浏览器..."
  firefox "http://localhost:${GRADIO_PUBLIC_PORT}" > /dev/null 2>&1 &
  log_ok "已通过Firefox打开"
elif command -v google-chrome > /dev/null 2>&1; then
  log_info "正在用 Chrome 打开浏览器..."
  google-chrome "http://localhost:${GRADIO_PUBLIC_PORT}" > /dev/null 2>&1 &
  log_ok "已通过Chrome打开"
else
  log_warn "未找到浏览器，请手动访问: http://localhost:${GRADIO_PUBLIC_PORT}"
fi

echo ""
echo "========================================="
log_ok "🎉 DocAvatar 开发环境启动成功！"
echo "========================================="
echo -e "${BLUE}📱 界面地址(对外):${NC} http://localhost:${GRADIO_PUBLIC_PORT}"
echo -e "${BLUE}📦 内部 Gradio 端口:${NC} http://127.0.0.1:${GRADIO_INTERNAL_PORT}"
echo -e "${BLUE}🚀 vLLM API:${NC} http://localhost:8000"
echo -e "${BLUE}🔗 DocAvatar API:${NC} http://localhost:8080"
echo ""
echo -e "${YELLOW}提示:${NC} 默认 API 模式为 hf；可通过 query 'mode=vllm|hf|cpu' 切换。"
echo -e "${YELLOW}停止:${NC} 可运行 ./dotsocr.sh stop 停止 vLLM；或 pkill -f docavatar_gradio.py 停止新界面。"
echo "========================================="

# 12) 在 docavatar 环境后台构建 flash-attn（如未安装且 GPU 可用），日志输出到 flashattn_build.log
python - <<'PY' > /dev/null 2>&1 || true
import importlib.util, torch, os, subprocess, sys
need = importlib.util.find_spec('flash_attn') is None
gpu_ok = torch.cuda.is_available()
if need and gpu_ok:
    log = os.path.join(os.getcwd(), 'flashattn_build.log')
    cmd = [
        sys.executable, '-m', 'pip', 'install', '--no-cache-dir', '--default-timeout', '1200',
        'flash-attn==2.6.3'
    ]
    with open(log, 'w') as f:
        f.write('Building flash-attn from source...\n')
        f.flush()
        subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT)
PY

# 12) 后台实时跟随日志到终端（可 Ctrl+C 退出）
log_info "📜 跟随日志：vLLM 与 API（Ctrl+C 退出，服务不停止）"
(
  echo "--- tail -f vllm.log ---";
  tail -n 20 -f vllm.log &
  T1=$!
  echo "--- tail -f api.log ---";
  tail -n 20 -f api.log &
  T2=$!
  wait $T1 $T2
) || true


