// AI功能模块
class AIFeatures {
    constructor() {
        this.selectedContent = null;
        this.currentPDF = null;
        this.currentWebpage = null;
        this.isSelecting = false;
        this.selectionBox = null;
        this.apiKeys = {
            vision: localStorage.getItem('vision-api-key') || '',
            mindmap: localStorage.getItem('mindmap-api-key') || ''
        };
        this.contentExtractor = new ContentExtractor();
        this.patchAlert();
        this.init();
        
        // 调试模式：将实例暴露到全局，方便调试
        window.aiFeatures = this;
    }

    init() {
        // 立即检查PDF.js可用性
        
        this.initEventListeners();
    }

    checkPDFAvailability() {
        if (typeof pdfjsLib === 'undefined') {
            console.error('❌ PDF.js库尚未加载');
            // 等待一段时间后重试
            setTimeout(() => {
                if (typeof pdfjsLib !== 'undefined') {
                    console.log('✅ PDF.js库延迟加载成功');
                    this.initPDFWorker();
                } else {
                    console.error('❌ PDF.js库加载失败');
                    this.updatePDFStatus('error');
                }
            }, 2000);
        } else {
            console.log('✅ PDF.js库已预加载');
        }
    }

    initPDFWorker() {
        // 配置PDF.js
        if (typeof pdfjsLib !== 'undefined') {
            // 强制启用Worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
            console.log('PDF.js Worker已强制启用，路径:', pdfjsLib.GlobalWorkerOptions.workerSrc);
            
            // 测试Worker
            this.testPDFWorker();
            
            // 更新UI状态
            this.updatePDFStatus('ready');
            
            console.log('PDF.js版本:', pdfjsLib.version || '2.16.105');
        } else {
            console.error('PDF.js库未加载');
            this.updatePDFStatus('error');
        }
    }

    updatePDFStatus(status) {
        const uploadBtn = document.getElementById('upload-pdf-btn');
        const uploadArea = document.getElementById('upload-area');
        
        if (!uploadBtn || !uploadArea) return;
        
        switch (status) {
            case 'ready':
                uploadBtn.textContent = '上传PDF';
                uploadBtn.disabled = false;
                uploadBtn.style.backgroundColor = '#007bff';
                uploadArea.querySelector('p').textContent = '拖拽PDF文件到此处或点击上传按钮';
                break;
            case 'loading':
                uploadBtn.textContent = '加载中...';
                uploadBtn.disabled = true;
                uploadBtn.style.backgroundColor = '#6c757d';
                break;
            case 'error':
                uploadBtn.textContent = 'PDF功能异常';
                uploadBtn.disabled = true;
                uploadBtn.style.backgroundColor = '#dc3545';
                uploadArea.querySelector('p').textContent = 'PDF功能不可用 - 请刷新页面重试';
                break;
        }
    }

    testPDFWorker() {
        // 简单测试Worker配置是否正确
        try {
            console.log('PDF.js Worker配置测试...');
            console.log('当前Worker路径:', pdfjsLib.GlobalWorkerOptions.workerSrc);
            
            // 检查Worker脚本是否可以访问
            fetch(pdfjsLib.GlobalWorkerOptions.workerSrc, { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        console.log('PDF.js Worker脚本可访问');
                    } else {
                        console.warn('PDF.js Worker脚本访问失败，尝试备用路径');
                        
                        console.log('已切换到备用Worker路径:', pdfjsLib.GlobalWorkerOptions.workerSrc);
                    }
                })
                .catch(error => {
                    console.warn('Worker可访问性检查失败:', error);
                    
                    console.log('已切换到第二备用Worker路径:', pdfjsLib.GlobalWorkerOptions.workerSrc);
                });
        } catch (error) {
            console.error('Worker测试失败:', error);
        }
    }

    // 诊断PDF功能的方法 - 可以在浏览器控制台中调用 aiFeatures.diagnosePDF()
    diagnosePDF() {
        console.log('=== 🔍 PDF功能诊断开始 ===');
        console.log('1. 📚 PDF.js库检查:');
        console.log('   - pdfjsLib可用:', typeof pdfjsLib !== 'undefined' ? '✅' : '❌');
        if (typeof pdfjsLib !== 'undefined') {
            console.log('   - PDF.js版本:', pdfjsLib.version || '未知');
            console.log('   - Worker状态:', pdfjsLib.GlobalWorkerOptions.workerSrc === '' ? '✅ 已禁用' : '⚠️ 启用中');
        }
        
        console.log('2. 🖥️ DOM元素检查:');
        console.log('   - PDF上传按钮:', document.getElementById('upload-pdf-btn') ? '✅' : '❌');
        console.log('   - PDF文件输入:', document.getElementById('pdf-upload') ? '✅' : '❌');
        console.log('   - 内容查看器:', document.getElementById('content-viewer') ? '✅' : '❌');
        
        console.log('3. 🧪 功能测试:');
        const uploadBtn = document.getElementById('upload-pdf-btn');
        if (uploadBtn) {
            console.log('   - 按钮状态:', uploadBtn.disabled ? '❌ 禁用' : '✅ 可用');
            console.log('   - 按钮文本:', uploadBtn.textContent);
        }
        
        console.log('=== 📋 诊断结果 ===');
        console.log('✅ 表示正常，❌ 表示异常，⚠️ 表示需要注意');
        console.log('');
        console.log('💡 快速测试: 运行 aiFeatures.testPDFQuick() 进行功能测试');
    }

    // 快速PDF功能测试
    testPDFQuick() {
        console.log('🚀 开始PDF功能快速测试...');
        
        if (typeof pdfjsLib === 'undefined') {
            console.error('❌ PDF.js库未加载，请刷新页面');
            return;
        }
        
        const uploadBtn = document.getElementById('upload-pdf-btn');
        if (!uploadBtn) {
            console.error('❌ 找不到PDF上传按钮');
            return;
        }
        
        if (uploadBtn.disabled) {
            console.warn('⚠️ PDF上传按钮被禁用，可能PDF功能未就绪');
            return;
        }
        
        console.log('✅ PDF功能基础检查通过');
        console.log('📝 建议：选择一个小于5MB的PDF文件进行测试');
        console.log('🎯 操作：点击"上传PDF"按钮或拖拽PDF文件到上传区域');
        
        // 模拟点击上传按钮来测试事件绑定
        console.log('🧪 测试按钮点击...');
        try {
            uploadBtn.click();
            console.log('✅ 按钮点击测试成功，文件选择对话框应该已打开');
        } catch (error) {
            console.error('❌ 按钮点击测试失败:', error);
        }
    }

    initEventListeners() {
        // 新按钮事件 - 添加空值检查
        const openPdfBtn = document.getElementById('open-pdf-viewer');
        if (openPdfBtn) {
            openPdfBtn.addEventListener('click', () => {
                alert('Opening PDF Viewer');
                window.open('pdf-viewer.html', '_blank');
            });
        }

        const openWebBtn = document.getElementById('open-web-viewer');
        if (openWebBtn) {
            openWebBtn.addEventListener('click', () => {
                alert('Opening Web Viewer');
                window.open('web-viewer.html', '_blank');
            });
        }


    }

    

    






                




    async extractPdfPageText(page, pageIndex) {
        try {
            this.currentPDF.pages[pageIndex].textStatus = 'extracting';
            const textContent = await page.getTextContent();
            const text = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();

            if (!text) {
                console.warn(`PDF第${pageIndex + 1}页文本内容为空`);
            }

            this.currentPDF.pages[pageIndex].text = text;
            this.currentPDF.pages[pageIndex].textStatus = 'done';
            console.log(`PDF第${pageIndex + 1}页文本提取成功，长度: ${text.length}字符`);

            // 检查是否所有页面的文本都已提取完成
            const allDone = this.currentPDF.pages.every(page => page.textStatus === 'done');
            if (allDone) {
                console.log('所有PDF页面的文本提取已完成');
                // 更新复制按钮状态
                document.getElementById('copy-text-btn').disabled = false;
            }
        } catch (error) {
            console.error(`PDF第${pageIndex + 1}页文本提取失败:`, error);
            this.currentPDF.pages[pageIndex].textStatus = 'error';
            this.currentPDF.pages[pageIndex].error = error.message;
        }
    }

    async renderSimplePDF(pdf) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = '';
        
        // 创建简单的容器
        const container = document.createElement('div');
        container.style.cssText = `
            width: 100%;
            height: 100%;
            overflow: auto;
            background: #f5f5f5;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;
        
        // 添加页面信息
        const info = document.createElement('div');
        info.textContent = `PDF文档已加载 (共 ${pdf.numPages} 页)`;
        info.style.cssText = `
            margin-bottom: 20px;
            padding: 10px;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        container.appendChild(info);
        
        // 渲染第一页
        try {
            const page = await pdf.getPage(1);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.cssText = `
                border: 1px solid #ddd;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                background: white;
            `;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            container.appendChild(canvas);
            
            // 如果有多页，添加提示
            if (pdf.numPages > 1) {
                const morePages = document.createElement('div');
                morePages.textContent = `显示第1页，共${pdf.numPages}页 (功能简化版本)`;
                morePages.style.cssText = `
                    margin-top: 10px;
                    color: #666;
                    font-size: 14px;
                `;
                container.appendChild(morePages);
            }
            
        } catch (renderError) {
            console.error('PDF渲染失败:', renderError);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = 'PDF渲染失败，但文件已成功加载';
            errorDiv.style.cssText = `
                color: red;
                padding: 20px;
                background: #ffe6e6;
                border-radius: 5px;
            `;
            container.appendChild(errorDiv);
        }
        
        viewer.appendChild(container);
    }

    async fallbackPDFMethod(file) {
    console.log('使用<object>标签嵌入PDF');
    const viewer = document.getElementById('content-viewer');
    viewer.innerHTML = '';
    const fileURL = URL.createObjectURL(file);
    const objectElem = document.createElement('object');
    objectElem.data = fileURL;
    objectElem.type = 'application/pdf';
    objectElem.style.cssText = 'width: 100%; height: 100%;';
    const embedElem = document.createElement('embed');
    embedElem.src = fileURL;
    embedElem.type = 'application/pdf';
    embedElem.style.cssText = 'width: 100%; height: 100%;';
    objectElem.appendChild(embedElem);
    viewer.appendChild(objectElem);
    this.cleanupURL = () => URL.revokeObjectURL(fileURL);
    return new Promise((resolve) => {
        objectElem.onload = () => {
            console.log('PDF加载完成');
            resolve();
        };
        objectElem.onerror = () => {
            console.error('PDF加载失败');
            resolve(); // 即使错误也继续
        };
    });
}

    async renderPDF(pdf) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = '';

        // 创建主容器
        const mainContainer = document.createElement('div');
        mainContainer.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        `;

        // 创建PDF控制栏
        const controlBar = document.createElement('div');
        controlBar.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 15px;
            background: white;
            border-bottom: 1px solid #e0e0e0;
            flex-shrink: 0;
            flex-wrap: wrap;
            justify-content: center;
        `;

        const totalPages = pdf.numPages;
        let currentPage = 1;

        // 通用按钮样式
        const buttonStyle = `
            padding: 4px 8px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        `;

        // 页面控制按钮
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀';
        prevBtn.style.cssText = buttonStyle;
        prevBtn.disabled = true;

        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = `
            font-size: 12px;
            color: #333;
            margin: 0 8px;
            white-space: nowrap;
        `;
        pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;

        const nextBtn = document.createElement('button');
        nextBtn.textContent = '▶';
        nextBtn.style.cssText = buttonStyle;
        nextBtn.disabled = totalPages <= 1;

        // 分隔符
        const separator1 = document.createElement('div');
        separator1.style.cssText = `
            width: 1px;
            height: 20px;
            background: #ddd;
            margin: 0 8px;
        `;

        // 缩放控制
        const zoomOut = document.createElement('button');
        zoomOut.textContent = '−';
        zoomOut.style.cssText = buttonStyle;

        const zoomInfo = document.createElement('span');
        zoomInfo.style.cssText = `
            font-size: 12px;
            color: #333;
            margin: 0 8px;
            min-width: 40px;
            text-align: center;
        `;
        let currentScale = 1.5;
        zoomInfo.textContent = `${Math.round(currentScale * 100)}%`;

        const zoomIn = document.createElement('button');
        zoomIn.textContent = '+';
        zoomIn.style.cssText = buttonStyle;

        // 分隔符
        const separator2 = document.createElement('div');
        separator2.style.cssText = separator1.style.cssText;

        // 全部页面显示按钮
        const showAllBtn = document.createElement('button');
        showAllBtn.textContent = '显示全部页面';
        showAllBtn.style.cssText = `
            padding: 4px 8px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        `;

        controlBar.appendChild(prevBtn);
        controlBar.appendChild(pageInfo);
        controlBar.appendChild(nextBtn);
        controlBar.appendChild(separator1);
        controlBar.appendChild(zoomOut);
        controlBar.appendChild(zoomInfo);
        controlBar.appendChild(zoomIn);
        controlBar.appendChild(separator2);
        controlBar.appendChild(showAllBtn);

        // 创建PDF内容容器
        const pdfContainer = document.createElement('div');
        pdfContainer.className = 'pdf-container';
        pdfContainer.style.cssText = `
            flex: 1;
            overflow: auto;
            background: #f0f0f0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

        // 页面内容容器
        this.pdfState = {
            pdf,
            currentScale,
            totalPages,
            pageContainer,
            renderPage,
            currentPage: 1,
            mode: 'single'
        };
        const pageContainer = document.createElement('div');
        pageContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            width: 100%;
        `;

        pdfContainer.appendChild(pageContainer);
        
        // 将控制栏和PDF容器添加到主容器
        mainContainer.appendChild(controlBar);
        mainContainer.appendChild(pdfContainer);

        // 渲染页面的函数
        const renderPage = async (pageNum, scale = currentScale) => {
            const page = await pdf.getPage(pageNum);
            let viewport = page.getViewport({ scale: 1 });
            console.log('Original viewport dimensions:', viewport.width, viewport.height);

            const minWidth = 800;
            const effectiveScale = Math.max(scale, minWidth / viewport.width);
            viewport = page.getViewport({ scale: effectiveScale });
            console.log('Adjusted scale:', effectiveScale);
            console.log('Final viewport dimensions:', viewport.width, viewport.height);

            const outputScale = window.devicePixelRatio || 1;

            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = `${Math.floor(viewport.width)}px`;
            wrapper.style.height = `${Math.floor(viewport.height)}px`;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            canvas.style.cssText = `
                border: 1px solid #ddd;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                margin-bottom: 10px;
                background: white;
            `;
            canvas.style.zIndex = '0';
            const context = canvas.getContext('2d');

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
                transform: transform
            };
            await page.render(renderContext).promise;

            if (viewport.width < 1 || viewport.height < 1) {
                console.warn('Viewport dimensions are too small after adjustment');
            }

            const textViewport = page.getViewport({ scale: effectiveScale });
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
            textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
            textLayerDiv.style.overflow = 'hidden';
            textLayerDiv.style.opacity = '1';
            textLayerDiv.style.lineHeight = '1';
            textLayerDiv.style.color = 'black';
            textLayerDiv.style.cursor = 'text';
            textLayerDiv.style.userSelect = 'text';
            textLayerDiv.style.webkitUserSelect = 'text';
            textLayerDiv.style.pointerEvents = 'auto !important';
            textLayerDiv.style.zIndex = '100';

            if (outputScale !== 1) {
                textLayerDiv.style.transform = `scale(${outputScale}, ${outputScale})`;
                textLayerDiv.style.transformOrigin = '0 0';
            }

            const textContent = await page.getTextContent();
            console.log('PDF文本内容:', textContent.items.length, '个文本项');
            if (textContent.items.length === 0) {
                console.warn('No text content found. This might be a scanned PDF without selectable text. Consider using OCR for text extraction.');
            }
            textContent.items.forEach(item => {
                console.log('Text item:', item.str, 'height:', item.height, 'transform:', item.transform);
            });
            
            pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayerDiv,
                viewport: textViewport,
                textDivs: []
            });
            
            // 调试：检查文本层是否有内容
            setTimeout(() => {
                console.log('文本层子元素数量:', textLayerDiv.children.length);
                console.log('文本层样式:', {
                    position: textLayerDiv.style.position,
                    zIndex: textLayerDiv.style.zIndex,
                    pointerEvents: textLayerDiv.style.pointerEvents,
                    color: textLayerDiv.style.color
                });
                if (textLayerDiv.children.length > 0) {
                    console.log('第一个文本元素:', textLayerDiv.children[0].textContent);
                }
            }, 100);

            wrapper.appendChild(canvas);
            wrapper.appendChild(textLayerDiv);
            return wrapper;
        };

        // 显示单页
        const showSinglePage = async (pageNum) => {
            pageContainer.innerHTML = '';
            const canvas = await renderPage(pageNum, currentScale);
            pageContainer.appendChild(canvas);
            
            this.pdfState.currentPage = pageNum;
            this.pdfState.mode = 'single';
            pageInfo.textContent = `第 ${pageNum} 页，共 ${totalPages} 页`;
            prevBtn.disabled = pageNum <= 1;
            nextBtn.disabled = pageNum >= totalPages;
        };

        // 显示所有页面
        const showAllPages = async () => {
            pageContainer.innerHTML = '';
            showAllBtn.textContent = '加载中...';
            showAllBtn.disabled = true;
            
            for (let i = 1; i <= totalPages; i++) {
                const canvas = await renderPage(i, currentScale);
                
                // 添加页码标签
                const pageLabel = document.createElement('div');
                pageLabel.textContent = `第 ${i} 页`;
                pageLabel.style.cssText = `
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 5px;
                `;
                
                const pageWrapper = document.createElement('div');
                pageWrapper.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                `;
                pageWrapper.appendChild(pageLabel);
                pageWrapper.appendChild(canvas);
                
                pageContainer.appendChild(pageWrapper);
            }
            
            showAllBtn.textContent = '显示全部页面';
            showAllBtn.disabled = false;
            this.pdfState.mode = 'all';
            this.pdfState.currentPage = 0;
            // 隐藏翻页按钮
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            pageInfo.textContent = `显示全部 ${totalPages} 页`;
        };

        // 事件监听器
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                showSinglePage(currentPage - 1);
            }
        });

        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                showSinglePage(currentPage + 1);
            }
        });

        zoomOut.addEventListener('click', async () => {
            if (currentScale > 0.5) {
                currentScale = Math.max(0.5, currentScale - 0.25);
                zoomInfo.textContent = `${Math.round(currentScale * 100)}%`;
                if (pageContainer.children.length === 1) {
                    await showSinglePage(currentPage);
                } else {
                    await showAllPages();
                }
            }
        });

        zoomIn.addEventListener('click', async () => {
            if (currentScale < 3.0) {
                currentScale = Math.min(3.0, currentScale + 0.25);
                zoomInfo.textContent = `${Math.round(currentScale * 100)}%`;
                if (pageContainer.children.length === 1) {
                    await showSinglePage(currentPage);
                } else {
                    await showAllPages();
                }
            }
        });

        showAllBtn.addEventListener('click', async () => {
            if (showAllBtn.textContent === '显示全部页面') {
                await showAllPages();
                showAllBtn.textContent = '单页显示';
            } else {
                prevBtn.style.display = 'inline-block';
                nextBtn.style.display = 'inline-block';
                await showSinglePage(1);
                showAllBtn.textContent = '显示全部页面';
            }
        });

        // 初始渲染第一页
        await showSinglePage(1);
        
        viewer.appendChild(mainContainer);
    }

    async loadWebpage() {
        const url = document.getElementById('webpage-url').value.trim();
        if (!url) {
            alert('请输入有效的网页URL');
            return;
        }

        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            fullUrl = 'https://' + url;
        }

        this.showLoading('正在加载网页截图...');

        try {
            // 使用后端代理截图
            const response = await fetch(`/screenshot?url=${encodeURIComponent(fullUrl)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // 检查响应的 Content-Type
            const contentType = response.headers.get('content-type');
            let screenshot;
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                screenshot = data.screenshot;
            } else if (contentType && contentType.includes('image/')) {
                // 如果返回的是图片数据，直接创建 blob URL
                const blob = await response.blob();
                screenshot = URL.createObjectURL(blob);
            } else {
                throw new Error('不支持的响应格式：' + contentType);
            }

            const viewer = document.getElementById('content-viewer');
            viewer.innerHTML = '';
            const img = document.createElement('img');
            img.src = screenshot;
            img.style.width = '100%';
            viewer.appendChild(img);

            this.currentWebpage = { url: fullUrl, screenshot: data.screenshot };
            this.currentPDF = null;

            // 启用相关按钮
            document.getElementById('screenshot-btn').disabled = false;
            document.getElementById('copy-text-btn').disabled = false;
            this.updateProcessButton();

            // 异步提取文本内容
            this.extractWebpageText(fullUrl);

        } catch (error) {
            console.error('网页加载失败:', error);
            alert('网页加载失败，请检查URL或服务器日志。');
        } finally {
            this.hideLoading();
        }
    }

    async extractWebpageText(url) {
        try {
            const response = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            // 使用DOMParser从HTML中提取文本
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            this.currentWebpage.text = doc.body.innerText;
            console.log('网页文本提取成功');
        } catch (error) {
            console.error('网页文本提取失败:', error);
            // 即使文本提取失败，截图依然可用，所以不提示用户
        }
    }

    async tryIframeLoad(fullUrl) {
        return new Promise((resolve, reject) => {
            const viewer = document.getElementById('content-viewer');
            viewer.innerHTML = '';

            // 创建容器来处理iframe加载失败的情况
            const webpageContainer = document.createElement('div');
            webpageContainer.style.cssText = `
                width: 100%;
                height: 100%;
                position: relative;
            `;

            const iframe = document.createElement('iframe');
            iframe.className = 'webpage-viewer';
            iframe.src = fullUrl;
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
            `;

            // 设置超时检测
            let loadTimeout = setTimeout(() => {
                reject(new Error('iframe加载超时'));
            }, 8000); // 8秒超时

            // 检测iframe是否被阻止加载（X-Frame-Options）
            iframe.onload = () => {
                clearTimeout(loadTimeout);
                try {
                    // 尝试访问iframe内容，如果被阻止会抛出异常
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (!iframeDoc || iframeDoc.location.href === 'about:blank') {
                        throw new Error('Frame access denied');
                    }
                    
                    this.hideLoading();
                    this.currentWebpage = fullUrl;
                    
                    // 启用相关按钮
                    document.getElementById('screenshot-btn').disabled = false;
                    document.getElementById('copy-text-btn').disabled = false;
                    this.updateProcessButton();
                    
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            };

            iframe.onerror = () => {
                clearTimeout(loadTimeout);
                reject(new Error('iframe加载错误'));
            };

            webpageContainer.appendChild(iframe);
            viewer.appendChild(webpageContainer);
        });
    }

    showWebpageError(container, url) {
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 20px;
                text-align: center;
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
                <h3 style="color: #dc3545; margin-bottom: 15px;">网页加载失败</h3>
                <p style="color: #6c757d; margin-bottom: 20px; line-height: 1.5;">
                    该网站可能设置了安全策略，禁止在框架中显示。<br>
                    您可以尝试以下解决方案：
                </p>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
                    <button onclick="window.open('${url}', '_blank')" style="
                        padding: 8px 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">在新窗口打开</button>
                    <button onclick="navigator.clipboard.writeText('${url}')" style="
                        padding: 8px 16px;
                        background-color: #28a745;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">复制链接</button>
                    <button onclick="window.aiFeatures.tryProxyLoad('${url}')" style="
                        padding: 8px 16px;
                        background-color: #ffc107;
                        color: #212529;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">尝试代理加载</button>
                </div>
                <small style="color: #6c757d; margin-top: 15px;">
                    建议：在新窗口打开网页，然后使用"复制文字"功能手动输入要分析的内容
                </small>
            </div>
        `;
        
        // 启用文字复制按钮，即使网页加载失败
        document.getElementById('copy-text-btn').disabled = false;
        this.updateProcessButton();
    }

    tryProxyLoad(url) {
        // 尝试使用内容抓取API和代理服务
        const contentServices = [
            {
                name: 'AllOrigins',
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                type: 'json'
            },
            {
                name: 'CORS代理',
                url: `https://cors-anywhere.herokuapp.com/${url}`,
                type: 'direct'
            },
            {
                name: 'ThingProxy',
                url: `https://thingproxy.freeboard.io/fetch/${url}`,
                type: 'direct'
            }
        ];
        
        this.showLoading('尝试代理加载...');
        this.tryContentService(contentServices, 0, url);
    }

    async tryContentService(services, index, originalUrl) {
        if (index >= services.length) {
            this.hideLoading();
            this.showAdvancedOptions(originalUrl);
            return;
        }

        const service = services[index];
        console.log(`尝试服务 ${service.name}: ${service.url}`);

        try {
            if (service.type === 'json') {
                // 使用JSON API获取内容
                const response = await fetch(service.url);
                const data = await response.json();
                
                if (data.contents) {
                    this.displayExtractedContent(data.contents, originalUrl);
                    this.hideLoading();
                    return;
                }
            } else {
                // 直接iframe加载
                this.loadWithIframe(service.url, originalUrl, () => {
                    // 如果失败，尝试下一个服务
                    setTimeout(() => {
                        this.tryContentService(services, index + 1, originalUrl);
                    }, 3000);
                });
                return;
            }
        } catch (error) {
            console.log(`服务 ${service.name} 失败:`, error);
        }

        // 尝试下一个服务
        this.tryContentService(services, index + 1, originalUrl);
    }

    loadWithIframe(proxyUrl, originalUrl, onError) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = '';
        
        const iframe = document.createElement('iframe');
        iframe.src = proxyUrl;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;
        
        let loaded = false;
        
        iframe.onload = () => {
            if (!loaded) {
                loaded = true;
                this.hideLoading();
                this.currentWebpage = originalUrl;
                document.getElementById('screenshot-btn').disabled = false;
                document.getElementById('copy-text-btn').disabled = false;
                this.updateProcessButton();
            }
        };
        
        iframe.onerror = () => {
            if (!loaded) {
                loaded = true;
                if (onError) onError();
            }
        };
        
        // 设置超时
        setTimeout(() => {
            if (!loaded) {
                loaded = true;
                if (onError) onError();
            }
        }, 5000);
        
        viewer.appendChild(iframe);
    }

    displayExtractedContent(htmlContent, originalUrl) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = '';
        
        // 创建内容容器
        const container = document.createElement('div');
        container.style.cssText = `
            width: 100%;
            height: 100%;
            overflow: auto;
            background: white;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
        `;
        
        // 添加网站信息
        const header = document.createElement('div');
        header.style.cssText = `
            background: #f8f9fa;
            padding: 10px 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #6c757d;
        `;
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>📄 网页内容已提取：${originalUrl}</span>
                <button onclick="window.open('${originalUrl}', '_blank')" style="
                    padding: 4px 8px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">原网页</button>
            </div>
        `;
        
        // 添加内容
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = htmlContent;
        
        // 处理链接，使其在新窗口打开
        const links = contentDiv.querySelectorAll('a');
        links.forEach(link => {
            link.target = '';
            if (link.href && !link.href.startsWith('http')) {
                try {
                    const baseUrl = new URL(originalUrl);
                    link.href = new URL(link.href, baseUrl.origin).href;
                } catch (e) {
                    // 忽略无效链接
                }
            }
        });
        
        container.appendChild(header);
        container.appendChild(contentDiv);
        viewer.appendChild(container);
        
        // 启用相关功能
        this.currentWebpage = originalUrl;
        document.getElementById('screenshot-btn').disabled = false;
        document.getElementById('copy-text-btn').disabled = false;
        this.updateProcessButton();
    }

    showAdvancedOptions(url) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 30px;
                text-align: center;
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">🌐</div>
                <h3 style="color: #dc3545; margin-bottom: 15px;">网页加载失败</h3>
                <p style="color: #6c757d; margin-bottom: 25px; line-height: 1.6; max-width: 500px;">
                    该网站设置了严格的安全策略，无法在框架中显示。<br>
                    为了更好地处理内容，请选择以下方案：
                </p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; width: 100%; max-width: 600px; margin-bottom: 20px;">
                    <button onclick="window.open('${url}', '_blank')" style="
                        padding: 12px 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background-color 0.2s;
                    ">🔗 新窗口打开</button>
                    
                    <button onclick="navigator.clipboard.writeText('${url}')" style="
                        padding: 12px 16px;
                        background-color: #28a745;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">📋 复制链接</button>
                    
                    <button onclick="window.aiFeatures.showTextInputModal()" style="
                        padding: 12px 16px;
                        background-color: #17a2b8;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">✏️ 手动输入内容</button>
                    
                    <button onclick="window.aiFeatures.showServerProxyOption('${url}')" style="
                        padding: 12px 16px;
                        background-color: #6c757d;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">🖥️ 服务器代理</button>
                </div>
                
                <div style="background: #e9ecef; padding: 15px; border-radius: 6px; margin-top: 15px; max-width: 500px;">
                    <h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">💡 推荐流程</h4>
                    <ol style="margin: 0; padding-left: 20px; text-align: left; color: #6c757d; font-size: 14px;">
                        <li>点击"新窗口打开"查看网页</li>
                        <li>复制需要分析的内容</li>
                        <li>点击"手动输入内容"粘贴文本</li>
                        <li>使用AI功能进行分析</li>
                    </ol>
                </div>
            </div>
        `;
        
        // 启用文字复制按钮
        document.getElementById('copy-text-btn').disabled = false;
        this.updateProcessButton();
    }

    displayManualContent(content) {
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = '';
        
        const container = document.createElement('div');
        container.style.cssText = `
            width: 100%;
            height: 100%;
            overflow: auto;
            background: white;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
        `;
        
        const header = document.createElement('div');
        header.style.cssText = `
            background: #e3f2fd;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #1976d2;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        header.innerHTML = `
            <span>✏️</span>
            <span>手动输入的内容 (${content.length} 字符)</span>
        `;
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = `
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
        `;
        contentDiv.textContent = content;
        
        container.appendChild(header);
        container.appendChild(contentDiv);
        viewer.appendChild(container);
        
        // 启用相关功能
        this.currentContent = content;
        document.getElementById('screenshot-btn').disabled = false;
        document.getElementById('copy-text-btn').disabled = false;
        this.updateProcessButton();
    }

    showServerProxyOption(url) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 25px;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333;">服务器代理方案</h3>
            <p style="color: #666; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
                为了更好地处理受限网站，你可以：
            </p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #495057;">🚀 本地服务器方案</h4>
                <p style="font-size: 13px; color: #6c757d; margin: 0;">
                    运行本地Node.js代理服务器，可以绕过大部分限制。需要技术基础。
                </p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #495057;">🔧 浏览器扩展方案</h4>
                <p style="font-size: 13px; color: #6c757d; margin: 0;">
                    安装CORS解除扩展程序，临时禁用浏览器安全策略。
                </p>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
                    padding: 8px 16px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                ">关闭</button>
                <button onclick="window.aiFeatures.setupLocalProxy()" style="
                    padding: 8px 16px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                ">了解更多</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    setupLocalProxy() {
        // 关闭模态框
        const modals = document.querySelectorAll('div[style*="z-index: 10000"]');
        modals.forEach(modal => modal.remove());
        
        // 显示技术方案说明
        const viewer = document.getElementById('content-viewer');
        viewer.innerHTML = `
            <div style="padding: 30px; background: white; height: 100%; overflow: auto;">
                <h2 style="color: #333; margin-bottom: 20px;">🚀 本地代理服务器设置指南</h2>
                
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <strong>注意：</strong> 此方案需要基本的技术知识，请谨慎操作。
                </div>
                
                <h3 style="color: #495057; margin: 25px 0 10px 0;">步骤 1: 创建代理服务器</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-bottom: 15px;">
// proxy-server.js<br>
const express = require('express');<br>
const { createProxyMiddleware } = require('http-proxy-middleware');<br>
const cors = require('cors');<br><br>

const app = express();<br>
app.use(cors());<br><br>

app.use('/proxy', createProxyMiddleware({<br>
&nbsp;&nbsp;target: 'http://example.com',<br>
&nbsp;&nbsp;changeOrigin: true,<br>
&nbsp;&nbsp;pathRewrite: { '^/proxy': '' }<br>
}));<br><br>

app.listen(3001, () => {<br>
&nbsp;&nbsp;console.log('代理服务器运行在 http://localhost:3001');<br>
});
                </div>
                
                <h3 style="color: #495057; margin: 25px 0 10px 0;">步骤 2: 安装依赖</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-bottom: 15px;">
npm install express http-proxy-middleware cors
                </div>
                
                <h3 style="color: #495057; margin: 25px 0 10px 0;">步骤 3: 运行服务器</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-bottom: 15px;">
node proxy-server.js
                </div>
                
                <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 6px; margin-top: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #0c5460;">💡 简单替代方案</h4>
                    <p style="margin: 0; font-size: 14px; color: #0c5460;">
                        如果你不熟悉技术操作，建议使用"手动输入内容"功能，这是最可靠的方法。
                    </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <button onclick="window.aiFeatures.showTextInputModal()" style="
                        padding: 12px 24px;
                        background: #28a745;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 16px;
                    ">返回手动输入</button>
                </div>
            </div>
        `;
    }

    startScreenshot() {
        const overlay = document.getElementById('selection-overlay');
        const contentViewer = document.getElementById('content-viewer');
        overlay.style.display = 'block';
        this.isSelecting = true;

        let startX, startY, endX, endY;
        let isDrawing = false;

        const handleMouseDown = (e) => {
            isDrawing = true;
            startX = e.clientX;
            startY = e.clientY;

            // 创建选择框
            this.selectionBox = document.createElement('div');
            this.selectionBox.className = 'selection-box';
            overlay.appendChild(this.selectionBox);
            
            console.log('开始截图选择:', { startX, startY });
        };

        const handleMouseMove = (e) => {
            if (!isDrawing) return;

            endX = e.clientX;
            endY = e.clientY;

            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            this.selectionBox.style.left = left + 'px';
            this.selectionBox.style.top = top + 'px';
            this.selectionBox.style.width = width + 'px';
            this.selectionBox.style.height = height + 'px';
        };

        const handleMouseUp = async (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            const left = Math.min(startX, endX); // 相对于视口
            const top = Math.min(startY, endY); // 相对于视口
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            console.log('用户选择区域 (相对于视口):', { left, top, width, height });
            // console.log('content-viewer位置:', { // 旧的日志，不再直接相关
            //     offsetLeft: contentViewer.offsetLeft, 
            //     offsetTop: contentViewer.offsetTop,
            //     scrollLeft: contentViewer.scrollLeft,
            //     scrollTop: contentViewer.scrollTop
            // });

            if (width > 10 && height > 10) {
                // 不再需要计算相对于 content-viewer 的坐标
                // const viewerRect = contentViewer.getBoundingClientRect();
                // const relativeX = left - viewerRect.left + contentViewer.scrollLeft;
                // const relativeY = top - viewerRect.top + contentViewer.scrollTop;
                // console.log('相对坐标 (旧):', { relativeX, relativeY, width, height });
                
                // 直接使用相对于视口的坐标 left, top
                await this.captureScreenshot(left, top, width, height);
            } else {
                alert('选择区域太小，请重新选择');
            }

            this.cancelSelection();
        };

        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mouseup', handleMouseUp);
    }

    async captureScreenshot(x, y, width, height) {
        this.showLoading('正在截图...');
        const overlay = document.getElementById('selection-overlay');
        let overlayOriginalDisplay;

        if (overlay) {
            overlayOriginalDisplay = overlay.style.display;
            overlay.style.display = 'none'; // 显式隐藏遮罩层（及其子元素选择框）
        }

        try {
            console.log('开始截图，用户选择区域 (CSS像素，相对于视口):', { x, y, width, height });
            
            const dpr = window.devicePixelRatio || 1; // 设备像素比

            let captureElement = document.getElementById('content-viewer');
            
            const viewerRect = captureElement.getBoundingClientRect();
            // 核心修复：计算选择区域相对于可滚动内容顶部的坐标
            const selectionX_logical = x - viewerRect.left + captureElement.scrollLeft;
            const selectionY_logical = y - viewerRect.top + captureElement.scrollTop;
            console.log(`滚动修正前: y=${y}, viewerRect.top=${viewerRect.top}, scrollTop=${captureElement.scrollTop}`);
            console.log(`滚动修正后: selectionY_logical=${selectionY_logical}`);
            const selectionWidth_logical = width;
            const selectionHeight_logical = height;

            const contentWidth_logical = captureElement.scrollWidth;
            const contentHeight_logical = captureElement.scrollHeight;

            // --- 1. 准备 html2canvas 参数 ---
            const captureOptions = {
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
                width: contentWidth_logical,
                height: contentHeight_logical,
                useCORS: true,
                allowTaint: true,
                scale: dpr,
                backgroundColor: '#ffffff',
                logging: true,
                imageTimeout: 15000,
                removeContainer: true,
                foreignObjectRendering: true,
                onclone: (clonedDoc) => {
                    const style = clonedDoc.createElement('style');
                    style.textContent = `
                        * { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                            -webkit-font-smoothing: antialiased !important;
                            -moz-osx-font-smoothing: grayscale !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            };
            
            console.log('html2canvas 捕获内容参数 (基于逻辑像素，scale应用dpr):', {
                x: captureOptions.x,
                y: captureOptions.y,
                captureWidth: captureOptions.width,
                captureHeight: captureOptions.height,
                scale: captureOptions.scale
            });

            // --- 2. 截取整个当前内容 ---
            const originalScrollTop = captureElement.scrollTop;
            const originalHeight = captureElement.style.height;
            let originalPageState;
            let fullCanvas;
            if (this.pdfState) {
                const pdf = this.pdfState.pdf;
                const scale = this.pdfState.currentScale;
                const outputScale = window.devicePixelRatio || 1;
                const contentWidth = captureElement.scrollWidth;
                let totalHeight = 20;
                const pageViewports = [];
                let currentY = 20;
                const isAllMode = this.pdfState.mode === 'all';
                const startPage = isAllMode ? 1 : this.pdfState.currentPage;
                const endPage = isAllMode ? this.pdfState.totalPages : this.pdfState.currentPage;
                for (let i = startPage; i <= endPage; i++) {
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({scale});
                    const offsetX = Math.max(0, (contentWidth - vp.width) / 2);
                    if (isAllMode) {
                        currentY += 24;
                        totalHeight += 24;
                    }
                    pageViewports.push({page, vp, startY: currentY, offsetX});
                    currentY += vp.height;
                    totalHeight += vp.height;
                    if (i < endPage) {
                        currentY += 20;
                        totalHeight += 20;
                    }
                }
                totalHeight += 20;
                const tempContainer = document.createElement('div');
                tempContainer.style.position = 'absolute';
                tempContainer.style.left = '-9999px';
                tempContainer.style.width = `${contentWidth}px`;
                tempContainer.style.height = `${totalHeight}px`;
                tempContainer.style.backgroundColor = '#ffffff';
                document.body.appendChild(tempContainer);
                for (let item of pageViewports) {
                    if (isAllMode) {
                        const label = document.createElement('div');
                        label.textContent = `第 ${item.page.pageNumber} 页`;
                        label.style.position = 'absolute';
                        label.style.left = '0';
                        label.style.top = `${item.startY - 24}px`;
                        label.style.width = '100%';
                        label.style.textAlign = 'center';
                        label.style.color = '#666';
                        label.style.fontSize = '14px';
                        tempContainer.appendChild(label);
                    }
                    const pageContainer = document.createElement('div');
                    pageContainer.style.position = 'absolute';
                    pageContainer.style.left = `${item.offsetX}px`;
                    pageContainer.style.top = `${item.startY}px`;
                    pageContainer.style.width = `${item.vp.width}px`;
                    pageContainer.style.height = `${item.vp.height}px`;
                    const canvas = document.createElement('canvas');
                    canvas.width = item.vp.width * outputScale;
                    canvas.height = item.vp.height * outputScale;
                    canvas.style.width = `${item.vp.width}px`;
                    canvas.style.height = `${item.vp.height}px`;
                    const ctx = canvas.getContext('2d');
                    const renderContext = {
                        canvasContext: ctx,
                        viewport: item.vp,
                        transform: [outputScale, 0, 0, outputScale, 0, 0]
                    };
                    await item.page.render(renderContext).promise;
                    pageContainer.appendChild(canvas);
                    const textLayerDiv = document.createElement('div');
                    textLayerDiv.style.position = 'absolute';
                    textLayerDiv.style.left = '0';
                    textLayerDiv.style.top = '0';
                    textLayerDiv.style.width = '100%';
                    textLayerDiv.style.height = '100%';
                    textLayerDiv.style.overflow = 'hidden';
                    textLayerDiv.style.opacity = '1';
                    textLayerDiv.style.color = 'black';
                    textLayerDiv.className = 'textLayer';
                    pageContainer.appendChild(textLayerDiv);
                    const textContent = await item.page.getTextContent();
                    await pdfjsLib.renderTextLayer({
                        textContentSource: textContent,
                        container: textLayerDiv,
                        viewport: item.vp,
                        textDivs: []
                    });
                    tempContainer.appendChild(pageContainer);
                }
                fullCanvas = await html2canvas(tempContainer, {
                    scale: 1,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                });
                document.body.removeChild(tempContainer);
            } else {
                fullCanvas = await html2canvas(captureElement, captureOptions);
            }

            console.log('html2canvas (内容) 完成，fullCanvas物理尺寸:', { 
                width: fullCanvas.width,
                height: fullCanvas.height
            });

            if (fullCanvas.width === 0 || fullCanvas.height === 0) {
                throw new Error('内容截图的Canvas为空，请检查页面内容');
            }

            // --- 3. 从视口截图中裁剪出用户选择的区域 ---

            // 将用户选择的逻辑坐标和尺寸，限定在视口范围内 (仍为逻辑像素)
            const cropX_logical = Math.max(0, selectionX_logical);
            const cropY_logical = Math.max(0, selectionY_logical);
            
            // 计算实际裁剪宽度/高度 (逻辑像素)，确保不超出内容边界
            const effectiveCropWidth_logical = Math.max(0, Math.min(selectionWidth_logical, contentWidth_logical - cropX_logical));
            const effectiveCropHeight_logical = Math.max(0, Math.min(selectionHeight_logical, contentHeight_logical - cropY_logical));


            if (effectiveCropWidth_logical <= 0 || effectiveCropHeight_logical <= 0) {
                throw new Error('选择的截图区域无效或过小（可能完全在视口外），导致裁剪后尺寸为0。');
            }

            // 创建最终裁剪后的canvas，其尺寸为物理像素
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = effectiveCropWidth_logical * dpr;
            croppedCanvas.height = effectiveCropHeight_logical * dpr;
            const ctx = croppedCanvas.getContext('2d');

            // drawImage 的源参数 (sx, sy, sWidth, sHeight) 需为 viewportCanvas 中的物理像素值
            // 用户选择的 x,y (selectionX_logical, selectionY_logical) 是相对于视口左上角的
            // viewportCanvas 已经从 (window.scrollX, window.scrollY) 开始捕获，
            // 所以 selectionX_logical, selectionY_logical 就是 viewportCanvas 左上角开始的逻辑偏移
            const sx_physical = cropX_logical * dpr;
            const sy_physical = cropY_logical * dpr;
            const sWidth_physical = effectiveCropWidth_logical * dpr;
            const sHeight_physical = effectiveCropHeight_logical * dpr;
            
            console.log('裁剪参数 (均为物理像素):', {
                sourceX: sx_physical, sourceY: sy_physical,
                sourceWidth: sWidth_physical, sourceHeight: sHeight_physical,
                destWidth: croppedCanvas.width, destHeight: croppedCanvas.height
            });
            
            ctx.drawImage(
                fullCanvas,
                sx_physical,
                sy_physical,
                sWidth_physical,
                sHeight_physical,
                0,
                0,
                croppedCanvas.width,
                croppedCanvas.height
            );
            
            console.log('裁剪完成，croppedCanvas物理尺寸:', { 
                width: croppedCanvas.width, 
                height: croppedCanvas.height 
            });

            if (croppedCanvas.width === 0 || croppedCanvas.height === 0) {
                throw new Error('裁剪后的截图区域为空，请重新选择有内容的区域');
            }

            const imageData = croppedCanvas.toDataURL('image/png', 1.0);
            
            if (imageData === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==') {
                throw new Error('截图内容为空白，可能是选择区域没有可见内容或页面渲染问题');
            }
            
            const imageSizeKB = Math.round((imageData.length * 3/4) / 1024);
            console.log(`最终截图大小: ${imageSizeKB}KB`);
            
            let finalImageData = imageData;
            if (imageSizeKB > 4000) {
                finalImageData = croppedCanvas.toDataURL('image/jpeg', 0.8);
                console.log('图片已压缩以提高处理速度 (JPEG 0.8)');
            }
            
            this.selectedContent = {
                type: 'image',
                data: finalImageData,
                metadata: {
                    width: croppedCanvas.width, // 物理像素
                    height: croppedCanvas.height, // 物理像素
                    sizeKB: imageSizeKB,
                    originalCoords: { // 用户选择区域的有效逻辑坐标和尺寸
                        x: cropX_logical, 
                        y: cropY_logical, 
                        width: effectiveCropWidth_logical, 
                        height: effectiveCropHeight_logical 
                    }
                }
            };

            this.updateProcessButton();
            this.hideLoading();
            this.showScreenshotPreview(finalImageData, croppedCanvas.width, croppedCanvas.height, imageSizeKB);
            
        } catch (error) {
            console.error('截图失败:', error);
            alert(`截图失败: ${error.message}\n\n请尝试：\n1. 确保选择的区域内有可见内容。\n2. 如果页面复杂，尝试选择稍小或结构简单的区域。\n3. 刷新页面后重试。`);
            this.hideLoading();
        } finally {
            if (overlay) {
                overlay.style.display = overlayOriginalDisplay; // 恢复遮罩层的显示状态
            }
        }
    }

    showScreenshotPreview(imageData, width, height, sizeKB) {
        // 创建预览窗口
        const previewWindow = document.createElement('div');
        previewWindow.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #ccc;
            border-radius: 8px;
            padding: 20px;
            z-index: 10001;
            max-width: 80vw;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        previewWindow.innerHTML = `
            <div style="text-align: center;">
                <h3 style="margin-top: 0; color: #333;">截图预览</h3>
                <p style="color: #666;">尺寸: ${width}x${height} | 大小: ${sizeKB}KB</p>
                <img src="${imageData}" style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                <div style="margin-top: 15px;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        确认使用
                    </button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove(); window.aiFeatures.selectedContent = null; window.aiFeatures.updateProcessButton();" 
                            style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        重新截图
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(previewWindow);

        // 3秒后自动关闭预览（如果用户没有操作）
        setTimeout(() => {
            if (document.body.contains(previewWindow)) {
                previewWindow.remove();
            }
        }, 10000);
    }

    async copySelectedText() {
        let textToCopy = '';

        if (this.currentWebpage && this.currentWebpage.text) {
            textToCopy = this.currentWebpage.text;
        } else if (this.currentPDF && this.currentPDF.pages) {
            textToCopy = this.currentPDF.pages.map(page => page.text).join('\n\n');
        }

        const selection = window.getSelection();
        textToCopy = selection.toString().trim();

        if (!textToCopy) {
            // 如果没有通过 window.getSelection() 获取到文本，则回退到旧的逻辑
            console.log('通过 window.getSelection() 未获取到选中文本，尝试旧的逻辑');
            if (this.currentWebpage && this.currentWebpage.text) {
                textToCopy = this.currentWebpage.text;
            } else if (this.currentPDF && this.currentPDF.pages) {
                textToCopy = this.currentPDF.pages.map(page => page.text).join('\n\n');
            }
        }

        if (textToCopy.trim()) {
            try {
                await navigator.clipboard.writeText(textToCopy);
                alert('文本已复制到剪贴板');
                this.selectedContent = { type: 'text', data: textToCopy };
                this.updateProcessButton();
                this.showTextPreview(textToCopy);
            } catch (err) {
                console.error('复制失败:', err);
                alert('复制失败，请手动复制');
            }
        } else {
            alert('没有可复制的文本，或者文本正在提取中，请稍后再试。');
        }
    }

    extractMindmapText(range) {
        // 提取选区内思维导图节点的层级文本
        let markdown = '';
        const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT, { acceptNode: node => node.tagName === 'text' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
        while (walker.nextNode()) {
            if (range.intersectsNode(walker.currentNode)) {
                let level = 1;
                let parent = walker.currentNode.parentElement;
                while (parent && parent !== document.querySelector('#mindmap-container')) {
                    level++;
                    parent = parent.parentElement;
                }
                markdown += `${'#'.repeat(level)} ${walker.currentNode.textContent.trim()}\n`;
            }
        }
        return markdown.trim();
    }

    showTextPreview(text) {
        const preview = document.createElement('div');
        preview.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; max-width: 80%; max-height: 80%; overflow: auto;';
        preview.innerHTML = `<h3>复制的文本预览：</h3><pre style="white-space: pre-wrap; word-wrap: break-word;">${text}</pre>`;
        document.body.appendChild(preview);
        setTimeout(() => preview.remove(), 5000);
    }

    cancelSelection() {
        const overlay = document.getElementById('selection-overlay');
        overlay.style.display = 'none';
        this.isSelecting = false;
        
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }



    async callQwenAPI(apiKey, systemPrompt, userPrompt, content) {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        // 如果是图片，需要使用通义千问VL模型
        let modelName = 'qwen-plus';
        if (content.type === 'image') {
            modelName = 'qwen-vl-plus'; // 使用VL模型处理图片
            
            // 检查图片数据质量
            console.log('图片处理信息:');
            console.log('- 图片大小:', content.metadata ? `${content.metadata.width}x${content.metadata.height}` : '未知');
            console.log('- 文件大小:', content.metadata ? `${content.metadata.sizeKB}KB` : '未知');
            console.log('- 数据长度:', content.data.length);
            
            // 验证base64格式
            if (!content.data.startsWith('data:image/')) {
                throw new Error('图片格式错误，请重新截图');
            }
            
            messages[1].content = [
                { 
                    type: 'text', 
                    text: userPrompt 
                },
                { 
                    type: 'image_url', 
                    image_url: { 
                        url: content.data,
                        detail: 'high' // 要求高质量分析
                    } 
                }
            ];
            
            console.log('使用通义千问VL模型进行图片分析...');
        }

        try {
            // 首先尝试OpenAI兼容模式（更稳定）
            let compatibleError = null;
            try {
                console.log('尝试通义千问OpenAI兼容模式...');
                const openaiCompatibleBody = {
                    model: modelName,
                    messages: messages,
                    temperature: 0.3, // 降低温度以提高准确性
                    max_tokens: 3000, // 增加token数量以获得更详细的分析
                    top_p: 0.8
                };

                console.log('OpenAI兼容模式请求模型:', modelName);
                console.log('请求消息数量:', messages.length);
                if (content.type === 'image') {
                    console.log('图片消息结构:', {
                        textLength: messages[1].content[0].text.length,
                        hasImage: !!messages[1].content[1].image_url
                    });
                }

                const openaiResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(openaiCompatibleBody)
                });

                if (openaiResponse.ok) {
                    const openaiData = await openaiResponse.json();
                    console.log('OpenAI兼容模式响应状态: 成功');
                    console.log('响应数据结构:', {
                        hasChoices: !!openaiData.choices,
                        choicesLength: openaiData.choices ? openaiData.choices.length : undefined,
                        hasMessage: openaiData.choices && openaiData.choices[0] ? !!openaiData.choices[0].message : false,
                        contentLength: openaiData.choices && openaiData.choices[0] && openaiData.choices[0].message && openaiData.choices[0].message.content ? openaiData.choices[0].message.content.length : 0
                    });
                    
                    if (openaiData.choices && openaiData.choices[0] && openaiData.choices[0].message) {
                        const result = openaiData.choices[0].message.content;
                        console.log('AI分析结果长度:', result.length);
                        return result;
                    } else {
                        compatibleError = new Error('No valid choices in response');
                    }
                } else {
                    const errorText = await openaiResponse.text();
                    console.log('OpenAI兼容模式失败:', openaiResponse.status, errorText);
                    compatibleError = new Error('Response not ok: ' + openaiResponse.status);
                }
            } catch (error) {
                compatibleError = error;
            }

            if (compatibleError) {
                console.log('OpenAI兼容模式失败，尝试DashScope原生模式:', compatibleError.message);
            }

            // 备用：使用DashScope原生API格式
            const requestBody = {
                model: modelName,
                input: {
                    messages: messages
                },
                parameters: {
                    temperature: 0.3,
                    max_tokens: 3000,
                    top_p: 0.8,
                    result_format: 'message'
                }
            };

            console.log('通义千问原生API请求模型:', modelName);

            // 根据模型类型选择不同的API端点
            const apiEndpoint = content.type === 'image' 
                ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
                : 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

            console.log('使用API端点:', apiEndpoint);

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Qwen原生API错误响应:', response.status, errorText);
                
                if (response.status === 401) {
                    throw new Error('API密钥无效，请检查通义千问API密钥是否正确');
                } else if (response.status === 429) {
                    throw new Error('API调用频率超限，请稍后重试');
                } else if (response.status === 400) {
                    throw new Error('请求参数错误，可能是图片格式不支持或内容过大，请尝试重新截图');
                }
                
                throw new Error(`通义千问API调用失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            console.log('通义千问原生API响应状态:', data.status_code);
            console.log('响应数据结构:', {
                hasOutput: !!data.output,
                hasChoices: data.output ? !!data.output.choices : false,
                choicesLength: data.output && data.output.choices ? data.output.choices.length : undefined,
                hasMessage: data.output && data.output.choices && data.output.choices[0] ? !!data.output.choices[0].message : false
            });
            
            // 检查响应格式
            if (data.status_code !== 200) {
                throw new Error(`通义千问API返回错误: ${data.message || '未知错误'}`);
            }
            
            if (!data.output || !data.output.choices || !data.output.choices[0]) {
                throw new Error('通义千问API返回数据格式异常');
            }
            
            const result = data.output.choices[0].message.content;
            console.log('AI分析结果长度:', result.length);
            return result;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('网络连接失败，请检查：\n1. 网络连接是否正常\n2. API密钥是否正确\n3. 网络防火墙设置');
            }
            throw error;
        }
    }

    async callOpenAIAPI(model, apiKey, systemPrompt, userPrompt, content) {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        // GPT-4支持图片
        if (content.type === 'image' && model === 'gpt-4') {
            messages[1].content = [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: content.data } }
            ];
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model === 'gpt-4' ? 'gpt-4-vision-preview' : 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('OpenAI API错误响应:', errorData);
                
                if (response.status === 401) {
                    throw new Error('API密钥无效，请检查OpenAI API密钥是否正确');
                } else if (response.status === 429) {
                    throw new Error('API调用频率超限，请稍后重试');
                } else if (response.status === 403) {
                    throw new Error('API访问被拒绝，请检查账户状态和权限');
                }
                
                throw new Error(`OpenAI API调用失败 (${response.status}): ${errorData.error && errorData.error.message ? errorData.error.message : '未知错误'}`);
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0]) {
                throw new Error('OpenAI API返回数据格式异常');
            }
            
            return data.choices[0].message.content;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('网络连接失败，请检查：\n1. 网络连接是否正常\n2. 是否需要科学上网访问OpenAI\n3. API密钥是否正确');
            }
            throw error;
        }
    }

    async callClaudeAPI(apiKey, systemPrompt, userPrompt, content) {
        // Claude API实现
        throw new Error('Claude API集成正在开发中');
    }

    async callGeminiAPI(apiKey, systemPrompt, userPrompt, content) {
        // Gemini API实现
        throw new Error('Gemini API集成正在开发中');
    }

    showLoading(text = '正在处理...') {
        const indicator = document.getElementById('loading-indicator');
        const loadingText = document.getElementById('loading-text');
        loadingText.textContent = text;
        indicator.style.display = 'flex';
    }

    hideLoading() {
        const indicator = document.getElementById('loading-indicator');
        indicator.style.display = 'none';
    }

    // 新增：提取合法思维导图代码块
    extractMindmap(raw) {
        const codeBlockRegex = /```text[\s\S]*?```/i;
        const match = raw.match(codeBlockRegex);
        if (!match) {
            alert('AI 返回结果不符合格式要求，请重试或检查提示词设置。\n原始输出已写入控制台。');
            console.error('AI 原始输出:', raw);
            return raw;
        }
        // 去掉 ```text 与 ``` 包装
        let content = match[0].replace(/```text/i, '').replace(/```/g, '');
        // 去除首尾空行
        content = content.trim();
        return '```text\n' + content + '\n```';
    }

    // 新增：自动关闭提示弹窗
    patchAlert() {
        if (window.__autoAlertPatched) return;
        window.__autoAlertPatched = true;
        window.alert = (msg = '') => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top:0; left:0; width:100%; height:100%;
                display:flex; align-items:center; justify-content:center;
                background: rgba(0,0,0,0.3); z-index: 3000;`;
            const box = document.createElement('div');
            box.style.cssText = `background:#fff; padding:20px 30px; border-radius:8px;
                box-shadow:0 4px 12px rgba(0,0,0,0.15); font-size:16px; color:#333;`;
            box.textContent = msg;
            modal.appendChild(box);
            document.body.appendChild(modal);
            setTimeout(() => {
                if (document.body.contains(modal)) document.body.removeChild(modal);
            }, 1000); // 1秒后自动关闭
        };
    }
}

// 初始化AI功能
document.addEventListener('DOMContentLoaded', () => {
    window.aiFeatures = new AIFeatures();
});