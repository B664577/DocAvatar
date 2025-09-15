#!/bin/bash
# 启动 Gradio Web 演示脚本

echo "🔄 正在启动 Gradio Web 演示..."

# 激活 conda 环境
source /home/long/miniconda3/etc/profile.d/conda.sh
conda activate dots_ocr

# 检查 vLLM 服务器是否正在运行
if ! curl -s http://localhost:8000/v1/models > /dev/null; then
    echo "❌ vLLM 服务器未运行，请先启动服务器"
    echo "使用命令：python start_vllm_with_plugin.py"
    exit 1
fi

echo "✅ vLLM 服务器正在运行"

# 切换到 dotsocr 目录并启动 Web 界面
cd dotsocr
echo "🚀 启动 Gradio Web 界面，端口 7860..."
echo "请在浏览器中访问: http://localhost:7860"
python demo/demo_gradio.py 7860