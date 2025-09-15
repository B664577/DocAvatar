#!/usr/bin/env python3
"""
启动脚本：确保 DotsOCR 插件在 vLLM 服务器启动前被正确加载
"""
import os
import sys
import subprocess

def main():
    # 确保插件被导入
    try:
        import dots_ocr_plugin
        print("✅ DotsOCR 插件加载成功")
        
        # 验证模型注册
        from vllm.model_executor.models import ModelRegistry
        supported_archs = ModelRegistry.get_supported_archs()
        if 'DotsOCR' in supported_archs:
            print("✅ DotsOCR 模型已成功注册到 vLLM")
        else:
            print("❌ DotsOCR 模型未在 vLLM 中注册")
            return 1
            
    except ImportError as e:
        print(f"❌ 插件导入失败: {e}")
        return 1
    
    # 设置环境变量
    env = os.environ.copy()
    env['PYTHONPATH'] = f"{os.getcwd()}/dots_ocr_plugin:{env.get('PYTHONPATH', '')}"
    
    # 构建 vLLM 命令 - 使用简单稳定的参数
    vllm_cmd = [
        'python', './vllm_with_plugin.py', 'serve', 
        './dotsocr/weights/DotsOCR/',
        '--tensor-parallel-size', '1',
        '--gpu-memory-utilization', '0.60',  # 使用60%GPU内存
        '--max-model-len', '4096',           # 进一步降低
        '--served-model-name', 'model',
        '--trust-remote-code'
    ]
    
    print(f"🚀 启动 vLLM 服务器...")
    print(f"命令: {' '.join(vllm_cmd)}")
    
    # 启动 vLLM 服务器
    try:
        subprocess.run(vllm_cmd, env=env, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ vLLM 服务器启动失败: {e}")
        return 1
    except KeyboardInterrupt:
        print("🛑 用户中断")
        return 0
    
    return 0

if __name__ == "__main__":
    sys.exit(main())