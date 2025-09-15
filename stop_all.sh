#!/bin/bash
# 停止所有DotsOCR服务

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}🛑 正在停止DotsOCR服务...${NC}"

# 停止PID文件中的进程
if [ -f vllm.pid ]; then
    VLLM_PID=$(cat vllm.pid)
    if kill -0 $VLLM_PID 2>/dev/null; then
        kill $VLLM_PID
        echo -e "${GREEN}✅ 已停止vLLM服务器 (PID: $VLLM_PID)${NC}"
    fi
    rm -f vllm.pid
fi

if [ -f gradio.pid ]; then
    GRADIO_PID=$(cat gradio.pid)
    if kill -0 $GRADIO_PID 2>/dev/null; then
        kill $GRADIO_PID
        echo -e "${GREEN}✅ 已停止Gradio界面 (PID: $GRADIO_PID)${NC}"
    fi
    rm -f gradio.pid
fi

# 强制清理残留进程
pkill -f "demo_gradio.py" 2>/dev/null || true
pkill -f "vllm" 2>/dev/null || true
pkill -f "start_vllm_with_plugin" 2>/dev/null || true

echo -e "${GREEN}🎯 所有服务已停止${NC}"
