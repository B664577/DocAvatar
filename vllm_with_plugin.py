#!/usr/bin/env python3
"""
自定义 vLLM 入口脚本，确保 DotsOCR 插件被正确加载
"""
import sys
import os

# 添加插件路径
current_dir = os.path.dirname(os.path.abspath(__file__))
plugin_path = os.path.join(current_dir, "dots_ocr_plugin")
if plugin_path not in sys.path:
    sys.path.insert(0, plugin_path)

# 预加载插件
try:
    import dots_ocr_plugin
    print("✅ DotsOCR 插件预加载成功")
except ImportError as e:
    print(f"❌ 插件预加载失败: {e}")
    sys.exit(1)

# 导入并运行原始的 vLLM main 函数
from vllm.entrypoints.cli.main import main

if __name__ == "__main__":
    main()