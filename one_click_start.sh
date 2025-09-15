#!/bin/bash
# DotsOCR 一键启动脚本
# 自动启动所有服务并打开前端页面

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="/home/long/mnt/d/AIPJ/013DocAvatar"
CONDA_ENV="dots_ocr"
GRADIO_PORT=7860

# 打印彩色消息
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_step() {
    print_message $BLUE "🔄 $1"
}

print_success() {
    print_message $GREEN "✅ $1"
}

print_warning() {
    print_message $YELLOW "⚠️ $1"
}

print_error() {
    print_message $RED "❌ $1"
}

print_info() {
    print_message $CYAN "ℹ️ $1"
}

# 检查是否在项目根目录
check_project_directory() {
    if [ ! -f "$PROJECT_ROOT/enhanced_gradio_demo.py" ]; then
        print_error "未找到项目文件，请确保脚本在正确的项目目录中运行"
        exit 1
    fi
}

# 检查 conda 环境
check_conda_environment() {
    print_step "检查 Conda 环境..."
    
    if ! command -v conda &> /dev/null; then
        print_error "Conda 未安装或未在 PATH 中"
        exit 1
    fi
    
    # 激活 conda 环境
    source /home/long/miniconda3/etc/profile.d/conda.sh
    
    if ! conda env list | grep -q "^$CONDA_ENV "; then
        print_error "Conda 环境 '$CONDA_ENV' 不存在"
        print_info "请先创建并配置 dots_ocr 环境"
        exit 1
    fi
    
    conda activate $CONDA_ENV
    print_success "Conda 环境 '$CONDA_ENV' 已激活"
}

# 检查插件安装
check_plugin_installation() {
    print_step "检查 DotsOCR 插件..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -d "dots_ocr_plugin" ]; then
        print_error "插件目录不存在"
        exit 1
    fi
    
    # 检查插件是否已安装
    if ! python -c "import dots_ocr_plugin" 2>/dev/null; then
        print_step "安装 DotsOCR 插件..."
        cd dots_ocr_plugin
        pip install -e . > /dev/null 2>&1
        cd ..
        print_success "插件安装完成"
    else
        print_success "DotsOCR 插件已安装"
    fi
    
    # 验证插件注册
    if python -c "
import dots_ocr_plugin
from vllm.model_executor.models import ModelRegistry
archs = ModelRegistry.get_supported_archs()
print('DotsOCR' in archs)
" | grep -q "True"; then
        print_success "DotsOCR 模型已成功注册到 vLLM"
    else
        print_warning "DotsOCR 模型注册可能有问题"
    fi
}

# 检查端口占用
check_port_availability() {
    local port=$1
    local service_name=$2
    
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        print_warning "$service_name 端口 $port 已被占用"
        return 1
    fi
    return 0
}

# 清理旧进程
cleanup_processes() {
    print_step "清理旧进程..."
    
    # 清理可能的 Gradio 进程
    pkill -f "enhanced_gradio_demo.py" 2>/dev/null || true
    
    # 清理 vLLM 进程
    pkill -f "vllm serve" 2>/dev/null || true
    pkill -f "start_vllm_with_plugin.py" 2>/dev/null || true
    
    # 等待进程完全结束
    sleep 2
    
    print_success "进程清理完成"
}

# 设置环境变量
setup_environment() {
    print_step "设置环境变量..."
    
    export PYTHONPATH="$PROJECT_ROOT/dots_ocr_plugin:$PYTHONPATH"
    export PYTHONPATH="$PROJECT_ROOT/dotsocr:$PYTHONPATH"
    export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"
    export CUDA_VISIBLE_DEVICES=0
    
    print_success "环境变量设置完成"
}

# 检查系统资源
check_system_resources() {
    print_step "检查系统资源..."
    
    # 检查内存
    memory_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$memory_gb" -lt 16 ]; then
        print_warning "系统内存可能不足 (${memory_gb}GB)，建议使用 CPU 模式"
    fi
    
    # 检查 GPU（使用 Python PyTorch 检测）
    if python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
        gpu_count=$(python -c "import torch; print(torch.cuda.device_count())" 2>/dev/null)
        gpu_name=$(python -c "import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'Unknown')" 2>/dev/null)
        print_success "检测到 GPU: $gpu_name (设备数量: $gpu_count)"
    else
        print_warning "未检测到可用的 CUDA GPU，将使用 CPU 模式"
    fi
}

# 启动增强版 Gradio 界面
start_gradio_interface() {
    print_step "启动增强版 Gradio 界面..."
    
    cd "$PROJECT_ROOT"
    
    # 检查端口
    if ! check_port_availability $GRADIO_PORT "Gradio"; then
        print_info "尝试使用备用端口..."
        GRADIO_PORT=$((GRADIO_PORT + 1))
    fi
    
    # 启动 Gradio 界面
    print_info "启动地址: http://localhost:$GRADIO_PORT"
    print_info "按 Ctrl+C 停止服务"
    
    python enhanced_gradio_demo.py --port $GRADIO_PORT --host 0.0.0.0
}

# 显示启动信息
show_startup_info() {
    echo ""
    print_message $PURPLE "🚀 DotsOCR Enhanced Demo 一键启动"
    echo ""
    print_info "项目路径: $PROJECT_ROOT"
    print_info "Conda 环境: $CONDA_ENV"
    print_info "访问地址: http://localhost:$GRADIO_PORT"
    echo ""
    print_message $CYAN "📋 功能特性:"
    echo "   • 支持 vLLM/HuggingFace/CPU 三种推理模式"
    echo "   • 一键启动 vLLM 服务器"
    echo "   • 实时模式切换"
    echo "   • 完整的文档解析功能"
    echo ""
    print_message $YELLOW "💡 使用建议:"
    echo "   1. 首次使用建议选择 vLLM 模式获得最佳性能"
    echo "   2. 内存不足时可选择 CPU 模式"
    echo "   3. 点击界面中的'启动 vLLM'按钮启动推理服务"
    echo ""
}

# 错误处理
handle_error() {
    local exit_code=$?
    print_error "启动过程中发生错误 (退出码: $exit_code)"
    print_info "请检查错误信息并重试"
    cleanup_processes
    exit $exit_code
}

# 信号处理 - 优雅退出
handle_sigint() {
    echo ""
    print_info "收到停止信号，正在清理..."
    cleanup_processes
    print_success "服务已停止"
    exit 0
}

# 主函数
main() {
    # 设置错误处理
    trap handle_error ERR
    trap handle_sigint INT TERM
    
    # 显示启动信息
    show_startup_info
    
    # 执行检查和初始化步骤
    check_project_directory
    check_conda_environment
    check_plugin_installation
    check_system_resources
    cleanup_processes
    setup_environment
    
    print_success "所有初始化检查完成！"
    echo ""
    
    # 启动服务
    start_gradio_interface
}

# 如果直接运行此脚本
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi