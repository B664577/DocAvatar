#!/bin/bash
# DotsOCR vLLM 环境配置脚本

# 激活 conda 环境
source /home/long/miniconda3/etc/profile.d/conda.sh
conda activate dots_ocr

# 设置 Python 路径
export PYTHONPATH="/home/long/mnt/d/AIPJ/013DocAvatar/dots_ocr_plugin:$PYTHONPATH"
export PYTHONPATH="/home/long/mnt/d/AIPJ/013DocAvatar:$PYTHONPATH"

# 设置模型路径
export DOTS_OCR_MODEL_PATH="/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr/weights/DotsOCR"

# 预加载插件
echo "🔄 预加载 DotsOCR 插件..."
python -c "
import sys
sys.path.insert(0, '/home/long/mnt/d/AIPJ/013DocAvatar/dots_ocr_plugin')
import dots_ocr_plugin
from vllm.model_executor.models import ModelRegistry
archs = ModelRegistry.get_supported_archs()
if 'DotsOCR' in archs:
    print('✅ DotsOCR 模型已成功注册')
else:
    print('❌ DotsOCR 模型注册失败')
    exit(1)
"

if [ $? -eq 0 ]; then
    echo "✅ 环境配置成功"
else
    echo "❌ 环境配置失败"
    exit 1
fi