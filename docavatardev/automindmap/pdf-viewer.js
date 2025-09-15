class PDFViewer {
    constructor() {
        this.currentPDF = null;
        this.init();
    }

    init() {
        if (typeof pdfjs === 'undefined') {
            console.error('PDF.js库未加载');
            alert('PDF.js库加载失败，请检查网络连接');
            return;
        }
        
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.js';
        this.initEventListeners();
    }

    initEventListeners() {
        console.log('初始化PDF查看器事件监听器');
        const uploadBtn = document.getElementById('upload-pdf-btn');
        const pdfUpload = document.getElementById('pdf-upload');
        const screenshotBtn = document.getElementById('screenshot-btn');
        const copyTextBtn = document.getElementById('copy-text-btn');
        
        if (!uploadBtn) {
            console.error('上传PDF按钮未找到');
            alert('上传PDF按钮未找到');
        } else {
            uploadBtn.addEventListener('click', () => {
                alert('上传按钮被点击');
                console.log('上传按钮被点击');
                if (pdfUpload) {
                    pdfUpload.click();
                } else {
                    console.error('PDF上传输入框未找到');
                    alert('PDF上传输入框未找到');
                }
            });
        }

        if (!pdfUpload) {
            console.error('PDF上传输入框未找到');
        } else {
            pdfUpload.addEventListener('change', (e) => {
                console.log('PDF文件已选择', e.target.files);
                if (e.target.files && e.target.files[0]) {
                    this.handlePDFUpload(e.target.files[0]);
                } else {
                    console.error('未选择文件');
                    alert('未选择文件');
                }
            });
        }

        if (!screenshotBtn) {
            console.error('截图按钮未找到');
            alert('截图按钮未找到');
        } else {
            screenshotBtn.addEventListener('click', () => {
                alert('截图按钮被点击');
                console.log('截图按钮被点击');
                this.startScreenshot();
            });
        }

        if (!copyTextBtn) {
            console.error('复制文字按钮未找到');
            alert('复制文字按钮未找到');
        } else {
            copyTextBtn.addEventListener('click', () => {
                alert('复制文字按钮被点击');
                console.log('复制文字按钮被点击');
                this.copySelectedText();
            });
        }
    }

    async handlePDFUpload(file) {
        if (!file) return;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            this.currentPDF = { pdf, pages: [] };
            await this.renderPDF(pdf);
        } catch (error) {
            console.error('PDF加载失败:', error);
            alert('PDF加载失败: ' + error.message);
        }
    }

    async renderPDF(pdf) {
        const viewer = document.getElementById('content-viewer');
        if (!viewer) {
            console.error('内容查看器元素未找到');
            alert('内容查看器元素未找到');
            return;
        }
        viewer.innerHTML = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            canvas.style.display = 'block';
            canvas.style.margin = '10px auto';
            viewer.appendChild(canvas);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
    }

    startScreenshot() {
        console.log('开始截图');
        try {
            const pdfViewer = document.getElementById('content-viewer');
            if (!pdfViewer) {
                console.error('PDF查看器元素未找到');
                alert('PDF查看器元素未找到');
                return;
            }
            
            alert('正在截图，请稍候...');
            html2canvas(pdfViewer).then(canvas => {
                console.log('截图成功');
                const imgData = canvas.toDataURL('image/png');
                localStorage.setItem('extractedContent', imgData);
                alert('截图已保存，即将返回主页');
                window.location.href = 'index.html';
            }).catch(error => {
                console.error('截图失败:', error);
                alert('截图失败: ' + error.message);
            });
        } catch (error) {
            console.error('截图过程出错:', error);
            alert('截图过程出错: ' + error.message);
        }
    }

    copySelectedText() {
        console.log('开始复制文本');
        try {
            const selectedText = window.getSelection().toString();
            if (!selectedText) {
                alert('未选择任何文本，将使用示例文本');
                console.log('未选择文本，使用示例');
                localStorage.setItem('extractedContent', '示例复制文本');
            } else {
                console.log('已选择文本:', selectedText);
                localStorage.setItem('extractedContent', selectedText);
                alert('文本已复制，即将返回主页');
            }
            window.location.href = 'index.html';
        } catch (error) {
            console.error('复制文本失败:', error);
            alert('复制文本失败: ' + error.message);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new PDFViewer();
});