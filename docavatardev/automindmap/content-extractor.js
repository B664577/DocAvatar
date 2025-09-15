class ContentExtractor {
    constructor() {
        this.apiServices = [
            {
                name: 'AllOrigins',
                url: 'https://api.allorigins.win/get',
                type: 'cors-proxy',
                extractContent: (data) => {
                    if (data.contents) {
                        return data.contents;
                    }
                    return null;
                }
            },
            {
                name: 'CORS Anywhere',
                url: 'https://cors-anywhere.herokuapp.com/',
                type: 'direct-proxy',
                extractContent: (data) => data
            },
            {
                name: 'ThingProxy',
                url: 'https://thingproxy.freeboard.io/fetch/',
                type: 'direct-proxy',
                extractContent: (data) => data
            },
            {
                name: 'Corsproxy',
                url: 'https://corsproxy.io/?',
                type: 'direct-proxy',
                extractContent: (data) => data
            }
        ];
    }

    async extractContent(url, options = {}) {
        const {
            timeout = 10000,
            maxRetries = 3,
            onProgress = null,
            onError = null
        } = options;

        // 标准化URL
        const normalizedUrl = this.normalizeUrl(url);
        
        if (onProgress) {
            onProgress('开始抓取网页内容...');
        }

        // 尝试多种方法抓取内容
        const methods = [
            () => this.tryDirectFetch(normalizedUrl, timeout),
            () => this.tryWithProxyServices(normalizedUrl, timeout),
            () => this.tryWithReadabilityAPI(normalizedUrl, timeout),
            () => this.tryWithMercuryAPI(normalizedUrl, timeout)
        ];

        for (let i = 0; i < methods.length; i++) {
            const method = methods[i];
            
            try {
                if (onProgress) {
                    onProgress(`尝试方法 ${i + 1}/${methods.length}...`);
                }
                
                const result = await method();
                if (result && result.content) {
                    return {
                        success: true,
                        content: result.content,
                        title: result.title || '',
                        url: normalizedUrl,
                        method: result.method,
                        timestamp: Date.now()
                    };
                }
            } catch (error) {
                console.warn(`方法 ${i + 1} 失败:`, error.message);
                if (onError) {
                    onError(`方法 ${i + 1} 失败: ${error.message}`);
                }
            }
        }

        return {
            success: false,
            error: '所有抓取方法都失败了',
            url: normalizedUrl
        };
    }

    normalizeUrl(url) {
        if (!url) return '';
        
        // 移除多余的空格
        url = url.trim();
        
        // 如果没有协议，添加https
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        return url;
    }

    async tryDirectFetch(url, timeout) {
        // 直接尝试fetch (通常会因为CORS失败，但值得尝试)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                mode: 'cors',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            const extracted = this.extractTextFromHTML(html);
            
            return {
                content: extracted.text,
                title: extracted.title,
                method: 'direct-fetch'
            };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async tryWithProxyServices(url, timeout) {
        for (const service of this.apiServices) {
            try {
                const result = await this.callProxyService(service, url, timeout);
                if (result) {
                    return {
                        ...result,
                        method: `proxy-${service.name.toLowerCase()}`
                    };
                }
            } catch (error) {
                console.warn(`代理服务 ${service.name} 失败:`, error);
            }
        }
        throw new Error('所有代理服务都失败了');
    }

    async callProxyService(service, url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            let apiUrl;
            const options = {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            if (service.type === 'cors-proxy') {
                // AllOrigins 类型的API
                apiUrl = `${service.url}?url=${encodeURIComponent(url)}`;
            } else {
                // 直接代理类型
                apiUrl = service.url + encodeURIComponent(url);
            }
            
            const response = await fetch(apiUrl, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            let data;
            if (service.type === 'cors-proxy') {
                data = await response.json();
                const content = service.extractContent(data);
                if (content) {
                    const extracted = this.extractTextFromHTML(content);
                    return {
                        content: extracted.text,
                        title: extracted.title
                    };
                }
            } else {
                const html = await response.text();
                const extracted = this.extractTextFromHTML(html);
                return {
                    content: extracted.text,
                    title: extracted.title
                };
            }
            
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async tryWithReadabilityAPI(url, timeout) {
        try {
            // 尝试使用Mercury Parser或类似的API
            const apiUrl = `https://readability-api.com/api/content?url=${encodeURIComponent(url)}`;
            
            const response = await fetch(apiUrl, {
                timeout: timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.content) {
                    return {
                        content: data.content,
                        title: data.title || '',
                        method: 'readability-api'
                    };
                }
            }
        } catch (error) {
            console.warn('Readability API 失败:', error);
        }
        
        throw new Error('Readability API 不可用');
    }

    async tryWithMercuryAPI(url, timeout) {
        try {
            // 尝试使用Mercury Web Parser
            const apiUrl = `https://mercury.postlight.com/parser?url=${encodeURIComponent(url)}`;
            
            const response = await fetch(apiUrl, {
                timeout: timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'x-api-key': 'your-mercury-api-key' // 需要API密钥
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.content) {
                    return {
                        content: data.content,
                        title: data.title || '',
                        method: 'mercury-api'
                    };
                }
            }
        } catch (error) {
            console.warn('Mercury API 失败:', error);
        }
        
        throw new Error('Mercury API 不可用');
    }

    extractTextFromHTML(html) {
        try {
            // 创建一个临时的DOM来解析HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 移除不需要的元素
            const elementsToRemove = [
                'script', 'style', 'nav', 'header', 'footer', 
                'aside', 'noscript', 'iframe', 'object', 'embed'
            ];
            
            elementsToRemove.forEach(tag => {
                const elements = doc.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });
            
            // 获取标题
            let title = '';
            const titleElement = doc.querySelector('title');
            if (titleElement) {
                title = titleElement.textContent.trim();
            }
            
            // 尝试获取文章内容
            let content = '';
            
            // 首先尝试查找常见的内容容器
            const contentSelectors = [
                'article',
                '[role="main"]',
                '.content',
                '.post-content',
                '.entry-content',
                '.article-content',
                '.main-content',
                'main',
                '.container'
            ];
            
            for (const selector of contentSelectors) {
                const element = doc.querySelector(selector);
                if (element) {
                    content = this.extractTextFromElement(element);
                    if (content.length > 200) { // 如果内容足够长，就使用这个
                        break;
                    }
                }
            }
            
            // 如果没有找到合适的内容，使用整个body
            if (!content || content.length < 200) {
                const body = doc.querySelector('body');
                if (body) {
                    content = this.extractTextFromElement(body);
                }
            }
            
            return {
                title: title,
                text: content.trim()
            };
            
        } catch (error) {
            console.error('HTML解析失败:', error);
            return {
                title: '',
                text: html.replace(/<[^>]*>/g, '').trim() // 简单的标签移除
            };
        }
    }

    extractTextFromElement(element) {
        if (!element) return '';
        
        // 克隆元素以避免修改原始DOM
        const clone = element.cloneNode(true);
        
        // 移除不需要的元素
        const unwantedElements = clone.querySelectorAll(
            'script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar'
        );
        unwantedElements.forEach(el => el.remove());
        
        // 获取文本内容
        let text = clone.textContent || clone.innerText || '';
        
        // 清理文本
        text = text
            .replace(/\s+/g, ' ') // 将多个空白字符替换为单个空格
            .replace(/\n\s*\n/g, '\n') // 移除多余的空行
            .trim();
        
        return text;
    }

    // 检测内容语言
    detectLanguage(text) {
        const chineseRegex = /[\u4e00-\u9fff]/g;
        const englishRegex = /[a-zA-Z]/g;
        
        const chineseMatches = text.match(chineseRegex) || [];
        const englishMatches = text.match(englishRegex) || [];
        
        if (chineseMatches.length > englishMatches.length) {
            return 'zh';
        } else if (englishMatches.length > 0) {
            return 'en';
        }
        
        return 'unknown';
    }

    // 提取摘要
    extractSummary(text, maxLength = 200) {
        if (!text) return '';
        
        // 按句子分割
        const sentences = text.split(/[.!?。！？]+/).filter(s => s.trim().length > 10);
        
        let summary = '';
        for (const sentence of sentences) {
            if (summary.length + sentence.length > maxLength) {
                break;
            }
            summary += sentence.trim() + '。';
        }
        
        return summary || text.substring(0, maxLength) + '...';
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentExtractor;
} else {
    window.ContentExtractor = ContentExtractor;
} 