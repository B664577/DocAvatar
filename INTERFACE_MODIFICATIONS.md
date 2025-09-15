# DotsOCR 界面修改总结

## 🎯 修改目标
在原有 Gradio 界面基础上添加推理模式选择功能，支持 vLLM 和 HuggingFace 两种推理后端。

## 🔧 主要修改内容

### 1. 修复 DotsOCRParser 参数问题
- **问题**: 原来的代码使用了不存在的 `device` 和 `model_path` 参数
- **解决**: 查看了 DotsOCRParser 的实际构造函数，使用正确的参数：
  - `ip`: 服务器地址
  - `port`: 服务器端口  
  - `use_hf`: 布尔值，控制是否使用 HuggingFace 模式
  - `dpi`, `min_pixels`, `max_pixels` 等其他参数

### 2. 添加推理模式选择
- **位置**: 在"高级配置"折叠面板中添加
- **选项**: 
  - `vllm`: 使用 vLLM 推理引擎（默认）
  - `hf`: 使用 HuggingFace Transformers 推理
- **界面**: 使用 Radio 组件，不破坏原有布局

### 3. 创建动态解析器管理
- **新增函数**: `get_parser(mode, **kwargs)` 
- **功能**: 根据选择的模式动态创建对应的 DotsOCRParser 实例
- **缓存机制**: 避免重复创建相同配置的解析器

### 4. 修改处理函数
- **函数**: `process_image_inference`
- **新增参数**: `inference_mode` 
- **逻辑**: 根据选择的模式获取对应的解析器进行处理
- **错误处理**: 添加解析器初始化失败的错误处理

## 📱 界面变化

### 原有功能保持不变
- ✅ 文件上传和示例选择
- ✅ 提示模式选择
- ✅ 解析按钮和清除按钮
- ✅ 结果显示（图像、Markdown、JSON）
- ✅ PDF 翻页功能
- ✅ 下载结果功能
- ✅ 所有高级配置选项

### 新增功能
- ✅ 推理模式选择（vLLM/HuggingFace）
- ✅ 动态切换推理后端
- ✅ 模式状态提示

## 🔍 技术细节

### DotsOCRParser 正确参数
```python
# vLLM 模式
parser = DotsOCRParser(
    ip="127.0.0.1",
    port=8000,
    use_hf=False,  # 使用 vLLM
    # 其他参数...
)

# HuggingFace 模式  
parser = DotsOCRParser(
    ip="127.0.0.1",
    port=8000,
    use_hf=True,   # 使用 HuggingFace
    # 其他参数...
)
```

### 界面修改位置
```python
# 在高级配置中添加
with gr.Accordion("🛠️ Advanced Configuration", open=False):
    # 新增推理模式选择
    inference_mode = gr.Radio(
        choices=["vllm", "hf"],
        value="vllm",
        label="🚀 Inference Mode",
        info="Choose inference backend: vLLM (fast) or HuggingFace (compatible)"
    )
    # ... 其他原有配置项保持不变
```

## 🚀 使用方法

### 启动界面
```bash
cd /home/long/mnt/d/AIPJ/013DocAvatar
./dotsocr.sh   # 一键启动修改后的界面
```

### 选择推理模式
1. 展开"Advanced Configuration"面板
2. 在"Inference Mode"中选择：
   - **vLLM**: 高性能推理，需要先启动 vLLM 服务器
   - **HuggingFace**: 兼容性好，直接使用本地模型

### vLLM 模式使用
1. 选择 "vllm" 模式
2. 确保 vLLM 服务器已启动（可用我们的插件启动脚本）
3. 配置正确的服务器 IP 和端口
4. 上传图像并解析

### HuggingFace 模式使用  
1. 选择 "hf" 模式
2. 直接上传图像并解析（无需启动额外服务）
3. 首次使用会自动加载模型（可能较慢）

## ⚠️ 注意事项

1. **HuggingFace 模式**: 
   - 首次加载会较慢
   - 需要足够的显存加载完整模型
   - 推理速度比 vLLM 慢

2. **vLLM 模式**:
   - 需要先启动 vLLM 服务器
   - 推理速度快，适合生产使用
   - 支持并发请求

3. **界面兼容性**:
   - 完全保持原有界面布局
   - 所有原功能正常工作
   - 新功能集成在高级配置中

## 📊 修改文件清单

- ✅ `/dotsocr/demo/demo_gradio.py` - 主要修改文件
- ✅ `/dotsocr.sh` - 更新启动脚本
- ✅ `INTERFACE_MODIFICATIONS.md` - 本文档

所有修改都在原有代码基础上进行，确保向下兼容和功能完整性。