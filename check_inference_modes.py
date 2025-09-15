#!/usr/bin/env python3
"""
DotsOCR 推理模式状态检查脚本
检查 vLLM、HuggingFace、CPU 三种推理模式的可用性
"""

import sys
import os
import requests
import time
from pathlib import Path

# 颜色定义
class Colors:
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

def print_header(title):
    """打印标题"""
    print(f"\n{Colors.BLUE}{'='*50}{Colors.NC}")
    print(f"{Colors.BLUE}{title:^50}{Colors.NC}")
    print(f"{Colors.BLUE}{'='*50}{Colors.NC}")

def print_status(mode, status, details=""):
    """打印状态信息"""
    if status == "✅":
        color = Colors.GREEN
        status_text = "正常"
    elif status == "❌":
        color = Colors.RED
        status_text = "不可用"
    else:
        color = Colors.YELLOW
        status_text = "警告"
    
    print(f"{color}{mode:15} {status} {status_text}{Colors.NC}")
    if details:
        print(f"{'':15} {details}")

def check_vllm_mode():
    """检查 vLLM 模式状态"""
    print_header("vLLM 推理模式检查")
    
    # 1. 检查进程
    import subprocess
    try:
        result = subprocess.run(['pgrep', '-f', 'vllm'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            print_status("进程状态", "✅", f"运行中 (PID: {', '.join(pids)})")
        else:
            print_status("进程状态", "❌", "vLLM进程未运行")
            return False
    except Exception as e:
        print_status("进程状态", "❌", f"检查失败: {e}")
        return False
    
    # 2. 检查端口
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            print_status("端口状态", "✅", "端口8000响应正常")
        else:
            print_status("端口状态", "⚠️", f"端口响应异常: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print_status("端口状态", "❌", "无法连接到端口8000")
        return False
    except Exception as e:
        print_status("端口状态", "❌", f"连接失败: {e}")
        return False
    
    # 3. 检查模型API
    try:
        response = requests.get("http://127.0.0.1:8000/v1/models", timeout=10)
        if response.status_code == 200:
            models = response.json()
            if models.get('data'):
                model_name = models['data'][0]['id']
                print_status("模型API", "✅", f"模型已加载: {model_name}")
            else:
                print_status("模型API", "⚠️", "API响应但无模型数据")
        else:
            print_status("模型API", "❌", f"API响应错误: {response.status_code}")
            return False
    except Exception as e:
        print_status("模型API", "❌", f"API调用失败: {e}")
        return False
    
    # 4. 测试推理
    try:
        test_payload = {
            "model": "model",
            "messages": [
                {
                    "role": "user", 
                    "content": [
                        {"type": "text", "text": "Hello"}
                    ]
                }
            ],
            "max_tokens": 10
        }
        response = requests.post("http://127.0.0.1:8000/v1/chat/completions", 
                               json=test_payload, timeout=30)
        if response.status_code == 200:
            print_status("推理测试", "✅", "推理功能正常")
            return True
        else:
            print_status("推理测试", "❌", f"推理失败: {response.status_code}")
            return False
    except Exception as e:
        print_status("推理测试", "❌", f"推理测试失败: {e}")
        return False

def check_hf_mode():
    """检查 HuggingFace 模式状态"""
    print_header("HuggingFace 推理模式检查")
    
    # 1. 检查环境
    try:
        import torch
        print_status("PyTorch", "✅", f"版本: {torch.__version__}")
    except ImportError:
        print_status("PyTorch", "❌", "PyTorch未安装")
        return False
    
    # 2. 检查GPU
    try:
        import torch
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            gpu_name = torch.cuda.get_device_name(0)
            print_status("GPU支持", "✅", f"{gpu_count}个GPU可用: {gpu_name}")
        else:
            print_status("GPU支持", "⚠️", "无GPU可用，将使用CPU")
    except Exception as e:
        print_status("GPU支持", "❌", f"GPU检查失败: {e}")
    
    # 3. 检查模型权重
    model_path = Path("/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr/weights/DotsOCR")
    if model_path.exists():
        config_file = model_path / "config.json"
        if config_file.exists():
            print_status("模型权重", "✅", f"模型文件存在: {model_path}")
        else:
            print_status("模型权重", "❌", "缺少config.json文件")
            return False
    else:
        print_status("模型权重", "❌", f"模型目录不存在: {model_path}")
        return False
    
    # 4. 检查依赖库
    try:
        import transformers
        print_status("Transformers", "✅", f"版本: {transformers.__version__}")
    except ImportError:
        print_status("Transformers", "❌", "Transformers未安装")
        return False
    
    # 5. 测试模型加载
    try:
        # 切换到正确的工作目录
        original_cwd = os.getcwd()
        os.chdir("/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr")
        
        sys.path.insert(0, "/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr")
        from dots_ocr.parser import DotsOCRParser
        
        # 创建HF模式的解析器，只传入必要参数
        parser = DotsOCRParser(use_hf=True)
        print_status("模型加载", "✅", "HuggingFace模型加载成功")
        
        # 恢复原来的工作目录
        os.chdir(original_cwd)
        return True
    except Exception as e:
        # 恢复原来的工作目录
        if 'original_cwd' in locals():
            os.chdir(original_cwd)
        print_status("模型加载", "❌", f"模型加载失败: {e}")
        return False

def check_cpu_mode():
    """检查 CPU 模式状态"""
    print_header("CPU 推理模式检查")
    
    # 1. 检查CPU信息
    try:
        import psutil
        cpu_count = psutil.cpu_count()
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        print_status("CPU信息", "✅", f"{cpu_count}核CPU，使用率: {cpu_percent}%")
        print_status("内存信息", "✅", f"总内存: {memory.total//1024//1024//1024}GB，可用: {memory.available//1024//1024//1024}GB")
    except Exception as e:
        print_status("系统信息", "⚠️", f"无法获取系统信息: {e}")
    
    # 2. 检查模型权重（同HF模式）
    model_path = Path("/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr/weights/DotsOCR")
    if model_path.exists():
        print_status("模型权重", "✅", f"模型文件存在: {model_path}")
    else:
        print_status("模型权重", "❌", f"模型目录不存在: {model_path}")
        return False
    
    # 3. 检查依赖
    try:
        import torch
        # 强制CPU模式
        import os
        os.environ['CUDA_VISIBLE_DEVICES'] = ''
        print_status("CPU模式", "✅", "强制使用CPU模式")
    except ImportError:
        print_status("PyTorch", "❌", "PyTorch未安装")
        return False
    
    # 4. 测试CPU模式加载
    try:
        # 切换到正确的工作目录
        original_cwd = os.getcwd()
        os.chdir("/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr")
        
        sys.path.insert(0, "/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr")
        from dots_ocr.parser import DotsOCRParser
        
        # 创建CPU模式的解析器，使用HF后端但强制CPU
        parser = DotsOCRParser(use_hf=True)  # CPU模式也使用HF后端
        print_status("CPU推理", "✅", "CPU模式可用")
        
        # 恢复原来的工作目录
        os.chdir(original_cwd)
        return True
    except Exception as e:
        # 恢复原来的工作目录
        if 'original_cwd' in locals():
            os.chdir(original_cwd)
        print_status("CPU推理", "❌", f"CPU模式测试失败: {e}")
        return False

def check_gradio_interface():
    """检查Gradio界面状态"""
    print_header("Gradio 界面状态检查")
    
    # 1. 检查进程
    import subprocess
    try:
        result = subprocess.run(['pgrep', '-f', 'demo_gradio.py'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            print_status("Gradio进程", "✅", f"运行中 (PID: {', '.join(pids)})")
        else:
            print_status("Gradio进程", "❌", "Gradio进程未运行")
            return False
    except Exception as e:
        print_status("Gradio进程", "❌", f"检查失败: {e}")
        return False
    
    # 2. 检查端口
    try:
        response = requests.get("http://127.0.0.1:7860", timeout=5)
        if response.status_code == 200:
            print_status("界面访问", "✅", "界面可正常访问: http://localhost:7860")
            return True
        else:
            print_status("界面访问", "⚠️", f"界面响应异常: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print_status("界面访问", "❌", "无法连接到端口7860")
        return False
    except Exception as e:
        print_status("界面访问", "❌", f"连接失败: {e}")
        return False

def main():
    """主函数"""
    print(f"{Colors.BLUE}")
    print("="*60)
    print("      DotsOCR 推理模式状态检查工具")
    print("="*60)
    print(f"{Colors.NC}")
    
    results = {}
    
    # 检查Gradio界面
    results['gradio'] = check_gradio_interface()
    
    # 检查三种推理模式
    results['vllm'] = check_vllm_mode()
    results['hf'] = check_hf_mode()
    results['cpu'] = check_cpu_mode()
    
    # 总结报告
    print_header("状态总结")
    
    print(f"📱 Gradio界面:    {'✅ 正常' if results['gradio'] else '❌ 不可用'}")
    print(f"🚀 vLLM模式:      {'✅ 正常' if results['vllm'] else '❌ 不可用'}")
    print(f"🤗 HuggingFace:   {'✅ 正常' if results['hf'] else '❌ 不可用'}")
    print(f"💻 CPU模式:       {'✅ 正常' if results['cpu'] else '❌ 不可用'}")
    
    print(f"\n{Colors.BLUE}推荐使用顺序:{Colors.NC}")
    if results['hf']:
        print(f"  1. {Colors.GREEN}HuggingFace模式{Colors.NC} - 稳定推荐")
    if results['vllm']:
        print(f"  2. {Colors.GREEN}vLLM模式{Colors.NC} - 高性能")
    if results['cpu']:
        print(f"  3. {Colors.YELLOW}CPU模式{Colors.NC} - 备选方案")
    
    # 快速启动建议
    print(f"\n{Colors.BLUE}快速启动建议:{Colors.NC}")
    if not any(results.values()):
        print(f"  {Colors.RED}❌ 所有模式都不可用，请运行: ./dotsocr.sh all{Colors.NC}")
    elif not results['gradio']:
        print(f"  {Colors.YELLOW}⚠️ 界面未启动，请运行: ./dotsocr.sh all{Colors.NC}")
    else:
        print(f"  {Colors.GREEN}✅ 系统运行正常，访问: http://localhost:7860{Colors.NC}")

if __name__ == "__main__":
    main()