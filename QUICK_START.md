# 🚀 DotsOCR Enhanced Demo - 一键启动指南

## 🎯 一键启动（推荐方式）

```bash
# 进入项目目录
cd /home/long/mnt/d/AIPJ/013DocAvatar

# 一键启动增强版界面
./dotsocr.sh
```

**就这么简单！** 脚本会自动：
- ✅ 检查和激活 conda 环境
- ✅ 验证插件安装状态  
- ✅ 清理旧进程
- ✅ 启动增强版 Gradio 界面
- ✅ 自动打开浏览器访问 http://localhost:7860

## 🎮 多种启动方式

```bash
# 启动增强版界面（默认）
./dotsocr.sh demo

# 仅启动 vLLM 服务器
./dotsocr.sh vllm

# 启动 HuggingFace 推理演示
./dotsocr.sh hf

# 启动 CPU 推理演示  
./dotsocr.sh cpu

# 检查服务状态
./dotsocr.sh status

# 停止所有服务
./dotsocr.sh stop

# 查看帮助
./dotsocr.sh help
```

## 🌟 增强版界面特性

### 🔧 多模式推理支持
- **vLLM 模式**: 高性能推理引擎，适合生产环境
- **HuggingFace 模式**: 标准 Transformers 推理，兼容性好  
- **CPU 模式**: 适合低资源环境

### 🖥️ 一键服务管理
- 界面内直接启动/停止 vLLM 服务器
- 实时显示服务状态
- 自动检测端口占用

### ⚙️ 完整解析功能
- 支持多种提示模式
- 边界框区域解析
- 实时结果展示
- JSON 格式输出

## 📱 界面使用流程

1. **选择推理模式** - 根据资源情况选择 vLLM/HF/CPU
2. **启动服务** - 如使用 vLLM，点击"启动 vLLM"按钮
3. **上传图像** - 支持 JPG、PNG 等格式
4. **选择解析模式** - 完整分析、纯文本识别等
5. **开始解析** - 点击"开始解析"查看结果

## 🛠️ 故障排除

### vLLM 启动失败
```bash
# 检查插件状态
./dotsocr.sh status

# 手动重新安装插件
cd dots_ocr_plugin && pip install -e .
```

### 端口被占用
```bash
# 停止所有服务
./dotsocr.sh stop

# 等待几秒后重新启动
./dotsocr.sh demo
```

### 内存不足
```bash
# 使用 CPU 模式
./dotsocr.sh cpu
```

## 📊 系统要求

### 推荐配置
- **内存**: 16GB+ RAM
- **GPU**: 8GB+ VRAM (用于 vLLM/HF 模式)
- **磁盘**: 20GB+ 可用空间

### 最低配置  
- **内存**: 8GB RAM (CPU 模式)
- **GPU**: 无要求 (CPU 模式)
- **磁盘**: 10GB+ 可用空间

## 🎨 自定义配置

编辑 `demo_config.json` 文件可自定义：
- 服务器端口设置
- 模型路径配置  
- UI 主题和布局
- 性能参数调优

## 📞 技术支持

如遇问题，请检查：
1. 系统日志: `./logs/enhanced_demo.log`
2. 服务状态: `./dotsocr.sh status`
3. 环境配置: 确保 `dots_ocr` conda 环境正常

---

**🎉 享受你的 DotsOCR 文档解析之旅！**