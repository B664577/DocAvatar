#!/bin/bash
# DotsOCR 快速启动脚本
# 提供多种启动选项

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

print_usage() {
    echo -e "${BLUE}DotsOCR 快速启动工具${NC}"
    echo ""
    echo "用法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  demo, gradio, gui     启动增强版 Gradio 界面"
    echo "  all, start-all        🚀 一键启动所有服务+界面"
    echo "  vllm                  仅启动 vLLM 服务器"
    echo "  hf                    启动 HuggingFace 推理演示"
    echo "  cpu                   启动 CPU 推理演示"
    echo "  parser                启动命令行解析器"
    echo "  status                检查服务状态"
    echo "  stop, stop-all        停止所有服务"
    echo "  help, -h, --help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 启动增强版界面（默认）"
    echo "  $0 all                # 🚀 一键启动所有服务"
    echo "  $0 demo               # 启动增强版界面"
    echo "  $0 vllm               # 仅启动 vLLM 服务"
    echo "  $0 status             # 检查服务状态"
    echo ""
}

check_services() {
    echo -e "${BLUE}检查服务状态...${NC}"
    echo ""
    
    # 检查 vLLM 服务
    if curl -s http://localhost:8000/v1/models > /dev/null 2>&1; then
        echo -e "vLLM 服务:     ${GREEN}✅ 运行中${NC} (http://localhost:8000)"
    else
        echo -e "vLLM 服务:     ${YELLOW}⚠️ 未运行${NC}"
    fi
    
    # 检查 Gradio 服务
    if curl -s http://localhost:7860 > /dev/null 2>&1; then
        echo -e "Gradio 界面:   ${GREEN}✅ 运行中${NC} (http://localhost:7860)"
    else
        echo -e "Gradio 界面:   ${YELLOW}⚠️ 未运行${NC}"
    fi
    
    # 检查进程
    echo ""
    echo "相关进程:"
    ps aux | grep -E "(vllm|gradio|enhanced_gradio_demo)" | grep -v grep | while read line; do
        echo "  $line"
    done
}

stop_services() {
    echo -e "${BLUE}停止所有服务...${NC}"
    
    # 停止 Gradio
    pkill -f "demo_gradio.py" 2>/dev/null || true
    pkill -f "enhanced_gradio_demo.py" 2>/dev/null || true
    
    # 停止 vLLM
    pkill -f "vllm serve" 2>/dev/null || true
    pkill -f "start_vllm_with_plugin.py" 2>/dev/null || true
    pkill -f "vllm" 2>/dev/null || true
    
    # 清理PID文件
    rm -f "$PROJECT_ROOT/vllm.pid" "$PROJECT_ROOT/gradio.pid" 2>/dev/null || true
    
    echo -e "${GREEN}✅ 所有服务已停止${NC}"
}

start_vllm_only() {
    echo -e "${BLUE}启动 vLLM 服务器...${NC}"
    cd "$PROJECT_ROOT"
    
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    export PYTHONPATH="$PROJECT_ROOT/dots_ocr_plugin:$PYTHONPATH"
    
    python start_vllm_with_plugin.py
}

start_hf_demo() {
    echo -e "${BLUE}启动 HuggingFace 推理演示...${NC}"
    cd "$PROJECT_ROOT/dotsocr"
    
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    export PYTHONPATH="$PROJECT_ROOT/dotsocr/weights/DotsOCR:$PYTHONPATH"
    
    python demo/demo_hf.py
}

start_cpu_demo() {
    echo -e "${BLUE}启动 CPU 推理演示...${NC}"
    cd "$PROJECT_ROOT"
    
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    
    python enhanced_gradio_demo.py --port 7860 --host 0.0.0.0
}

start_parser() {
    echo -e "${BLUE}启动命令行解析器...${NC}"
    echo "示例用法:"
    echo "  python dots_ocr/parser.py demo/demo_image1.jpg"
    echo "  python dots_ocr/parser.py demo/demo_pdf1.pdf --num_thread 64"
    echo ""
    
    cd "$PROJECT_ROOT/dotsocr"
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    
    python dots_ocr/parser.py "$@"
}

start_enhanced_demo() {
    echo -e "${BLUE}启动增强版 Gradio 界面...${NC}"
    cd "$PROJECT_ROOT"
    
    # 设置环境变量
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    export PYTHONPATH="$PROJECT_ROOT/dots_ocr_plugin:$PYTHONPATH"
    export PYTHONPATH="$PROJECT_ROOT/dotsocr:$PYTHONPATH"
    export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"
    
    # 启动修改后的原版界面
    cd dotsocr
    python demo/demo_gradio.py 7860
}

start_all_services() {
    echo -e "${BLUE}🚀 一键启动所有服务...${NC}"
    
    # 1. 清理现有进程
    stop_services
    sleep 2
    
    # 2. 设置环境
    source /home/long/miniconda3/etc/profile.d/conda.sh
    conda activate dots_ocr
    export PYTHONPATH="$PROJECT_ROOT/dots_ocr_plugin:$PROJECT_ROOT/dotsocr:$PYTHONPATH"
    
    # 3. 后台启动vLLM服务器
    echo -e "${BLUE}启动vLLM服务器...。${NC}"
    cd "$PROJECT_ROOT"
    nohup python start_vllm_with_plugin.py > vllm.log 2>&1 &
    VLLM_PID=$!
    echo $VLLM_PID > vllm.pid
    echo -e "${GREEN}✅ vLLM服务器已启动 (PID: $VLLM_PID)${NC}"
    
    # 4. 后台启动Gradio界面
    echo -e "${BLUE}启动Gradio界面...。${NC}"
    cd "$PROJECT_ROOT/dotsocr"
    nohup python demo/demo_gradio.py 7860 > ../gradio.log 2>&1 &
    GRADIO_PID=$!
    echo $GRADIO_PID > ../gradio.pid
    echo -e "${GREEN}✅ Gradio界面已启动 (PID: $GRADIO_PID)${NC}"
    
    # 5. 等待界面启动
    sleep 3
    if curl -s http://127.0.0.1:7860 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Gradio界面就绪！${NC}"
    else
        echo -e "${YELLOW}⚠️ Gradio界面启动中...。${NC}"
    fi
    
    # 6. 尝试打开浏览器
    if command -v xdg-open > /dev/null; then
        xdg-open http://localhost:7860 > /dev/null 2>&1 &
    elif command -v firefox > /dev/null; then
        firefox http://localhost:7860 > /dev/null 2>&1 &
    fi
    
    # 7. 显示状态信息
    echo ""
    echo "========================================="
    echo -e "${GREEN}🎉 DotsOCR 服务启动成功！${NC}"
    echo "========================================="
    echo ""
    echo -e "${BLUE}📱 界面地址:${NC} http://localhost:7860"
    echo -e "${BLUE}🚀 vLLM API:${NC} http://localhost:8000"
    echo ""
    echo -e "${YELLOW}推理模式:${NC}"
    echo "  • vllm  - 高性能推理 (需等待服务就绪)"
    echo "  • hf    - HuggingFace推理 (立即可用)"
    echo "  • cpu   - CPU推理 (较慢但稳定)"
    echo ""
    echo -e "${BLUE}💡 使用提示:${NC}"
    echo "  1. 在浏览器中打开 http://localhost:7860"
    echo "  2. 在'高级配置'中选择推理模式"
    echo "  3. 上传图像并点击'Parse'解析"
    echo ""
    echo -e "${YELLOW}停止服务:${NC} ./dotsocr.sh stop"
    echo "========================================="
    
    # 8. 后台等待vLLM就绪
    echo -e "${BLUE}vLLM正在加载模型，预计需要2-3分钟...。${NC}"
    (
        local max_attempts=60
        local attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -s http://127.0.0.1:8000/v1/models > /dev/null 2>&1; then
                echo -e "${GREEN}✅ vLLM服务器就绪！${NC}"
                break
            fi
            attempt=$((attempt + 1))
            if [ $((attempt % 12)) -eq 0 ]; then
                local minutes=$((attempt / 12))
                echo -e "${BLUE}[等待中...] ${minutes}分钟${NC}"
            fi
            sleep 5
        done
        if [ $attempt -eq $max_attempts ]; then
            echo -e "${YELLOW}⚠️ vLLM启动超时，但界面仍可使用HF/CPU模式${NC}"
        fi
    ) &
}

# 主逻辑
case "${1:-demo}" in
    "demo"|"gradio"|"gui"|"")
        start_enhanced_demo
        ;;
    "all"|"start-all")
        start_all_services
        ;;
    "vllm")
        start_vllm_only
        ;;
    "hf")
        start_hf_demo
        ;;
    "cpu")
        start_cpu_demo
        ;;
    "parser")
        shift
        start_parser "$@"
        ;;
    "status")
        check_services
        ;;
    "check"|"check-modes")
        echo -e "${BLUE}🔍 正在执行详细状态检查...${NC}"
        source /home/long/miniconda3/etc/profile.d/conda.sh
        conda activate dots_ocr
        python "$PROJECT_ROOT/check_inference_modes.py"
        ;;
    "stop"|"stop-all")
        stop_services
        ;;
    "help"|"-h"|"--help")
        print_usage
        ;;
    *)
        echo "未知选项: $1"
        echo ""
        print_usage
        exit 1
        ;;
esac