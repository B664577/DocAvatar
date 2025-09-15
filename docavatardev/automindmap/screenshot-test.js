// 截图功能测试脚本
class ScreenshotTester {
    constructor() {
        this.init();
    }

    init() {
        console.log('🔧 截图功能测试器初始化');
        this.checkDependencies();
        this.addTestButtons();
    }

    checkDependencies() {
        console.log('📋 检查依赖项:');
        
        // 检查html2canvas
        if (typeof html2canvas !== 'undefined') {
            console.log('✅ html2canvas 已加载');
        } else {
            console.error('❌ html2canvas 未加载');
        }

        // 检查DOM元素
        const contentViewer = document.getElementById('content-viewer');
        if (contentViewer) {
            console.log('✅ content-viewer 元素存在');
            console.log('📏 content-viewer 尺寸:', {
                clientWidth: contentViewer.clientWidth,
                clientHeight: contentViewer.clientHeight,
                scrollWidth: contentViewer.scrollWidth,
                scrollHeight: contentViewer.scrollHeight
            });
        } else {
            console.error('❌ content-viewer 元素不存在');
        }

        // 检查选择遮罩层
        const overlay = document.getElementById('selection-overlay');
        if (overlay) {
            console.log('✅ selection-overlay 元素存在');
        } else {
            console.error('❌ selection-overlay 元素不存在');
        }
    }

    addTestButtons() {
        // 创建测试按钮容器
        const testContainer = document.createElement('div');
        testContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #fff;
            border: 2px solid #007bff;
            border-radius: 8px;
            padding: 15px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: Arial, sans-serif;
        `;

        testContainer.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #007bff;">🔧 截图测试工具</h4>
            <button id="test-full-screenshot" style="display: block; width: 100%; margin: 5px 0; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                测试完整页面截图
            </button>
            <button id="test-element-screenshot" style="display: block; width: 100%; margin: 5px 0; padding: 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                测试元素截图
            </button>
            <button id="test-selection-mode" style="display: block; width: 100%; margin: 5px 0; padding: 8px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">
                测试选择模式
            </button>
            <button id="close-test-panel" style="display: block; width: 100%; margin: 5px 0; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                关闭测试面板
            </button>
        `;

        document.body.appendChild(testContainer);

        // 绑定事件
        document.getElementById('test-full-screenshot').onclick = () => this.testFullScreenshot();
        document.getElementById('test-element-screenshot').onclick = () => this.testElementScreenshot();
        document.getElementById('test-selection-mode').onclick = () => this.testSelectionMode();
        document.getElementById('close-test-panel').onclick = () => testContainer.remove();
    }

    async testFullScreenshot() {
        console.log('🖼️ 开始测试完整页面截图');
        
        try {
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                scale: 1,
                backgroundColor: '#ffffff',
                logging: true
            });

            console.log('✅ 完整页面截图成功');
            console.log('📏 Canvas尺寸:', canvas.width, 'x', canvas.height);

            const imageData = canvas.toDataURL('image/png');
            const sizeKB = Math.round((imageData.length * 3/4) / 1024);
            
            console.log('📊 图片大小:', sizeKB, 'KB');
            
            this.showPreview(imageData, canvas.width, canvas.height, sizeKB, '完整页面截图');

        } catch (error) {
            console.error('❌ 完整页面截图失败:', error);
            alert('完整页面截图失败: ' + error.message);
        }
    }

    async testElementScreenshot() {
        console.log('🎯 开始测试元素截图');
        
        // 查找测试内容元素
        const testElements = document.querySelectorAll('.test-content, .medical-content');
        
        if (testElements.length === 0) {
            alert('未找到测试内容元素，请确保页面包含 .test-content 或 .medical-content 类的元素');
            return;
        }

        const targetElement = testElements[0];
        console.log('🎯 目标元素:', targetElement.className);

        try {
            const canvas = await html2canvas(targetElement, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                backgroundColor: '#ffffff',
                logging: true
            });

            console.log('✅ 元素截图成功');
            console.log('📏 Canvas尺寸:', canvas.width, 'x', canvas.height);

            const imageData = canvas.toDataURL('image/png');
            const sizeKB = Math.round((imageData.length * 3/4) / 1024);
            
            console.log('📊 图片大小:', sizeKB, 'KB');
            
            this.showPreview(imageData, canvas.width, canvas.height, sizeKB, '元素截图');

        } catch (error) {
            console.error('❌ 元素截图失败:', error);
            alert('元素截图失败: ' + error.message);
        }
    }

    testSelectionMode() {
        console.log('🖱️ 开始测试选择模式');
        
        const overlay = document.getElementById('selection-overlay');
        if (!overlay) {
            alert('未找到选择遮罩层元素');
            return;
        }

        // 显示选择遮罩层
        overlay.style.display = 'block';
        console.log('✅ 选择遮罩层已显示');

        // 添加简单的选择逻辑
        let isSelecting = false;
        let startX, startY;
        let selectionBox = null;

        const handleMouseDown = (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;

            // 创建选择框
            selectionBox = document.createElement('div');
            selectionBox.style.cssText = `
                position: absolute;
                border: 2px dashed #007bff;
                background: rgba(0, 123, 255, 0.1);
                pointer-events: none;
                z-index: 10001;
            `;
            overlay.appendChild(selectionBox);
            
            console.log('🖱️ 开始选择:', { startX, startY });
        };

        const handleMouseMove = (e) => {
            if (!isSelecting || !selectionBox) return;

            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        };

        const handleMouseUp = async (e) => {
            if (!isSelecting) return;
            isSelecting = false;

            const endX = e.clientX;
            const endY = e.clientY;

            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            console.log('🖱️ 选择完成:', { left, top, width, height });

            if (width > 10 && height > 10) {
                await this.captureSelectedArea(left, top, width, height);
            } else {
                alert('选择区域太小，请重新选择');
            }

            // 清理
            overlay.style.display = 'none';
            if (selectionBox) {
                selectionBox.remove();
                selectionBox = null;
            }
            
            overlay.removeEventListener('mousedown', handleMouseDown);
            overlay.removeEventListener('mousemove', handleMouseMove);
            overlay.removeEventListener('mouseup', handleMouseUp);
        };

        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mouseup', handleMouseUp);

        // 添加取消按钮功能
        const cancelBtn = overlay.querySelector('#cancel-selection');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                overlay.style.display = 'none';
                if (selectionBox) {
                    selectionBox.remove();
                    selectionBox = null;
                }
                overlay.removeEventListener('mousedown', handleMouseDown);
                overlay.removeEventListener('mousemove', handleMouseMove);
                overlay.removeEventListener('mouseup', handleMouseUp);
                console.log('🚫 选择已取消');
            };
        }
    }

    async captureSelectedArea(x, y, width, height) {
        console.log('📸 开始截取选定区域:', { x, y, width, height });

        try {
            // 使用html2canvas截取整个页面
            const fullCanvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                scale: 1,
                backgroundColor: '#ffffff',
                logging: true
            });

            // 创建裁剪canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = width;
            cropCanvas.height = height;
            const ctx = cropCanvas.getContext('2d');

            // 裁剪指定区域
            ctx.drawImage(fullCanvas, x, y, width, height, 0, 0, width, height);

            console.log('✅ 区域截图成功');
            console.log('📏 裁剪后尺寸:', cropCanvas.width, 'x', cropCanvas.height);

            const imageData = cropCanvas.toDataURL('image/png');
            const sizeKB = Math.round((imageData.length * 3/4) / 1024);
            
            console.log('📊 图片大小:', sizeKB, 'KB');
            
            this.showPreview(imageData, cropCanvas.width, cropCanvas.height, sizeKB, '选区截图');

        } catch (error) {
            console.error('❌ 选区截图失败:', error);
            alert('选区截图失败: ' + error.message);
        }
    }

    showPreview(imageData, width, height, sizeKB, title) {
        // 检查图片是否为空白
        const isBlank = imageData === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        
        const previewWindow = document.createElement('div');
        previewWindow.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid ${isBlank ? '#dc3545' : '#28a745'};
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
                <h3 style="margin-top: 0; color: ${isBlank ? '#dc3545' : '#28a745'};">
                    ${isBlank ? '⚠️' : '✅'} ${title}结果
                </h3>
                <p style="color: #666;">
                    尺寸: ${width}x${height} | 大小: ${sizeKB}KB
                    ${isBlank ? ' | ⚠️ 图片为空白' : ''}
                </p>
                <img src="${imageData}" style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                <div style="margin-top: 15px;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        关闭预览
                    </button>
                </div>
                ${isBlank ? '<p style="color: #dc3545; font-size: 12px;">如果图片为空白，可能是因为：<br>1. 选择区域没有可见内容<br>2. CSS样式问题<br>3. 跨域限制</p>' : ''}
            </div>
        `;

        document.body.appendChild(previewWindow);

        // 10秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(previewWindow)) {
                previewWindow.remove();
            }
        }, 10000);
    }
}

// 页面加载完成后初始化测试器
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ScreenshotTester();
    });
} else {
    new ScreenshotTester();
} 