# DotsOCR vLLM 插件化集成使用指南

## 🎉 成功完成！插件化集成方案

我们成功使用 vLLM 官方插件机制注册了 DotsOCR 模型，避免了直接修改源码的风险。

## 📁 文件结构

```
/home/long/mnt/d/AIPJ/013DocAvatar/
├── dots_ocr_plugin/                 # 插件目录
│   ├── __init__.py                  # 插件注册文件（增强版）
│   ├── setup.py                     # 插件安装配置
│   ├── modeling_dots_ocr_vllm.py    # vLLM 模型实现
│   ├── configuration_dots.py       # 模型配置
│   └── modeling_dots_vision.py     # 视觉模块实现
├── vllm_with_plugin.py              # 自定义 vLLM 入口脚本
├── start_vllm_with_plugin.py        # vLLM 服务器启动脚本
├── setup_env.sh                     # 环境配置脚本
├── test_vllm_api.sh                 # API 测试脚本
└── start_web_demo.sh                # Web 演示启动脚本
```

## 🚀 使用步骤

### 步骤 1：环境验证
```bash
./setup_env.sh
```
✅ 验证插件加载和模型注册是否成功

### 步骤 2：启动 vLLM 服务器
```bash
# 方法1：使用启动脚本（推荐）
python start_vllm_with_plugin.py

# 方法2：手动启动
source /home/long/miniconda3/etc/profile.d/conda.sh
conda activate dots_ocr
export PYTHONPATH="/home/long/mnt/d/AIPJ/013DocAvatar/dots_ocr_plugin:$PYTHONPATH"
python vllm_with_plugin.py serve ./dotsocr/weights/DotsOCR/ \
    --tensor-parallel-size 1 \
    --gpu-memory-utilization 0.85 \
    --chat-template-content-format string \
    --served-model-name model \
    --trust-remote-code
```

### 步骤 3：测试 vLLM API
```bash
./test_vllm_api.sh
```

### 步骤 4：启动 Web 演示
```bash
./start_web_demo.sh
```
然后访问 http://localhost:7860

## 🔧 核心技术要点

### 1. 插件注册机制
- 使用 `ModelRegistry.register_model()` 而非已弃用的 `register()`
- 在 `__init__.py` 中添加错误处理和路径管理

### 2. 多进程环境支持
- 创建自定义 vLLM 入口脚本 `vllm_with_plugin.py`
- 确保插件在所有子进程中都能被正确加载

### 3. 环境配置
- 通过 PYTHONPATH 确保插件路径可见
- 使用启动脚本统一管理环境变量

## ✅ 验证结果

1. **插件注册成功**：`DotsOCR` 已出现在 `ModelRegistry.get_supported_archs()` 中
2. **服务器启动正常**：无 "Cannot find model module" 错误
3. **模型加载进行中**：SafeTensors 检查点正在加载

## 🔄 故障排除

如果遇到问题：
1. 确认 conda 环境 `dots_ocr` 已激活
2. 检查 PYTHONPATH 是否包含插件目录
3. 验证所有依赖文件是否在插件目录中
4. 重新运行环境验证脚本

## 📈 性能优化建议

1. 安装 FlashInfer 以获得更好的采样性能
2. 根据GPU内存调整 `--gpu-memory-utilization` 参数
3. 考虑使用更大的 `--tensor-parallel-size` 进行多GPU推理

## 🎯 成功关键因素

1. **完整的文件复制**：确保所有模型依赖文件都在插件目录中
2. **正确的API使用**：使用新的 `register_model()` 方法
3. **多进程兼容**：通过自定义入口脚本解决子进程加载问题
4. **环境管理**：统一的环境变量和路径配置

这个方案展示了如何在不修改 vLLM 源码的情况下，成功集成自定义视觉语言模型，具有良好的可维护性和可移植性。