class WebViewer {
    constructor() {
        this.init();
    }

    init() {
        this.initEventListeners();
    }

    initEventListeners() {
        console.log('初始化网页查看器事件监听器');
        const loadBtn = document.getElementById('load-webpage-btn');
        const urlInput = document.getElementById('webpage-url');
        const screenshotBtn = document.getElementById('screenshot-btn');
        const copyTextBtn = document.getElementById('copy-text-btn');
        
        if (!loadBtn) {
            console.error('加载网页按钮未找到');
            alert('加载网页按钮未找到');
        } else {
            loadBtn.addEventListener('click', () => {
                alert('加载网页按钮被点击');
                console.log('加载网页按钮被点击');
                this.loadWebpage();
            });
        }

        if (!urlInput) {
            console.error('URL输入框未找到');
            alert('URL输入框未找到');
        } else {
            urlInput.addEventListener('keypress', (e) => {
                console.log('URL输入框按键:', e.key);
                if (e.key === 'Enter') {
                    this.loadWebpage();
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

    loadWebpage() {
        console.log('开始加载网页');
        try {
            const urlInput = document.getElementById('webpage-url');
            if (!urlInput) {
                console.error('URL输入框未找到');
                alert('URL输入框未找到');
                return;
            }
            
            const url = urlInput.value.trim();
            if (!url) {
                alert('请输入有效的URL');
                console.log('URL为空');
                return;
            }
            
            console.log('加载URL:', url);
            const viewer = document.getElementById('content-viewer');
            if (!viewer) {
                console.error('内容查看器未找到');
                alert('内容查看器未找到');
                return;
            }
            
            alert(`正在加载网页: ${url}`);
            viewer.innerHTML = '<div class="loading">正在加载网页...</div>';
            
            const iframe = document.createElement('iframe');
            iframe.src = `/proxy?url=${encodeURIComponent(url)}`;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.onload = () => {
                console.log('iframe加载完成');
                alert('网页加载完成');
            };
            iframe.onerror = (error) => {
                console.error('iframe加载失败:', error);
                alert('网页加载失败');
            };
            
            viewer.innerHTML = '';
            viewer.appendChild(iframe);
        } catch (error) {
            console.error('加载网页出错:', error);
            alert('加载网页出错: ' + error.message);
        }
    }

    startScreenshot() {
        console.log('开始截图');
        try {
            const viewer = document.getElementById('content-viewer');
            if (!viewer) {
                console.error('内容查看器未找到');
                alert('内容查看器未找到');
                return;
            }
            
            alert('正在截图，请稍候...');
            html2canvas(viewer).then(canvas => {
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
    new WebViewer();
});