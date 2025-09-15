import os
import sys

# 确保当前目录在 Python 路径中
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    from vllm.model_executor.models import ModelRegistry
    from .modeling_dots_ocr_vllm import DotsOCRForCausalLM
    
    # 注册模型
    ModelRegistry.register_model("DotsOCR", DotsOCRForCausalLM)
    print(f"✅ DotsOCR 模型已成功注册到 vLLM ModelRegistry")
    
except ImportError as e:
    print(f"⚠️ 导入模块时出错: {e}")
    # 不抛出异常，允许其他方式加载
except Exception as e:
    print(f"⚠️ 注册模型时出错: {e}")
    # 不抛出异常，允许其他方式加载