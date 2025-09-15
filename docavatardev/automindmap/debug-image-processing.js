// 图片处理调试工具
class ImageProcessingDebugger {
    constructor() {
        this.debugInfo = {};
        this.init();
    }

    init() {
        this.addDebugPanel();
        this.interceptImageProcessing();
    }

    addDebugPanel() {
        // 创建调试面板
        const debugPanel = document.createElement('div');
        debugPanel.id = 'image-debug-panel';
        debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 400px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            overflow-y: auto;
            display: none;
        `;

        debugPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #4CAF50;">图片处理调试</h3>
                <button onclick="this.parentElement.parentElement.style.display='none'" 
                        style="background: #f44336; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer;">×</button>
            </div>
            <div id="debug-content"></div>
            <div style="margin-top: 10px;">
                <button onclick="imageDebugger.diagnosePageState()" 
                        style="background: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px; font-size: 11px;">
                    诊断页面
                </button>
                <button onclick="imageDebugger.testScreenshot()" 
                        style="background: #9C27B0; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px; font-size: 11px;">
                    测试截图
                </button>
            </div>
            <div style="margin-top: 5px;">
                <button onclick="imageDebugger.analyzeCurrentImage()" 
                        style="background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px; font-size: 11px;">
                    分析图片
                </button>
                <button onclick="imageDebugger.clearDebugInfo()" 
                        style="background: #FF9800; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                    清除日志
                </button>
            </div>
        `;

        document.body.appendChild(debugPanel);

        // 添加快捷键显示/隐藏调试面板
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                const panel = document.getElementById('image-debug-panel');
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            }
        });
    }

    interceptImageProcessing() {
        // 等待aiFeatures加载完成
        const waitForAIFeatures = () => {
            if (window.aiFeatures) {
                this.setupInterception();
            } else {
                setTimeout(waitForAIFeatures, 100);
            }
        };
        waitForAIFeatures();
    }

    setupInterception() {
        // 拦截截图功能
        const originalCaptureScreenshot = window.aiFeatures.captureScreenshot;
        if (originalCaptureScreenshot) {
            window.aiFeatures.captureScreenshot = async function(x, y, width, height) {
                imageDebugger.logDebugInfo('截图开始', {
                    position: { x, y },
                    size: { width, height },
                    timestamp: new Date().toISOString()
                });

                try {
                    const result = await originalCaptureScreenshot.call(this, x, y, width, height);
                    
                    // 分析截图结果
                    if (this.selectedContent && this.selectedContent.type === 'image') {
                        imageDebugger.analyzeImageData(this.selectedContent);
                        imageDebugger.logDebugInfo('截图成功', {
                            imageSize: this.selectedContent.metadata,
                            dataLength: this.selectedContent.data.length
                        });
                    } else {
                        imageDebugger.logDebugInfo('截图异常', {
                            error: '截图完成但没有生成有效的图片数据'
                        });
                    }
                    
                    return result;
                } catch (error) {
                    imageDebugger.logDebugInfo('截图失败', {
                        error: error.message,
                        stack: error.stack
                    });
                    throw error;
                }
            };
        }

        // 拦截开始截图功能
        const originalStartScreenshot = window.aiFeatures.startScreenshot;
        if (originalStartScreenshot) {
            window.aiFeatures.startScreenshot = function() {
                imageDebugger.logDebugInfo('开始截图模式', {
                    contentViewer: {
                        exists: !!document.getElementById('content-viewer'),
                        hasContent: document.getElementById('content-viewer') ? document.getElementById('content-viewer').children.length > 0 : false
                    }
                });
                return originalStartScreenshot.call(this);
            };
        }

        // 拦截AI处理功能
        const originalProcessWithAI = window.aiFeatures.processWithAI;
        if (originalProcessWithAI) {
            window.aiFeatures.processWithAI = async function() {
                if (this.selectedContent && this.selectedContent.type === 'image') {
                    imageDebugger.logDebugInfo('AI处理开始', {
                        model: document.getElementById('ai-model-select').value,
                        imageSize: this.selectedContent.metadata,
                        timestamp: new Date().toISOString()
                    });
                }

                try {
                    const result = await originalProcessWithAI.call(this);
                    
                    if (this.selectedContent && this.selectedContent.type === 'image') {
                        const resultText = document.getElementById('markdown-input').value;
                        imageDebugger.logDebugInfo('AI处理完成', {
                            resultLength: resultText.length,
                            resultPreview: resultText.substring(0, 200) + '...',
                            timestamp: new Date().toISOString()
                        });
                    }
                    
                    return result;
                } catch (error) {
                    imageDebugger.logDebugInfo('AI处理失败', {
                        error: error.message,
                        model: document.getElementById('ai-model-select').value
                    });
                    throw error;
                }
            };
        }

        this.logDebugInfo('调试工具已激活', {
            captureScreenshot: !!originalCaptureScreenshot,
            startScreenshot: !!originalStartScreenshot,
            processWithAI: !!originalProcessWithAI
        });
    }

    logDebugInfo(event, data) {
        const timestamp = new Date().toLocaleTimeString();
        this.debugInfo[timestamp] = { event, data };
        this.updateDebugPanel();
    }

    updateDebugPanel() {
        const content = document.getElementById('debug-content');
        if (!content) return;

        const entries = Object.entries(this.debugInfo).slice(-10); // 只显示最近10条
        content.innerHTML = entries.map(([time, info]) => `
            <div style="margin-bottom: 8px; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 3px;">
                <div style="color: #4CAF50; font-weight: bold;">${time} - ${info.event}</div>
                <div style="color: #ccc; font-size: 11px; margin-top: 2px;">
                    ${JSON.stringify(info.data, null, 2)}
                </div>
            </div>
        `).join('');

        // 自动滚动到底部
        content.scrollTop = content.scrollHeight;
    }

    analyzeImageData(imageContent) {
        if (!imageContent || imageContent.type !== 'image') {
            this.logDebugInfo('图片分析', { error: '没有有效的图片数据' });
            return;
        }

        try {
            // 分析图片基本信息
            const img = new Image();
            img.onload = () => {
                const analysis = {
                    dimensions: `${img.width}x${img.height}`,
                    aspectRatio: (img.width / img.height).toFixed(2),
                    dataSize: Math.round(imageContent.data.length / 1024) + 'KB',
                    format: imageContent.data.split(';')[0].split(':')[1],
                    quality: this.estimateImageQuality(img),
                    textReadability: this.estimateTextReadability(img)
                };

                this.logDebugInfo('图片质量分析', analysis);
                this.generateRecommendations(analysis);
            };

            img.onerror = () => {
                this.logDebugInfo('图片分析失败', { error: '无法加载图片数据' });
            };

            img.src = imageContent.data;
        } catch (error) {
            this.logDebugInfo('图片分析异常', { error: error.message });
        }
    }

    estimateImageQuality(img) {
        // 简单的图片质量评估
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // 计算对比度和清晰度指标
            let totalVariance = 0;
            let pixelCount = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                
                if (i > 0) {
                    const prevGray = 0.299 * data[i-4] + 0.587 * data[i-3] + 0.114 * data[i-2];
                    totalVariance += Math.abs(gray - prevGray);
                    pixelCount++;
                }
            }
            
            const avgVariance = totalVariance / pixelCount;
            
            if (avgVariance > 30) return '高';
            if (avgVariance > 15) return '中';
            return '低';
        } catch (error) {
            return '无法检测';
        }
    }

    estimateTextReadability(img) {
        // 估算文字可读性
        const minDimension = Math.min(img.width, img.height);
        
        if (minDimension < 200) return '差 - 尺寸过小';
        if (minDimension < 400) return '一般 - 建议放大';
        if (minDimension < 800) return '良好';
        return '优秀';
    }

    generateRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.quality === '低') {
            recommendations.push('建议重新截图，选择更清晰的区域');
        }
        
        if (analysis.textReadability.includes('差') || analysis.textReadability.includes('一般')) {
            recommendations.push('建议选择更大的截图区域以提高文字清晰度');
        }
        
        if (parseFloat(analysis.aspectRatio) > 3 || parseFloat(analysis.aspectRatio) < 0.3) {
            recommendations.push('图片宽高比过于极端，可能影响AI识别效果');
        }
        
        if (parseInt(analysis.dataSize) > 2000) {
            recommendations.push('图片文件较大，可能影响处理速度');
        }
        
        if (recommendations.length > 0) {
            this.logDebugInfo('优化建议', { recommendations });
        } else {
            this.logDebugInfo('质量评估', { message: '图片质量良好，适合AI分析' });
        }
    }

    analyzeCurrentImage() {
        if (window.aiFeatures && window.aiFeatures.selectedContent) {
            this.analyzeImageData(window.aiFeatures.selectedContent);
        } else {
            this.logDebugInfo('分析失败', { error: '当前没有选中的图片' });
        }
    }

    clearDebugInfo() {
        this.debugInfo = {};
        this.updateDebugPanel();
        this.logDebugInfo('调试信息已清除', { timestamp: new Date().toISOString() });
    }

    // 提供手动测试API调用的方法
    async testAPICall(model = 'qwen') {
        if (!window.aiFeatures || !window.aiFeatures.selectedContent) {
            this.logDebugInfo('API测试失败', { error: '没有选中的内容' });
            return;
        }

        const apiKey = window.aiFeatures.apiKeys[model];
        if (!apiKey) {
            this.logDebugInfo('API测试失败', { error: `${model} API密钥未配置` });
            return;
        }

        this.logDebugInfo('API测试开始', { model, contentType: window.aiFeatures.selectedContent.type });

        try {
            const result = await window.aiFeatures.callAIAPI(model, apiKey, window.aiFeatures.selectedContent);
            this.logDebugInfo('API测试成功', { 
                model, 
                resultLength: result.length,
                preview: result.substring(0, 100) + '...'
            });
        } catch (error) {
            this.logDebugInfo('API测试失败', { 
                model, 
                error: error.message 
            });
        }
    }

    // 诊断页面状态
    diagnosePageState() {
        const contentViewer = document.getElementById('content-viewer');
        const overlay = document.getElementById('selection-overlay');
        
        const diagnosis = {
            contentViewer: {
                exists: !!contentViewer,
                visible: contentViewer ? window.getComputedStyle(contentViewer).display !== 'none' : false,
                dimensions: contentViewer ? {
                    clientWidth: contentViewer.clientWidth,
                    clientHeight: contentViewer.clientHeight,
                    scrollWidth: contentViewer.scrollWidth,
                    scrollHeight: contentViewer.scrollHeight
                } : null,
                hasContent: contentViewer ? contentViewer.children.length > 0 : false,
                contentTypes: contentViewer ? Array.from(contentViewer.children).map(child => child.tagName) : []
            },
            overlay: {
                exists: !!overlay,
                visible: overlay ? window.getComputedStyle(overlay).display !== 'none' : false
            },
            aiFeatures: {
                loaded: !!window.aiFeatures,
                hasSelectedContent: !!(window.aiFeatures && window.aiFeatures.selectedContent),
                selectedContentType: window.aiFeatures && window.aiFeatures.selectedContent ? window.aiFeatures.selectedContent.type : null
            },
            html2canvas: {
                available: typeof html2canvas !== 'undefined'
            }
        };

        this.logDebugInfo('页面状态诊断', diagnosis);
        
        // 提供建议
        const suggestions = [];
        if (!diagnosis.contentViewer.exists) {
            suggestions.push('content-viewer元素不存在');
        } else if (!diagnosis.contentViewer.visible) {
            suggestions.push('content-viewer元素不可见');
        } else if (!diagnosis.contentViewer.hasContent) {
            suggestions.push('content-viewer中没有内容，请先加载PDF或网页');
        }
        
        if (!diagnosis.html2canvas.available) {
            suggestions.push('html2canvas库未加载');
        }
        
        if (!diagnosis.aiFeatures.loaded) {
            suggestions.push('AI功能模块未加载');
        }

        if (suggestions.length > 0) {
            this.logDebugInfo('诊断建议', { suggestions });
        } else {
            this.logDebugInfo('诊断结果', { message: '页面状态正常，可以进行截图' });
        }

        return diagnosis;
    }

    // 测试截图功能
    async testScreenshot() {
        this.logDebugInfo('开始截图测试', { timestamp: new Date().toISOString() });
        
        const contentViewer = document.getElementById('content-viewer');
        if (!contentViewer) {
            this.logDebugInfo('截图测试失败', { error: 'content-viewer不存在' });
            return;
        }

        try {
            // 测试截取整个content-viewer
            const canvas = await html2canvas(contentViewer, {
                useCORS: true,
                allowTaint: true,
                scale: 1,
                logging: true
            });

            const testImageData = canvas.toDataURL('image/png');
            const testSizeKB = Math.round((testImageData.length * 3/4) / 1024);

            this.logDebugInfo('截图测试成功', {
                canvasSize: { width: canvas.width, height: canvas.height },
                imageSizeKB: testSizeKB,
                isBlank: testImageData === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
            });

            // 显示测试截图
            this.showTestScreenshot(testImageData, canvas.width, canvas.height, testSizeKB);

        } catch (error) {
            this.logDebugInfo('截图测试失败', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    showTestScreenshot(imageData, width, height, sizeKB) {
        const previewWindow = document.createElement('div');
        previewWindow.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #007bff;
            border-radius: 8px;
            padding: 20px;
            z-index: 10002;
            max-width: 80vw;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        previewWindow.innerHTML = `
            <div style="text-align: center;">
                <h3 style="margin-top: 0; color: #007bff;">测试截图结果</h3>
                <p style="color: #666;">尺寸: ${width}x${height} | 大小: ${sizeKB}KB</p>
                <img src="${imageData}" style="max-width: 100%; max-height: 300px; border: 1px solid #ddd; border-radius: 4px;">
                <div style="margin-top: 15px;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        关闭
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(previewWindow);

        setTimeout(() => {
            if (document.body.contains(previewWindow)) {
                previewWindow.remove();
            }
        }, 15000);
    }
}

// 初始化调试器
let imageDebugger;
document.addEventListener('DOMContentLoaded', () => {
    imageDebugger = new ImageProcessingDebugger();
    
    // 添加控制台提示
    console.log('%c图片处理调试工具已加载', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
    console.log('%c使用 Ctrl+Shift+D 显示/隐藏调试面板', 'color: #2196F3;');
    console.log('%c可用命令:', 'color: #FF9800; font-weight: bold;');
    console.log('  imageDebugger.diagnosePageState() - 诊断页面状态');
    console.log('  imageDebugger.testScreenshot() - 测试截图功能');
    console.log('  imageDebugger.analyzeCurrentImage() - 分析当前图片');
    console.log('  imageDebugger.testAPICall("qwen") - 测试API调用');
    console.log('  imageDebugger.clearDebugInfo() - 清除调试信息');
});

// 导出到全局作用域
window.imageDebugger = imageDebugger;