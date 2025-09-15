#!/bin/bash
# 测试 vLLM API 脚本

echo "🔄 正在启动 vLLM API 测试..."

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

# 切换到 dotsocr 目录并运行演示
cd dotsocr
echo "🚀 运行 vLLM API 演示..."
python3 ./demo/demo_vllm.py --prompt_mode prompt_layout_all_en

echo "✅ vLLM API 测试完成"