// 终极截图修复 - 使用最直接的方法
class ScreenshotFixer {
    constructor() {
        this.replaceScreenshotMethod();
    }

    replaceScreenshotMethod() {
        const waitAndReplace = () => {
            if (window.aiFeatures) {
                window.aiFeatures.startScreenshot = () => {
                    this.ultimateScreenshot();
                };
                console.log('使用终极截图方法');
            } else {
                setTimeout(waitAndReplace, 100);
            }
        };
        waitAndReplace();
    }

    async ultimateScreenshot() {
        // 直接使用传统方法以避免授权提示
        await this.useTraditionalMethod();
    }

    /*
    async useScreenCapture() {
        // 优先尝试仅捕获当前标签页，减少坐标偏移
        const constraints = {
            video: {
                // 部分浏览器(Chrome/Edge ≥111)支持以下新约束，可在无需用户再次选择源的情况下直接选中当前标签页。
                // 如果浏览器不支持，这些字段将被忽略并回退到默认行为（需要用户手动选择）。
                displaySurface: "browser",          // 指示我们希望捕获浏览器标签页
                preferCurrentTab: true,              // 优先当前标签页
                logicalSurface: true,                // 逻辑像素尺寸
                width: { ideal: window.innerWidth * window.devicePixelRatio },
                height: { ideal: window.innerHeight * window.devicePixelRatio },
                frameRate: { ideal: 5, max: 30 },
                cursor: "never"                      // 不录入鼠标光标
            },
            audio: false
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (err) {
            // 如果用户取消或浏览器不支持上述高级约束，则再次尝试最基本的约束
            console.warn("✋ 首次尝试捕获当前标签页失败，回退到通用屏幕捕获", err);
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        video.addEventListener('loadedmetadata', () => {
            this.startSelection(video, stream);
        });
    }

    startSelection(video, stream) {
        let startX, startY;
        let selectionBox = null;
        let isSelecting = false;

        // 创建选择覆盖层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.1);
            z-index: 99999;
            cursor: crosshair;
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('mousedown', (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;

            selectionBox = document.createElement('div');
            selectionBox.style.cssText = `
                position: fixed;
                border: 3px solid #ff0000;
                background: rgba(255,0,0,0.2);
                pointer-events: none;
                z-index: 100000;
                left: ${startX}px;
                top: ${startY}px;
                width: 0px;
                height: 0px;
            `;
            document.body.appendChild(selectionBox);
        });

        overlay.addEventListener('mousemove', (e) => {
            if (!isSelecting || !selectionBox) return;

            const left = Math.min(startX, e.clientX);
            const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        overlay.addEventListener('mouseup', async (e) => {
            if (!isSelecting) return;

            const left = Math.min(startX, e.clientX);
            const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);

            if (width > 20 && height > 20) {
                // 清理UI
                document.body.removeChild(overlay);
                if (selectionBox) document.body.removeChild(selectionBox);

                // 截图
                await this.captureFromVideo(video, stream, left, top, width, height);
            } else {
                document.body.removeChild(overlay);
                if (selectionBox) document.body.removeChild(selectionBox);
                stream.getTracks().forEach(track => track.stop());
            }
        });
    }

    async captureFromVideo(video, stream, x, y, width, height) {
        // 0. 设备像素比
        const dpr = window.devicePixelRatio || 1;

        // 1. 基于 video 与窗口尺寸计算缩放比例
        const scaleXFull = video.videoWidth / window.innerWidth;
        const scaleYFull = video.videoHeight / window.innerHeight;

        // 判断捕获的是"标签页"还是"窗口/屏幕"
        const isTabCapture = Math.abs(scaleXFull - dpr) < 0.2 && Math.abs(scaleYFull - dpr) < 0.2;

        // 如果是窗口捕获，需要补偿浏览器UI(地址栏/标签栏等)的高度以及左右边框
        let logicalOffsetX = 0;
        let logicalOffsetY = 0;
        if (!isTabCapture) {
            logicalOffsetX = (window.outerWidth - window.innerWidth) / 2;
            logicalOffsetY = window.outerHeight - window.innerHeight;
        }

        // 根据是否为窗口捕获选择正确的缩放因子
        const scaleX = isTabCapture ? dpr : video.videoWidth / window.outerWidth;
        const scaleY = isTabCapture ? dpr : video.videoHeight / window.outerHeight;

        // 2. 创建画布
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scaleX);
        canvas.height = Math.round(height * scaleY);
        const ctx = canvas.getContext('2d');

        // 3. 计算源canvas中的裁剪坐标 (物理像素)
        const sx = Math.round((x + logicalOffsetX) * scaleX);
        const sy = Math.round((y + logicalOffsetY) * scaleY);
        const sWidth = Math.round(width * scaleX);
        const sHeight = Math.round(height * scaleY);

        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/png');

        // 停止屏幕共享
        stream.getTracks().forEach(track => track.stop());

        this.saveAndShow(imageData, canvas.width, canvas.height);
    }
    */

    async useTraditionalMethod() {
        let startX, startY;
        let selectionBox = null;
        let isSelecting = false;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.1);
            z-index: 99999;
            cursor: crosshair;
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('mousedown', (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;

            selectionBox = document.createElement('div');
            selectionBox.style.cssText = `
                position: fixed;
                border: 3px solid #ff0000;
                background: rgba(255,0,0,0.2);
                pointer-events: none;
                z-index: 100000;
                left: ${startX}px;
                top: ${startY}px;
                width: 0px;
                height: 0px;
            `;
            document.body.appendChild(selectionBox);
        });

        overlay.addEventListener('mousemove', (e) => {
            if (!isSelecting || !selectionBox) return;

            const left = Math.min(startX, e.clientX);
            const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        overlay.addEventListener('mouseup', async (e) => {
            if (!isSelecting) return;

            const left = Math.min(startX, e.clientX);
            const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);

            if (width > 20 && height > 20) {
                // 清理UI
                document.body.removeChild(overlay);
                if (selectionBox) document.body.removeChild(selectionBox);

                await new Promise(resolve => setTimeout(resolve, 100));

                // 使用多种方法尝试截图
                await this.tryMultipleMethods(left, top, width, height);
            } else {
                document.body.removeChild(overlay);
                if (selectionBox) document.body.removeChild(selectionBox);
            }
        });
    }

    async tryMultipleMethods(x, y, width, height) {
        console.log('尝试截图区域:', { x, y, width, height });
    
        try {
            // 检查是否为PDF视图
            const pdfViewer = document.querySelector('#content-viewer canvas');
            if (pdfViewer) {
                console.log('检测到PDF canvas视图，正在直接从canvas捕获');
                console.log('PDF canvas尺寸:', pdfViewer.width, 'x', pdfViewer.height);
                console.log('捕获区域 (逻辑):', {x, y, width, height});
                const dpr = window.devicePixelRatio;
                console.log('设备像素比:', dpr);
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = width * dpr;
                cropCanvas.height = height * dpr;
                console.log('裁剪canvas尺寸:', cropCanvas.width, 'x', cropCanvas.height);
                const ctx = cropCanvas.getContext('2d');
                ctx.drawImage(pdfViewer, x * dpr, y * dpr, width * dpr, height * dpr, 0, 0, cropCanvas.width, cropCanvas.height);
                const imageData = cropCanvas.toDataURL('image/png');
                console.log('生成图像数据长度:', imageData.length);
                if (imageData.length < 100) {
                    console.error('警告: 生成的图像数据过短，可能为空白');
                }
                this.saveAndShow(imageData, cropCanvas.width, cropCanvas.height);
                return;
            }

            const pdfObject = document.querySelector('#content-viewer object') || document.querySelector('#content-viewer embed');
            if (pdfObject) {
                console.log('检测到PDF object/embed，正在使用html2canvas捕获');
                const viewer = document.getElementById('content-viewer');
                const canvas = await html2canvas(viewer, {
                    scale: window.devicePixelRatio,
                    useCORS: true,
                    allowTaint: true,
                    foreignObjectRendering: true
                });
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = width * window.devicePixelRatio;
                cropCanvas.height = height * window.devicePixelRatio;
                const ctx = cropCanvas.getContext('2d');
                ctx.drawImage(canvas, x * window.devicePixelRatio, y * window.devicePixelRatio, width * window.devicePixelRatio, height * window.devicePixelRatio, 0, 0, cropCanvas.width, cropCanvas.height);
                const imageData = cropCanvas.toDataURL('image/png');
                console.log('生成图像数据长度:', imageData.length);
                this.saveAndShow(imageData, cropCanvas.width, cropCanvas.height);
                return;
            }

            const mindmapSVG = document.querySelector('#mindmap-container svg');
            if (mindmapSVG) {
                console.log('检测到思维导图SVG，正在捕获');
                const canvas = await html2canvas(mindmapSVG.parentElement, {
                    scale: window.devicePixelRatio,
                    useCORS: true,
                    allowTaint: true,
                    foreignObjectRendering: true
                });
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = width * window.devicePixelRatio;
                cropCanvas.height = height * window.devicePixelRatio;
                const ctx = cropCanvas.getContext('2d');
                ctx.drawImage(canvas, x * window.devicePixelRatio, y * window.devicePixelRatio, width * window.devicePixelRatio, height * window.devicePixelRatio, 0, 0, cropCanvas.width, cropCanvas.height);
                const imageData = cropCanvas.toDataURL('image/png');
                    this.saveAndShow(imageData, cropCanvas.width, cropCanvas.height);
                    return;
                } else {
                    console.log('未检测到PDF或SVG，使用标准html2canvas方法');
                    // 原有方法
                    const canvas1 = await html2canvas(document.documentElement, {
                        useCORS: true,
                        allowTaint: true,
                        foreignObjectRendering: true,
                        logging: true,
                        backgroundColor: '#ffffff',
                        scale: window.devicePixelRatio,
                        scrollX: 0,
                        scrollY: -window.scrollY,
                        windowWidth: document.documentElement.scrollWidth,
                        windowHeight: document.documentElement.scrollHeight
                    });
                
                    console.log('方法1完成，canvas尺寸:', canvas1.width, 'x', canvas1.height);
                    
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = width * window.devicePixelRatio;
                    cropCanvas.height = height * window.devicePixelRatio;
                    const ctx = cropCanvas.getContext('2d');
                
                    ctx.drawImage(canvas1, x * window.devicePixelRatio, y * window.devicePixelRatio, width * window.devicePixelRatio, height * window.devicePixelRatio, 0, 0, cropCanvas.width, cropCanvas.height);
                    const imageData = cropCanvas.toDataURL('image/png');
                
                    this.saveAndShow(imageData, cropCanvas.width, cropCanvas.height);
                }
    
        } catch (error) {
            console.error('截图失败:', error);
            alert('截图失败: ' + error.message);
        }
    }

    saveAndShow(imageData, width, height) {
        console.log('截图成功，尺寸:', width, 'x', height);

        // 显示预览
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border: 2px solid #333;
            border-radius: 10px;
            z-index: 100001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
        `;

        const img = document.createElement('img');
        img.src = imageData;
        img.style.cssText = `
            max-width: 100%;
            max-height: 70vh;
            display: block;
            margin: 0 auto;
        `;

        const text = document.createElement('div');
        text.textContent = `截图完成 - ${width} x ${height} 像素`;
        text.style.cssText = `
            text-align: center;
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        `;

        popup.appendChild(img);
        popup.appendChild(text);
        document.body.appendChild(popup);

        // 保存到AI功能
        window.aiFeatures.selectedContent = {
            type: 'image',
            data: imageData,
            metadata: {
                width: width,
                height: height,
                sizeKB: Math.round((imageData.length * 3/4) / 1024)
            }
        };

        window.aiFeatures.updateProcessButton();

        // 3秒后关闭
        setTimeout(() => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
        }, 3000);
    }
}

// 立即启动
new ScreenshotFixer();