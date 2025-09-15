"""
Enhanced Gradio Demo for DotsOCR with Multiple Inference Modes
支持 vLLM、HuggingFace 和 CPU 推理模式的统一界面
"""

import gradio as gr
import json
import os
import io
import tempfile
import base64
import uuid
import time
import subprocess
import signal
import atexit
import threading
import sys
from pathlib import Path
from PIL import Image
import requests
import psutil

# Add project paths to sys.path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(project_root, 'dotsocr'))
sys.path.insert(0, os.path.join(project_root, 'dots_ocr_plugin'))

# Import DotsOCR components
try:
    from dots_ocr.utils import dict_promptmode_to_prompt
    from dots_ocr.utils.consts import MIN_PIXELS, MAX_PIXELS
    from dots_ocr.utils.demo_utils.display import read_image
    from dots_ocr.utils.doc_utils import load_images_from_pdf
    from dots_ocr.parser import DotsOCRParser
except ImportError as e:
    print(f"Import error: {e}")
    print("Please ensure you're in the correct environment and paths are set properly.")
    sys.exit(1)

# Global variables
vllm_process = None
current_mode = "vllm"
parser_instances = {}

# ==================== Service Management ====================

def check_vllm_server(host="127.0.0.1", port=8000, timeout=5):
    """检查 vLLM 服务器是否运行"""
    try:
        response = requests.get(f"http://{host}:{port}/v1/models", timeout=timeout)
        return response.status_code == 200
    except:
        return False

def start_vllm_server():
    """启动 vLLM 服务器"""
    global vllm_process
    
    if check_vllm_server():
        return "✅ vLLM 服务器已运行"
    
    try:
        # 使用我们的插件化启动脚本
        startup_script = "/home/long/mnt/d/AIPJ/013DocAvatar/start_vllm_with_plugin.py"
        if not os.path.exists(startup_script):
            return "❌ 启动脚本不存在"
        
        # 激活 conda 环境并启动
        cmd = [
            "bash", "-c", 
            f"source /home/long/miniconda3/etc/profile.d/conda.sh && "
            f"conda activate dots_ocr && "
            f"export PYTHONPATH='/home/long/mnt/d/AIPJ/013DocAvatar/dots_ocr_plugin:$PYTHONPATH' && "
            f"python {startup_script}"
        ]
        
        vllm_process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            preexec_fn=os.setsid
        )
        
        # 等待服务器启动
        for i in range(120):  # 等待最多2分钟
            time.sleep(1)
            if check_vllm_server():
                return "✅ vLLM 服务器启动成功"
            if vllm_process.poll() is not None:
                output = vllm_process.stdout.read()
                return f"❌ vLLM 启动失败: {output}"
        
        return "⏳ vLLM 正在启动中，请稍候..."
        
    except Exception as e:
        return f"❌ 启动失败: {str(e)}"

def stop_vllm_server():
    """停止 vLLM 服务器"""
    global vllm_process
    
    try:
        if vllm_process:
            os.killpg(os.getpgid(vllm_process.pid), signal.SIGTERM)
            vllm_process = None
        
        # 清理可能残留的进程
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if 'vllm' in proc.info['name'] or any('vllm' in cmd for cmd in proc.info['cmdline']):
                    proc.terminate()
            except:
                pass
        
        return "✅ vLLM 服务器已停止"
    except Exception as e:
        return f"❌ 停止失败: {str(e)}"

def cleanup_on_exit():
    """程序退出时清理资源"""
    if vllm_process:
        stop_vllm_server()

atexit.register(cleanup_on_exit)

# ==================== Parser Management ====================

def get_parser(mode="vllm"):
    """获取指定模式的解析器实例"""
    global parser_instances
    
    if mode not in parser_instances:
        # 检查 CUDA 可用性
        cuda_available = False
        try:
            import torch
            cuda_available = torch.cuda.is_available()
        except:
            pass
        
        model_path = "/home/long/mnt/d/AIPJ/013DocAvatar/dotsocr/weights/DotsOCR"
        
        if mode == "vllm":
            parser_instances[mode] = DotsOCRParser(
                ip="127.0.0.1",
                port=8000,
                use_hf=False,
                device="cuda" if cuda_available else "cpu",
                min_pixels=MIN_PIXELS,
                max_pixels=MAX_PIXELS
            )
        elif mode == "hf":
            parser_instances[mode] = DotsOCRParser(
                model_path=model_path,
                use_hf=True,
                device="cuda" if cuda_available else "cpu",
                min_pixels=MIN_PIXELS,
                max_pixels=MAX_PIXELS
            )
        elif mode == "cpu":
            parser_instances[mode] = DotsOCRParser(
                model_path=model_path,
                use_hf=True,
                device="cpu",
                min_pixels=MIN_PIXELS,
                max_pixels=MAX_PIXELS
            )
    
    return parser_instances[mode]

# ==================== Core Processing Functions ====================

def process_image(image, prompt_mode, inference_mode, bbox_input=""):
    """处理图像的核心函数"""
    if image is None:
        return None, "请上传图像", None
    
    try:
        # 获取对应模式的解析器
        parser = get_parser(inference_mode)
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp(prefix="dots_ocr_")
        session_id = uuid.uuid4().hex[:8]
        
        # 如果提供了 bbox，解析它
        bbox = None
        if bbox_input.strip():
            try:
                bbox_values = [int(x.strip()) for x in bbox_input.split(',')]
                if len(bbox_values) == 4:
                    bbox = bbox_values
            except:
                pass
        
        # 保存输入图像
        input_path = os.path.join(temp_dir, f"input_{session_id}.png")
        image.save(input_path, "PNG")
        
        # 执行解析
        start_time = time.time()
        
        if bbox:
            # 使用 bbox 模式
            results = parser.parse_image(
                input_path=input_path,
                filename=f"demo_{session_id}",
                prompt_mode="prompt_grounding_ocr",
                save_dir=temp_dir,
                bbox=bbox
            )
        else:
            # 正常解析模式
            results = parser.parse_image(
                input_path=input_path,
                filename=f"demo_{session_id}",
                prompt_mode=prompt_mode,
                save_dir=temp_dir
            )
        
        processing_time = time.time() - start_time
        
        if not results:
            return None, "解析失败：无结果返回", None
        
        result = results[0]
        
        # 获取布局图像
        layout_image = None
        if 'layout_image_path' in result and os.path.exists(result['layout_image_path']):
            layout_image = Image.open(result['layout_image_path'])
        
        # 获取解析结果
        layout_info = ""
        if 'layout_info_path' in result and os.path.exists(result['layout_info_path']):
            with open(result['layout_info_path'], 'r', encoding='utf-8') as f:
                layout_data = json.load(f)
                layout_info = json.dumps(layout_data, ensure_ascii=False, indent=2)
        
        status_msg = f"✅ 解析完成 | 模式: {inference_mode.upper()} | 耗时: {processing_time:.2f}s"
        
        return layout_image, status_msg, layout_info
        
    except Exception as e:
        return None, f"❌ 解析失败: {str(e)}", None

def switch_inference_mode(mode):
    """切换推理模式"""
    global current_mode
    current_mode = mode
    
    status_msgs = []
    
    if mode == "vllm":
        if check_vllm_server():
            status_msgs.append("✅ vLLM 服务器运行中")
        else:
            status_msgs.append("⚠️ vLLM 服务器未启动，请点击启动按钮")
    elif mode == "hf":
        status_msgs.append("✅ 切换到 HuggingFace 模式")
    elif mode == "cpu":
        status_msgs.append("✅ 切换到 CPU 模式")
    
    return f"当前模式: {mode.upper()}\n" + "\n".join(status_msgs)

# ==================== Gradio Interface ====================

def create_interface():
    """创建 Gradio 界面"""
    
    with gr.Blocks(
        title="DotsOCR Enhanced Demo",
        theme=gr.themes.Soft(),
        css="""
        .inference-mode-radio .wrap {
            display: flex !important;
            flex-direction: row !important;
        }
        .inference-mode-radio .wrap > label {
            margin-right: 20px !important;
        }
        .status-box {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px;
            background-color: #f9f9f9;
            margin: 10px 0;
        }
        .control-button {
            margin: 5px;
        }
        """
    ) as demo:
        
        gr.Markdown("""
        # 🚀 DotsOCR Enhanced Demo
        
        ## 功能特点
        - **多模式推理**: 支持 vLLM、HuggingFace、CPU 三种推理模式
        - **一键启动**: 自动管理 vLLM 服务器
        - **实时切换**: 无需重启即可切换推理模式
        - **完整功能**: 支持文档解析、布局检测、OCR 识别
        """)
        
        with gr.Row():
            with gr.Column(scale=1):
                # 推理模式选择
                gr.Markdown("### 🔧 推理模式设置")
                
                inference_mode = gr.Radio(
                    choices=["vllm", "hf", "cpu"],
                    value="vllm",
                    label="推理模式",
                    info="选择推理后端",
                    elem_classes=["inference-mode-radio"]
                )
                
                mode_status = gr.Textbox(
                    value="当前模式: VLLM",
                    label="模式状态",
                    interactive=False,
                    elem_classes=["status-box"]
                )
                
                # vLLM 服务管理
                with gr.Group():
                    gr.Markdown("### 🖥️ vLLM 服务管理")
                    with gr.Row():
                        start_btn = gr.Button("🚀 启动 vLLM", elem_classes=["control-button"])
                        stop_btn = gr.Button("🛑 停止 vLLM", elem_classes=["control-button"])
                    
                    server_status = gr.Textbox(
                        label="服务状态",
                        interactive=False,
                        elem_classes=["status-box"]
                    )
                
                # 解析设置
                gr.Markdown("### ⚙️ 解析设置")
                
                prompt_mode = gr.Dropdown(
                    choices=list(dict_promptmode_to_prompt.keys()),
                    value="prompt_layout_all_en",
                    label="提示模式",
                    info="选择解析任务类型"
                )
                
                bbox_input = gr.Textbox(
                    label="边界框 (可选)",
                    placeholder="格式: x1,y1,x2,y2 (例如: 100,100,500,400)",
                    info="指定区域解析，留空表示全图解析"
                )
            
            with gr.Column(scale=2):
                # 图像输入区域
                gr.Markdown("### 📷 图像输入")
                
                with gr.Row():
                    input_image = gr.Image(
                        label="上传图像",
                        type="pil",
                        height=400
                    )
                    
                    output_image = gr.Image(
                        label="解析结果",
                        type="pil",
                        height=400
                    )
                
                # 处理按钮
                process_btn = gr.Button("🔍 开始解析", variant="primary", size="lg")
                
                # 状态显示
                processing_status = gr.Textbox(
                    label="处理状态",
                    interactive=False,
                    elem_classes=["status-box"]
                )
                
                # 结果展示
                gr.Markdown("### 📋 解析结果")
                result_json = gr.Code(
                    label="JSON 结果",
                    language="json",
                    lines=15
                )
        
        # ==================== Event Handlers ====================
        
        # 推理模式切换
        inference_mode.change(
            fn=switch_inference_mode,
            inputs=[inference_mode],
            outputs=[mode_status]
        )
        
        # vLLM 服务管理
        start_btn.click(
            fn=start_vllm_server,
            outputs=[server_status]
        )
        
        stop_btn.click(
            fn=stop_vllm_server,
            outputs=[server_status]
        )
        
        # 图像处理
        process_btn.click(
            fn=process_image,
            inputs=[input_image, prompt_mode, inference_mode, bbox_input],
            outputs=[output_image, processing_status, result_json]
        )
        
        # 初始化检查
        def initial_check():
            if check_vllm_server():
                return "✅ vLLM 服务器运行中"
            else:
                return "⚠️ vLLM 服务器未启动"
        
        demo.load(
            fn=initial_check,
            outputs=[server_status]
        )
    
    return demo

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="DotsOCR Enhanced Gradio Demo")
    parser.add_argument("--port", type=int, default=7860, help="Gradio server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Gradio server host")
    parser.add_argument("--share", action="store_true", help="Create public link")
    
    args = parser.parse_args()
    
    # 创建并启动界面
    demo = create_interface()
    
    print(f"""
🚀 DotsOCR Enhanced Demo 启动中...

🌐 访问地址: http://localhost:{args.port}
📱 功能特点:
   - 支持 vLLM/HuggingFace/CPU 三种推理模式
   - 一键启动 vLLM 服务器
   - 实时模式切换
   - 完整的文档解析功能

💡 使用提示:
   1. 选择推理模式 (推荐先用 vLLM)
   2. 如使用 vLLM，点击"启动 vLLM"按钮
   3. 上传图像并选择解析模式
   4. 点击"开始解析"查看结果
""")
    
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        inbrowser=True
    )