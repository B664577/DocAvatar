/**
 * 文件夹处理器
 * 负责处理文件夹中的图片和PDF文档，按顺序进行视觉识别和思维导图生成
 */
class FolderProcessor {
    constructor() {
        this.files = [];
        this.currentIndex = 0;
        this.isProcessing = false;
        this.isPaused = false;
        this.isStopped = false;
        this.shouldStopReading = false; // 用于控制朗读停止
        this.processedResults = [];
        this.folderName = '';
        this.watchedFolder = null;
        this.fileWatcher = null;
        this.processedFiles = new Set(); // 记录已处理的文件路径
        this.allDiscoveredFiles = new Set(); // 记录所有发现过的文件
        this.shouldResumeFromProgress = true; // 朗读进度管理
        this.preloadedResults = {}; // 存储预加载结果
        
        this.initializeElements();
        // 嵌入带背模式（mem）或部分页面缺少元素时，跳过初始化，避免空元素报错阻断其它功能
        if (!document.getElementById('select-folder-btn') || !document.getElementById('markdown-input')) {
            console.warn('FolderProcessor: 必需元素缺失，已在当前模式下禁用。');
            this.disabled = true;
            return;
        }
        this.bindEvents();
        this.loadSavedConfigs();
        this.setupFileWatcher();
    }

    initializeElements() {
        // 获取所有相关元素
        this.elements = {
            folderInput: document.getElementById('folder-input'),
            selectFolderBtn: document.getElementById('select-folder-btn'),
            selectedFolderName: document.getElementById('selected-folder-name'),
            startBtn: document.getElementById('start-folder-processing'),
            pauseBtn: document.getElementById('pause-folder-processing'),
            stopBtn: document.getElementById('stop-folder-processing'),
            progressContainer: document.getElementById('processing-progress'),
            currentFileName: document.getElementById('current-file-name'),
            progressCounter: document.getElementById('progress-counter'),
            progressFill: document.getElementById('progress-fill'),
            processingStatus: document.getElementById('processing-status'),
            visionResultDisplay: document.getElementById('vision-result-display'),
            visionModelSelect: document.getElementById('vision-model-select'),
            mindmapModelSelect: document.getElementById('mindmap-model-select'),
            visionApiKey: document.getElementById('vision-api-key'),
            mindmapApiKey: document.getElementById('mindmap-api-key'),
            markdownInput: document.getElementById('markdown-input'),
            toggleFolderConfigBtn: document.getElementById('toggle-folder-config-btn'),
            folderConfigContent: document.getElementById('folder-config-content'),
            // 新增提示词元素
            visionSystemPrompt: document.getElementById('vision-system-prompt'),
            visionUserPromptTemplate: document.getElementById('vision-user-prompt-template'),
            mindmapSystemPrompt: document.getElementById('mindmap-system-prompt'),
            mindmapUserPromptTemplate: document.getElementById('mindmap-user-prompt-template'),
            enableSensitiveFilter: document.getElementById('enable-sensitive-filter'),
            sensitiveApiUrl: document.getElementById('sensitive-api-url'),
            bannedWordsAppId: document.getElementById('banned-words-appid'),
            bannedWordsSecret: document.getElementById('banned-words-secret')
        };
    }

    bindEvents() {
        // 文件夹选择
        if (this.elements.selectFolderBtn && this.elements.folderInput) {
            this.elements.selectFolderBtn.addEventListener('click', () => {
                this.elements.folderInput.click();
            });
        }

        if (this.elements.folderInput) {
            this.elements.folderInput.addEventListener('change', (e) => {
                this.handleFolderSelection(e);
            });
        }

        // 处理控制按钮
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => {
                this.startProcessing();
            });
        }

        if (this.elements.pauseBtn) {
            this.elements.pauseBtn.addEventListener('click', () => {
                this.pauseProcessing();
            });
        }

        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => {
                this.stopProcessing();
                this.stopFileWatcher();
            });
        }

        // 配置切换
        if (this.elements.toggleFolderConfigBtn) {
            this.elements.toggleFolderConfigBtn.addEventListener('click', () => {
                this.toggleConfig();
            });
        }

        // API密钥保存
        document.getElementById('save-vision-api-key').addEventListener('click', () => {
            this.saveVisionApiKey();
        });

        document.getElementById('save-mindmap-api-key').addEventListener('click', () => {
            this.saveMindmapApiKey();
        });

        // 模型选择保存
        this.elements.visionModelSelect.addEventListener('change', () => {
            this.saveConfig('vision-model', this.elements.visionModelSelect.value);
        });

        this.elements.mindmapModelSelect.addEventListener('change', () => {
            this.saveConfig('mindmap-model', this.elements.mindmapModelSelect.value);
        });

        // 提示词保存
        if (this.elements.visionSystemPrompt) {
            this.elements.visionSystemPrompt.addEventListener('input', () => {
                this.saveConfig('vision-system-prompt', this.elements.visionSystemPrompt.value);
            });
        }

        if (this.elements.visionUserPromptTemplate) {
            this.elements.visionUserPromptTemplate.addEventListener('input', () => {
                this.saveConfig('vision-user-prompt-template', this.elements.visionUserPromptTemplate.value);
            });
        }

        if (this.elements.mindmapSystemPrompt) {
            this.elements.mindmapSystemPrompt.addEventListener('input', () => {
                this.saveConfig('mindmap-system-prompt', this.elements.mindmapSystemPrompt.value);
            });
        }

        if (this.elements.mindmapUserPromptTemplate) {
            this.elements.mindmapUserPromptTemplate.addEventListener('input', () => {
                this.saveConfig('mindmap-user-prompt-template', this.elements.mindmapUserPromptTemplate.value);
            });
        }

        // API密钥显示/隐藏
        document.getElementById('toggle-vision-api-visibility').addEventListener('click', () => {
            this.toggleApiVisibility('vision-api-key');
        });

        document.getElementById('toggle-mindmap-api-visibility').addEventListener('click', () => {
            this.toggleApiVisibility('mindmap-api-key');
        });

        // 敏感词过滤配置事件
        if (this.elements.enableSensitiveFilter) {
            this.elements.enableSensitiveFilter.addEventListener('change', () => {
                this.saveConfig('enable-sensitive-filter', this.elements.enableSensitiveFilter.checked);
            });
        }

        if (this.elements.sensitiveApiUrl) {
            this.elements.sensitiveApiUrl.addEventListener('input', () => {
                this.saveConfig('sensitive-api-url', this.elements.sensitiveApiUrl.value);
            });
        }

        if (this.elements.bannedWordsAppId) {
            this.elements.bannedWordsAppId.addEventListener('input', () => {
                this.saveConfig('banned-words-appid', this.elements.bannedWordsAppId.value);
            });
        }

        if (this.elements.bannedWordsSecret) {
            this.elements.bannedWordsSecret.addEventListener('input', () => {
                this.saveConfig('banned-words-secret', this.elements.bannedWordsSecret.value);
            });
        }

        // 违禁词密钥显示/隐藏
        const toggleBannedWordsSecret = document.getElementById('toggle-banned-words-secret');
        if (toggleBannedWordsSecret) {
            toggleBannedWordsSecret.addEventListener('click', () => {
                if (this.elements.bannedWordsSecret.type === 'password') {
                    this.elements.bannedWordsSecret.type = 'text';
                    toggleBannedWordsSecret.textContent = '👁️‍🗨️';
                } else {
                    this.elements.bannedWordsSecret.type = 'password';
                    toggleBannedWordsSecret.textContent = '👁️';
                }
            });
        }


    }

    loadSavedConfigs() {
        // 加载保存的配置
        const savedVisionModel = localStorage.getItem('vision-model') || 'step-1o-turbo-vision';
        const savedMindmapModel = localStorage.getItem('mindmap-model') || 'kimi-k2-0711';
        const savedVisionApiKey = localStorage.getItem('vision-api-key') || '';
        const savedMindmapApiKey = localStorage.getItem('mindmap-api-key') || '';
        const savedVisionSystemPrompt = localStorage.getItem('vision-system-prompt') || 
                                      '你是一位专业的视觉内容分析专家，请详细描述图片或PDF中的内容，包括文字、图表、结构、关键信息等。';
        const savedVisionUserPrompt = localStorage.getItem('vision-user-prompt-template') || 
                                    '请详细分析这张图片/PDF的内容，提取所有文字和关键信息。';
        const savedMindmapSystemPrompt = localStorage.getItem('mindmap-system-prompt') || 
                                       '你是一位专业的内容分析和思维导图生成专家。请根据用户提供的内容，生成一个结构清晰、层次分明的思维导图。使用Markdown格式，以中心主题开始，逐步展开分支主题，每个主题都要简洁明了。使用适当的层级结构（#、##、###等）来表示思维导图的层次关系。确保内容逻辑清晰，重点突出，便于理解和记忆。';
        const savedMindmapUserPrompt = localStorage.getItem('mindmap-user-prompt-template') || 
                                     '请根据以下内容生成一个结构化的思维导图：{content}';
        const savedEnableSensitiveFilter = localStorage.getItem('enable-sensitive-filter') !== 'false';
        const savedBannedWordsAppId = localStorage.getItem('banned-words-appid') || '';
        const savedBannedWordsSecret = localStorage.getItem('banned-words-secret') || '';

        this.elements.visionModelSelect.value = savedVisionModel;
        this.elements.mindmapModelSelect.value = savedMindmapModel;
        this.elements.visionApiKey.value = savedVisionApiKey;
        this.elements.mindmapApiKey.value = savedMindmapApiKey;
        
        // 加载敏感词过滤配置
        if (this.elements.enableSensitiveFilter) this.elements.enableSensitiveFilter.checked = savedEnableSensitiveFilter;
        if (this.elements.bannedWordsAppId) this.elements.bannedWordsAppId.value = savedBannedWordsAppId;
        if (this.elements.bannedWordsSecret) this.elements.bannedWordsSecret.value = savedBannedWordsSecret;
        
        // 加载提示词配置
        const visionSystemPromptEl = document.getElementById('vision-system-prompt');
        const visionUserPromptEl = document.getElementById('vision-user-prompt-template');
        const mindmapSystemPromptEl = document.getElementById('mindmap-system-prompt');
        const mindmapUserPromptEl = document.getElementById('mindmap-user-prompt-template');
        
        if (visionSystemPromptEl) visionSystemPromptEl.value = savedVisionSystemPrompt;
        if (visionUserPromptEl) visionUserPromptEl.value = savedVisionUserPrompt;
        if (mindmapSystemPromptEl) mindmapSystemPromptEl.value = savedMindmapSystemPrompt;
        if (mindmapUserPromptEl) mindmapUserPromptEl.value = savedMindmapUserPrompt;
    }

    handleFolderSelection(event) {
        const files = Array.from(event.target.files);
        const imageFiles = files.filter(file => 
            file.type.startsWith('image/') || 
            file.type === 'application/pdf'
        );

        if (imageFiles.length === 0) {
            alert('请选择一个包含图片或PDF文件的文件夹！');
            return;
        }

        this.files = imageFiles.sort((a, b) => a.name.localeCompare(b.name));
        this.folderName = this.files[0].webkitRelativePath.split('/')[0];
        
        this.elements.selectedFolderName.textContent = this.folderName;
        this.elements.startBtn.disabled = false;
        
        console.log(`已选择文件夹: ${this.folderName}, 包含 ${this.files.length} 个文件`);
    }

    async startProcessing() {
        if (this.files.length === 0) {
            alert('请先选择文件夹！');
            return;
        }

        if (!this.validateConfigs()) {
            return;
        }

        this.isProcessing = true;
        this.isPaused = false;
        this.isStopped = false;
        this.shouldStopReading = false; // 重置停止标志

        // 过滤出新增文件：从未处理过的文件
        const newFiles = this.files.filter(file => !this.processedFiles.has(file.name));
        if (newFiles.length === 0) {
            alert('所有文件均已处理完毕，无新增文件！');
            this.isProcessing = false;
            this.updateButtonStates();
            return;
        }

        this.files = newFiles;

        // 检查是否需要从上次进度继续
        if (this.shouldResumeFromProgress && window.loadReadingProgress) {
            const progress = window.loadReadingProgress();
            if (progress && progress.fileName) {
                const lastFileIndex = this.files.findIndex(file => file.name === progress.fileName);
                if (lastFileIndex !== -1) {
                    this.currentIndex = lastFileIndex;
                    console.log(`从上次进度继续：文件 ${progress.fileName}，索引 ${lastFileIndex}`);
                } else {
                    this.currentIndex = 0;
                }
            } else {
                this.currentIndex = 0;
            }
        } else {
            this.currentIndex = 0;
            if (window.clearReadingProgress) {
                window.clearReadingProgress();
            }
        }

        // 仅清空本次处理的结果，保留历史已处理记录
        const existingProcessed = this.processedResults.filter(r => this.processedFiles.has(r.fileName));
        this.processedResults = [...existingProcessed];

        this.updateButtonStates();
        this.showProgress();

        // 预加载第一个文件
        await this.preloadNextFile();

        await this.processNextFile();
    }

    async continueProcessing() {
        if (this.files.length === 0) {
            return;
        }

        if (!this.validateConfigs()) {
            return;
        }

        this.isProcessing = true;
        this.isPaused = false;
        
        // 重新计算索引，确保处理新文件
        this.recalculateCurrentIndex();
        
        // 不重置processedResults，保留已有结果

        this.updateButtonStates();
        this.showProgress();

        // 预加载下一个文件
        await this.preloadNextFile();

        await this.processNextFile();
    }

    pauseProcessing() {
        this.isPaused = true;
        this.shouldStopReading = true; // 暂停时停止朗读
        
        // 停止语音合成
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        this.updateButtonStates();
    }

    stopProcessing() {
        this.isProcessing = false;
        this.isPaused = false;
        this.isStopped = true;
        this.shouldStopReading = true; // 立即停止朗读
        
        // 停止语音合成
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        this.updateButtonStates();
        this.hideProgress();
    }

    async processNextFile() {
        if (!this.isProcessing || this.isPaused) {
            return;
        }

        // 跳过已处理的文件，找到下一个未处理的文件
        while (this.currentIndex < this.files.length) {
            const file = this.files[this.currentIndex];
            const isProcessed = this.processedResults.some(result => result.fileName === file.name);
            
            if (isProcessed) {
                console.log(`跳过已处理文件: ${file.name}`);
                this.currentIndex++;
            } else {
                break; // 找到未处理的文件
            }
        }

        if (this.currentIndex >= this.files.length) {
            await this.completeProcessing();
            return;
        }

        const file = this.files[this.currentIndex];
        const totalUnprocessed = this.files.length - this.processedResults.length;
        this.updateProgress(file.name, this.processedResults.length + 1, this.files.length);

        try {
            console.log(`开始处理文件: ${file.name} (第${this.currentIndex + 1}个，剩余${totalUnprocessed - 1}个)`);
            
            let visionResult, mindmapResult;
            
            // 检查是否有预加载的结果
            if (this.preloadedResults[file.name]) {
                console.log(`使用预加载结果: ${file.name}`);
                const preloaded = this.preloadedResults[file.name];
                visionResult = preloaded.visionResult;
                mindmapResult = preloaded.mindmapResult;
                
                // 确保更新视觉结果文本框，即使是预加载的结果
                this.displayVisionResult(visionResult);
                console.log(`预加载的视觉结果已显示: ${file.name}`);
                
                // 清理预加载结果
                delete this.preloadedResults[file.name];
            } else {
                // 没有预加载结果，正常处理
                console.log(`实时处理: ${file.name}`);
                
                // 步骤1: 视觉模型识别
                this.elements.processingStatus.textContent = `正在识别 ${file.name}...`;
                visionResult = await this.processWithVisionModel(file);
                this.displayVisionResult(visionResult);
                console.log(`视觉模型识别完成: ${file.name}`);
                
                // 步骤2: 思维导图生成
                this.elements.processingStatus.textContent = `正在生成思维导图: ${file.name}...`;
                mindmapResult = await this.processWithMindmapModel(visionResult);
                console.log(`思维导图生成完成: ${file.name}`);
            }
            
            // 步骤3: 清理和验证结果
            const cleanedContent = this.cleanMarkdownContent(mindmapResult);
            if (!cleanedContent.trim()) {
                throw new Error('生成的思维导图内容为空');
            }
            
            // 步骤4: 更新UI
            this.elements.processingStatus.textContent = `正在处理结果: ${file.name}...`;
            
            // 步骤5: 保存结果
            this.processedResults.push({
                fileName: file.name,
                visionResult: visionResult,
                mindmapResult: cleanedContent,
                timestamp: new Date().toISOString()
            });
            
            // 标记为已处理
            this.processedFiles.add(file.name);
            
            // 步骤6: 朗读内容（使用预加载的并行处理）
            // 注意：预加载下一个文件将在朗读完成后进行，避免视觉结果被提前清除
            this.elements.processingStatus.textContent = `正在朗读: ${file.name}...`;
            
            try {
                // 保存当前文件的朗读进度
                if (window.saveReadingProgress) {
                    window.saveReadingProgress(file.name, 100);
                }
                
                // 使用全局的handleFolderProcessingComplete来处理朗读和思维导图更新
                if (window.handleFolderProcessingComplete) {
                    console.log(`开始处理文件 ${file.name} 的最终结果...`);
                    await window.handleFolderProcessingComplete(cleanedContent, file.name, visionResult);
                    console.log(`文件 ${file.name} 的最终结果处理完成`);
                } else {
                    // 回退方案：直接朗读
                    this.elements.markdownInput.value = cleanedContent;
                    if (window.speechSynthesis) {
                        console.log(`开始朗读文件 ${file.name} 的内容...`);
                        const enableSensitiveFilter = this.elements.enableSensitiveFilter?.checked || false;
                        await this.speakContent(cleanedContent, enableSensitiveFilter, false);
                        console.log(`文件 ${file.name} 朗读完成`);
                    }
                }
                
                console.log(`文件 ${file.name} 处理完成`);
                this.elements.processingStatus.textContent = `完成: ${file.name}`;
                
                // 朗读固定内容
                try {
                    const enableFixedReading = document.getElementById('enable-fixed-reading')?.checked || false;
                    const fixedText = document.getElementById('fixed-reading-text')?.value || '';
                    
                    if (enableFixedReading && fixedText.trim()) {
                        console.log(`开始朗读固定内容: ${fixedText}`);
                    // 固定朗读内容始终不启用敏感词过滤
                    await this.speakContent(fixedText, false, true);
                        console.log(`固定内容朗读完成`);
                    }
                } catch (fixedReadError) {
                    console.error(`朗读固定内容时出错:`, fixedReadError);
                }
                
            } catch (readError) {
                console.error(`朗读文件 ${file.name} 时出错:`, readError);
                this.elements.processingStatus.textContent = `朗读失败: ${file.name}`;
                // 即使朗读失败也继续处理下一个文件
            }
            
            // 预加载下一个文件（在朗读当前文件的同时预加载下一个）
            if (!this.shouldStopReading && this.currentIndex < this.files.length - 1) {
                this.preloadNextFile();
            }
            
            // 处理完成后，立即开始下一个文件
            this.currentIndex++;
            if (!this.isPaused && !this.isStopped && !this.shouldStopReading) {
                // 立即处理下一个文件，不等待朗读完成
                this.processNextFile();
            } else {
                console.log('处理停止，不再继续下一个文件');
            }

        } catch (error) {
            console.error(`处理文件 ${file.name} 时出错:`, error);
            this.elements.processingStatus.textContent = `处理失败: ${file.name} - ${error.message}`;
            
            // 记录失败但仍继续处理下一个文件，不覆盖视觉结果
            const errorMessage = `处理失败: ${error.message}`;
            this.processedResults.push({
                fileName: file.name,
                visionResult: errorMessage,
                mindmapResult: errorMessage,
                timestamp: new Date().toISOString(),
                error: error.message
            });
            
            // 不覆盖视觉结果，保持原有内容
            console.log('文件处理失败，保持原有视觉结果不变');
            
            this.processedFiles.add(file.name);
            this.currentIndex++;
            if (!this.isPaused && !this.isStopped && !this.shouldStopReading) {
                setTimeout(() => {
                    if (!this.shouldStopReading) {
                        this.processNextFile();
                    } else {
                        console.log('朗读已停止，跳过错误重试');
                    }
                }, 3000); // 失败时延迟更长
            } else {
                console.log('处理停止，不再继续下一个文件');
            }
        }
    }

    async processWithVisionModel(file) {
        this.elements.processingStatus.textContent = '正在使用视觉模型识别...';
        
        let content = '';
        
        if (file.type === 'application/pdf') {
            content = await this.extractPDFContent(file);
        } else {
            content = await this.extractImageContent(file);
        }

        // 调用视觉模型API
        return await this.callVisionAPI(content, file.name);
    }

    async compressImageIfNeeded(imageData, fileName, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 自动无损压缩：先尝试保持原始质量，仅调整尺寸
                let targetWidth = img.width;
                let targetHeight = img.height;
                
                // 根据文件大小智能调整尺寸
                const maxSize = 1024; // 最大边长
                const minSize = 512;  // 最小边长
                
                if (targetWidth > maxSize || targetHeight > maxSize) {
                    // 如果图片太大，按比例缩小
                    if (targetWidth > targetHeight) {
                        targetHeight = Math.round((targetHeight * maxSize) / targetWidth);
                        targetWidth = maxSize;
                    } else {
                        targetWidth = Math.round((targetWidth * maxSize) / targetHeight);
                        targetHeight = maxSize;
                    }
                } else if (targetWidth < minSize && targetHeight < minSize) {
                    // 如果图片太小，适当放大以提高识别精度
                    const scale = Math.max(minSize / targetWidth, minSize / targetHeight);
                    targetWidth = Math.round(targetWidth * scale);
                    targetHeight = Math.round(targetHeight * scale);
                }
                
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                // 使用高质量重采样
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                // 根据文件类型选择最佳格式
                const isPng = imageData.startsWith('data:image/png');
                const finalQuality = isPng ? 0.9 : Math.max(quality, 0.85); // PNG保持高质量
                
                const compressedData = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', finalQuality);
                
                // 检查压缩后的大小
                const base64Data = compressedData.replace(/^data:image\/\w+;base64,/, '');
                const sizeInBytes = base64Data.length * 0.75; // base64解码后的字节数
                const sizeInMB = sizeInBytes / (1024 * 1024);
                
                console.log(`压缩前大小: ${(imageData.length * 0.75 / (1024 * 1024)).toFixed(2)}MB`);
                console.log(`压缩后大小: ${sizeInMB.toFixed(2)}MB`);
                
                // 如果压缩后仍然太大，进行二次压缩
                if (sizeInMB > 4) {
                    const finalCompressed = canvas.toDataURL('image/jpeg', 0.7);
                    console.log(`二次压缩后大小: ${(finalCompressed.length * 0.75 / (1024 * 1024)).toFixed(2)}MB`);
                    resolve(finalCompressed);
                } else {
                    resolve(compressedData);
                }
            };
            img.onerror = reject;
            img.src = imageData;
        });
    }

    async extractPDFContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const pdfData = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({data: pdfData}).promise;
                    let fullText = '';
                    
                    // 限制处理的页数
                    const pageCount = Math.min(pdf.numPages, 3);
                    
                    for (let i = 1; i <= pageCount; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += `第${i}页:\n${pageText}\n\n`;
                    }
                    
                    resolve(fullText);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async extractImageContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target.result); // 返回base64数据
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async callVisionAPI(content, fileName) {
        const model = this.elements.visionModelSelect.value;
        const apiKey = this.elements.visionApiKey.value;
        
        // 获取用户自定义的提示词
        const systemPrompt = document.getElementById('vision-system-prompt')?.value || 
                           '你是一位专业的视觉内容分析专家，请详细描述图片或PDF中的内容，包括文字、图表、结构、关键信息等。';
        const userPromptTemplate = document.getElementById('vision-user-prompt-template')?.value || 
                                 '请详细分析这张图片/PDF的内容，提取所有文字和关键信息。';
        
        // 替换模板中的变量
        const userPrompt = userPromptTemplate.replace('{filename}', fileName);
        
        // 使用重试机制调用API
        return await this.callAPIWithRetry(async () => {
            switch (model) {
                case 'step-1o-turbo-vision':
                    return await this.callStepV8API(content, apiKey, fileName, systemPrompt, userPrompt);
                case 'gpt-4-vision':
                    return await this.callGPT4VisionAPI(content, apiKey, fileName, systemPrompt, userPrompt);
                case 'claude-vision':
                    return await this.callClaudeVisionAPI(content, apiKey, fileName, systemPrompt, userPrompt);
                default:
                    throw new Error('不支持的视觉模型');
            }
        }, 3, '视觉模型');
    }

    async callStepV8API(content, apiKey, fileName, systemPrompt, userPrompt) {
        try {
            // 检查文件大小并压缩
            let compressedContent = await this.compressImageIfNeeded(content, fileName);
            
            const response = await fetch('/api/step-v8', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                model: 'step-1o-turbo-vision',  // 使用新的模型
                image: compressedContent,
                system: systemPrompt,
                prompt: userPrompt,
                max_tokens: 4000
            })
            });

            if (response.status === 413) {
                // 如果还是太大，进一步压缩
                compressedContent = await this.compressImageIfNeeded(content, fileName, 0.5);
                const retryResponse = await fetch('/api/step-v8', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'step-1o-turbo-vision',
                        image: compressedContent,
                        system: systemPrompt,
                        prompt: userPrompt
                    })
                });

                if (!retryResponse.ok) {
                    throw new Error('视觉模型API调用失败，文件可能过大');
                }
                const result = await retryResponse.json();
                return result.markdown || result.text || '识别结果为空';
            }

            if (!response.ok) {
                throw new Error(`视觉模型API调用失败: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return result.markdown || result.text || '识别结果为空';
        } catch (error) {
            if (error.message.includes('413') || error.message.includes('Payload Too Large')) {
                throw new Error('文件过大，请尝试压缩图片或使用更小的文件');
            }
            throw error;
        }
    }

    async callGPT4VisionAPI(content, apiKey, fileName, systemPrompt, userPrompt) {
        // GPT-4 Vision API调用示例
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-vision-preview',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: userPrompt
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: content.startsWith('data:') ? content : `data:image/jpeg;base64,${content}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            throw new Error('GPT-4 Vision API调用失败');
        }

        const result = await response.json();
        return result.choices[0].message.content;
    }

    async callClaudeVisionAPI(content, apiKey, fileName, systemPrompt, userPrompt) {
        // Claude Vision API调用示例
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: content.replace(/^data:image\/\w+;base64,/, '')
                            }
                        },
                        {
                            type: 'text',
                            text: userPrompt
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            throw new Error('Claude Vision API调用失败');
        }

        const result = await response.json();
        return result.content[0].text;
    }

    async processWithMindmapModel(visionResult) {
        this.elements.processingStatus.textContent = '正在生成思维导图...';
        
        // 忽略原思维导图项目的模型配置，统一使用 kimi-k2-0711-preview
        const model = 'kimi-k2-0711-preview';
        const apiKey = this.elements.mindmapApiKey.value;
        
        // 获取用户自定义的提示词
        const systemPrompt = document.getElementById('mindmap-system-prompt')?.value || 
                           '你是一位专业的内容分析和思维导图生成专家。请根据用户提供的内容，生成一个结构清晰、层次分明的思维导图。使用Markdown格式，以中心主题开始，逐步展开分支主题，每个主题都要简洁明了。使用适当...';
        const userPromptTemplate = document.getElementById('mindmap-user-prompt-template')?.value || 
                                 '请根据以下内容生成一个结构化的思维导图：{content}';
        
        // 替换模板中的变量
        const userPrompt = userPromptTemplate.replace('{content}', visionResult);
        
        // 构建完整的提示词
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        let mindmapContent = await this.callMindmapAPI(fullPrompt, model, apiKey);
        
        // 根据用户选择的过滤模式决定是否对思维导图内容进行敏感词过滤
        const filterMode = this.getSensitiveFilterMode();
        if (filterMode === 'both') {
            // 检测敏感词并过滤思维导图内容
            try {
                const detectionResult = await this.detectSensitiveWords(mindmapContent);
                if (detectionResult.hasSensitiveWords) {
                    mindmapContent = this.filterSensitiveWordsForDisplay(mindmapContent, detectionResult.sensitiveWords);
                }
            } catch (error) {
                console.error('思维导图内容敏感词过滤失败:', error);
                // 继续使用原始内容，不中断流程
            }
        }
        
        return mindmapContent;
    }

    async callMindmapAPI(prompt, _model, apiKey) {
        // 统一固定走 Kimi 代理（kimi-k2-0711-preview），忽略传入 model
        return await this.callAPIWithRetry(async () => {
            return await this.callKimiAPI(prompt, apiKey);
        }, 3, '思维导图模型');
    }

    async callKimiAPI(prompt, apiKey) {
        // Kimi API调用示例
        const response = await fetch('/api/kimi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'kimi-k2-0711-preview',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            throw new Error('Kimi API调用失败');
        }

        const result = await response.json();
        return result.choices[0].message.content;
    }

    async callQwenAPI(prompt, apiKey) {
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'qwen-turbo',
                input: {
                    messages: [{
                        role: 'user',
                        content: prompt
                    }]
                }
            })
        });

        if (!response.ok) {
            throw new Error('通义千问API调用失败');
        }

        const result = await response.json();
        return result.output.choices[0].message.content;
    }

    async callGPT4API(prompt, apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            throw new Error('GPT-4 API调用失败');
        }

        const result = await response.json();
        return result.choices[0].message.content;
    }

    async callGPT35API(prompt, apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            throw new Error('GPT-3.5 API调用失败');
        }

        const result = await response.json();
        return result.choices[0].message.content;
    }

    async callClaudeAPI(prompt, apiKey) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 4000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        if (!response.ok) {
            throw new Error('Claude API调用失败');
        }

        const result = await response.json();
        return result.content[0].text;
    }

    async callGeminiAPI(prompt, apiKey) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error('Gemini API调用失败');
        }

        const result = await response.json();
        return result.candidates[0].content.parts[0].text;
    }

    cleanMarkdownContent(content) {
        // 移除markdown代码块标记和额外信息
        return content
            .replace(/```markdown\n/g, '')
            .replace(/```\n/g, '')
            .replace(/```/g, '')
            .trim();
    }

    // 获取敏感词过滤模式
    getSensitiveFilterMode() {
        const radioBoth = document.querySelector('input[name="sensitive-filter-mode"][value="both"]');
        return radioBoth && radioBoth.checked ? 'both' : 'voice-only';
    }

    // 检测敏感词
    async detectSensitiveWords(text) {
        if (!text || typeof text !== 'string') {
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }

        const enableSensitiveFilter = localStorage.getItem('enable-sensitive-filter') !== 'false';
        if (!enableSensitiveFilter) {
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }

        const apiUrl = localStorage.getItem('sensitive-api-url') || 'https://eolink.o.apispace.com/banned-words-detection/api/v1/forward/banned/words/detection';
        const appId = localStorage.getItem('banned-words-appid') || '';
        const secret = localStorage.getItem('banned-words-secret') || '';

        if (!appId || !secret) {
            console.warn('敏感词检测API配置不完整');
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-APISpace-Token': secret
                },
                body: JSON.stringify({
                    text: text,
                    appId: appId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            
            if (result.code === 200 && result.data && Array.isArray(result.data.words)) {
                const sensitiveWords = result.data.words.map(word => ({
                    word: word.word || word,
                    type: word.type || 'sensitive'
                }));
                
                return {
                    hasSensitiveWords: sensitiveWords.length > 0,
                    sensitiveWords: sensitiveWords
                };
            }
            
            return { hasSensitiveWords: false, sensitiveWords: [] };
        } catch (error) {
            console.error('敏感词检测API调用失败:', error);
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }
    }

    // 过滤敏感词用于显示（用星号替换敏感词）
    filterSensitiveWordsForDisplay(text, sensitiveWords) {
        if (!text || !sensitiveWords || sensitiveWords.length === 0) {
            return text;
        }

        let filteredText = text;
        
        // 按敏感词长度排序，优先处理较长的词
        const sortedWords = [...sensitiveWords].sort((a, b) => {
            const wordA = typeof a === 'string' ? a : a.word;
            const wordB = typeof b === 'string' ? b : b.word;
            return wordB.length - wordA.length;
        });

        sortedWords.forEach(item => {
            const word = typeof item === 'string' ? item : item.word;
            if (word && word.length > 0) {
                const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                filteredText = filteredText.replace(regex, '*'.repeat(word.length));
            }
        });

        return filteredText;
    }

    async speakContent(text, enableSensitiveWordFilter = true, isFixedContent = false) {
        return new Promise(async (resolve) => {
            if (!window.speechSynthesis || this.shouldStopReading) {
                console.warn(this.shouldStopReading ? '朗读已被停止' : '浏览器不支持语音合成');
                resolve();
                return;
            }

            let speechText = text;
            let displayText = text;

            // 固定内容始终不启用敏感词过滤
            if (enableSensitiveWordFilter && !isFixedContent) {
                try {
                    const detectionResult = await this.detectSensitiveWords(text);
                    if (detectionResult.hasSensitiveWords) {
                        // 获取用户选择的过滤模式
                        const filterMode = this.getSensitiveFilterMode();
                        
                        if (filterMode === 'both') {
                            // 文字和语音都拦截
                            console.log(`检测到敏感词: ${detectionResult.sensitiveWords.join(', ')}，文字和语音都将被拦截`);
                            displayText = this.filterSensitiveWordsForDisplay(text, detectionResult.sensitiveWords);
                            speechText = this.filterSensitiveWordsForSpeech(displayText, detectionResult.sensitiveWords);
                        } else {
                            // 仅语音消音（默认模式）
                            console.log(`检测到敏感词: ${detectionResult.sensitiveWords.join(', ')}，朗读时将消音处理，文字显示保持不变`);
                            speechText = this.filterSensitiveWordsForSpeech(text, detectionResult.sensitiveWords);
                            displayText = text; // 文字显示保持不变
                        }
                        
                        // 记录显示文本的更新
                        this.updateDisplayedText(text, displayText);
                    }
                } catch (error) {
                    console.warn('敏感词检测失败，使用原文朗读:', error.message);
                }
            }

            // 检查过滤后的文本是否为空或只有空格
            if (!speechText || speechText.trim().length === 0) {
                console.log('朗读内容为空，跳过朗读');
                resolve();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(speechText);
            utterance.lang = 'zh-CN';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            utterance.onend = () => {
                console.log('朗读完成');
                resolve();
            };

            utterance.onerror = (error) => {
                console.error('朗读错误:', error);
                resolve(); // 即使出错也继续处理下一个文件
            };

            speechSynthesis.speak(utterance);
        });
    }



    async completeProcessing() {
        this.isProcessing = false;
        this.updateButtonStates();
        this.hideProgress();

        // 检查是否还有未处理的文件
        const unprocessedCount = this.files.length - this.processedResults.length;
        
        console.log(`处理完成: 已处理=${this.processedResults.length}, 未处理=${unprocessedCount}`);
        
        // 不再进行任何下载操作
        
        // 如果启用了文件监控，自动检查并处理新文件
        if (this.fileWatcher) {
            console.log('处理完成，自动检查新文件...');
            
            // 等待一小段时间后检查新文件，避免过于频繁的检查
            setTimeout(async () => {
                await this.scanFolderForNewFiles();
                
                const newUnprocessedCount = this.files.length - this.processedResults.length;
                if (newUnprocessedCount > 0) {
                    console.log(`检测到 ${newUnprocessedCount} 个未处理文件，自动开始处理...`);
                    this.recalculateCurrentIndex();
                    this.startProcessing();
                } else {
                    this.showDynamicStatus('所有文件处理完成，继续监控新文件...');
                    console.log('监控中：所有文件处理完成');
                }
            }, 1000);
        } else {
            // 非监控模式下，所有文件处理完成后显示完成提示
            if (unprocessedCount === 0) {
                alert(`处理完成！共处理了 ${this.processedResults.length} 个文件。`);
            }
        }
    }

    // 设置文件监控
    setupFileWatcher() {
        if ('showDirectoryPicker' in window) {
            console.log('支持文件系统访问API，可以启用文件监控');
            this.addDynamicFileButton();
        } else {
            console.log('浏览器不支持文件系统访问API，无法启用文件监控');
        }
    }

    // 添加动态文件按钮
    addDynamicFileButton() {
        const folderSection = document.querySelector('.folder-selection');
        if (folderSection && !document.getElementById('dynamic-folder-btn')) {
            const dynamicBtn = document.createElement('button');
            dynamicBtn.id = 'dynamic-folder-btn';
            dynamicBtn.textContent = '🔍 动态监控文件夹';
            dynamicBtn.className = 'primary-btn';
            dynamicBtn.style.marginLeft = '10px';
            dynamicBtn.addEventListener('click', () => this.startDynamicFileWatching());
            folderSection.appendChild(dynamicBtn);
        }
    }

    // 开始动态文件监控
    async startDynamicFileWatching() {
        try {
            if (this.fileWatcher) {
                console.log('文件监控已启用');
                return;
            }

            const dirHandle = await window.showDirectoryPicker();
            this.watchedFolder = dirHandle;
            this.folderName = dirHandle.name;
            this.elements.selectedFolderName.textContent = this.folderName + ' (监控中)';
            
            console.log(`开始监控文件夹: ${this.folderName}`);
            
            // 清空之前的状态
            this.files = [];
            this.processedResults = [];
            this.processedFiles.clear();
            this.allDiscoveredFiles.clear();
            this.currentIndex = 0;
            
            // 立即扫描现有文件
            await this.scanFolderForNewFiles();
            
            // 启动定期扫描
            this.fileWatcher = setInterval(() => {
                this.scanFolderForNewFiles();
            }, 5000); // 每5秒扫描一次
            
            // 如果有文件，自动开始处理
            if (this.files.length > 0 && !this.isProcessing) {
                console.log(`发现 ${this.files.length} 个文件，自动开始处理...`);
                this.startProcessing();
            }
            
        } catch (error) {
            console.error('启动文件监控失败:', error);
            alert('启动文件监控失败: ' + error.message);
        }
    }

    // 扫描文件夹寻找新文件
    async scanFolderForNewFiles() {
        if (!this.watchedFolder) return;

        try {
            console.log('开始扫描文件夹寻找新文件...');
            const newFiles = [];
            const currentFiles = new Set();
            
            // 获取当前文件夹中的所有文件
            for await (const entry of this.watchedFolder.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (this.isValidFileType(file)) {
                        currentFiles.add(file.name);
                        
                        // 如果这个文件从未被发现过，就是新文件
                        if (!this.allDiscoveredFiles.has(file.name)) {
                            newFiles.push(file);
                            this.allDiscoveredFiles.add(file.name);
                            console.log(`发现全新文件: ${file.name}`);
                        }
                    }
                }
            }

            // 清理不存在的文件记录
            for (const fileName of this.allDiscoveredFiles) {
                if (!currentFiles.has(fileName)) {
                    this.allDiscoveredFiles.delete(fileName);
                    this.processedFiles.delete(fileName);
                }
            }

            console.log(`当前队列: ${this.files.length} 个文件, 已处理: ${this.processedResults.length} 个`);
            console.log(`当前索引: ${this.currentIndex}, 是否处理中: ${this.isProcessing}`);

            if (newFiles.length > 0) {
                console.log(`发现 ${newFiles.length} 个全新文件`);
                
                // 过滤出真正需要处理的文件（未处理过的新文件）
                const trulyNewFiles = newFiles.filter(file => {
                    const isProcessed = this.processedResults.some(result => result.fileName === file.name);
                    const isInQueue = this.files.some(f => f.name === file.name);
                    return !isProcessed && !isInQueue;
                });

                if (trulyNewFiles.length > 0) {
                    console.log(`实际需要处理的新文件: ${trulyNewFiles.length} 个`);
                    
                    // 添加到处理队列，保持排序
                    this.files.push(...trulyNewFiles);
                    this.files.sort((a, b) => a.name.localeCompare(b.name));
                    
                    console.log(`更新后队列: ${this.files.length} 个文件`);
                    
                    // 重新计算currentIndex，确保指向正确的位置
                    this.recalculateCurrentIndex();
                    
                    console.log(`重新计算后索引: ${this.currentIndex}`);
                    
                    // 自动处理新文件
                    if (!this.isProcessing) {
                        console.log('发现新文件，自动开始处理...');
                        this.recalculateCurrentIndex();
                        this.startProcessing();
                    } else {
                        console.log('正在处理中，新文件已加入队列，处理完成后自动继续...');
                        // 正在处理时，文件自动加入队列，处理完成后会自动继续
                    }
                } else {
                    console.log('所有新文件都已处理过或已在队列中');
                }
            } else {
                console.log('没有发现新文件');
            }
        } catch (error) {
            console.error('扫描文件夹失败:', error);
        }
    }

    // 重新计算当前索引，确保指向未处理的文件
    recalculateCurrentIndex() {
        // 找到第一个未处理的文件索引
        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const isProcessed = this.processedResults.some(result => result.fileName === file.name);
            if (!isProcessed) {
                this.currentIndex = i;
                console.log(`重新计算索引，从第 ${i + 1} 个文件开始处理`);
                return;
            }
        }
        
        // 如果所有文件都已处理，指向末尾
        this.currentIndex = this.files.length;
        console.log('所有文件已处理完成');
        
        // 如果启用了文件监控，显示等待状态
        if (this.fileWatcher) {
            this.showDynamicStatus('🔄 监控中，等待新文件...');
        }
    }

    // 检查文件类型是否有效
    isValidFileType(file) {
        return file.type.startsWith('image/') || file.type === 'application/pdf';
    }

    // 停止文件监控
    stopFileWatcher() {
        if (this.fileWatcher) {
            clearInterval(this.fileWatcher);
            this.fileWatcher = null;
            this.watchedFolder = null;
            console.log('文件监控已停止');
        }
    }

    // 显示动态状态
    showDynamicStatus(message) {
        if (this.elements.processingStatus) {
            if (message) {
                this.elements.processingStatus.textContent = message;
            } else {
                const unprocessedCount = this.files.length - this.processedResults.length;
                if (this.isProcessing) {
                    this.elements.processingStatus.textContent = `🔄 自动处理中... 已完成 ${this.processedResults.length} 个文件`;
                } else if (unprocessedCount > 0) {
                    this.elements.processingStatus.textContent = `🔄 检测到 ${unprocessedCount} 个新文件，自动处理中...`;
                } else {
                    this.elements.processingStatus.textContent = '✅ 所有文件处理完成，监控中...';
                }
            }
        }
    }



    validateConfigs() {
        if (!this.elements.visionApiKey.value.trim()) {
            alert('请输入视觉模型API密钥！');
            return false;
        }

        if (!this.elements.mindmapApiKey.value.trim()) {
            alert('请输入思维导图模型API密钥！');
            return false;
        }

        return true;
    }

    updateButtonStates() {
        this.elements.startBtn.disabled = this.isProcessing || this.files.length === 0;
        this.elements.pauseBtn.disabled = !this.isProcessing || this.isPaused;
        this.elements.stopBtn.disabled = !this.isProcessing;
    }

    showProgress() {
        this.elements.progressContainer.style.display = 'block';
    }

    hideProgress() {
        this.elements.progressContainer.style.display = 'none';
    }

    updateProgress(fileName, current, total) {
        this.elements.currentFileName.textContent = fileName;
        this.elements.progressCounter.textContent = `${current}/${total}`;
        this.elements.progressFill.style.width = `${(current / total) * 100}%`;
    }

    displayVisionResult(result) {
        try {
            // 只在有有效结果时更新，避免清空已有内容
            if (result !== null && result !== undefined && result !== '') {
                console.log('正在更新视觉模型结果文本框:', result.substring(0, 100) + '...');
                this.elements.visionResultDisplay.value = result;
                console.log('视觉模型结果文本框更新完成');
            } else {
                console.log('视觉结果为空，保持原有内容不变');
            }
            
            // 确保视觉结果文本框保持可见状态
            if (this.elements.visionResultDisplay.style.display === 'none') {
                this.elements.visionResultDisplay.style.display = 'block';
            }
        } catch (error) {
            console.error('更新视觉模型结果文本框时出错:', error);
            // 出错时不改变原有内容
            console.log('更新视觉结果时出错，保持原有内容');
        }
    }

    toggleConfig() {
        const isVisible = this.elements.folderConfigContent.style.display !== 'none';
        this.elements.folderConfigContent.style.display = isVisible ? 'none' : 'block';
        this.elements.toggleFolderConfigBtn.textContent = isVisible ? '展开配置' : '收起配置';
    }

    saveVisionApiKey() {
        const key = this.elements.visionApiKey.value.trim();
        if (key) {
            this.saveConfig('vision-api-key', key);
            alert('视觉模型API密钥已保存！');
        }
    }

    saveMindmapApiKey() {
        const key = this.elements.mindmapApiKey.value.trim();
        if (key) {
            this.saveConfig('mindmap-api-key', key);
            alert('思维导图模型API密钥已保存！');
        }
    }

    toggleApiVisibility(inputId) {
        const input = document.getElementById(inputId);
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    saveConfig(key, value) {
        localStorage.setItem(key, value);
    }

    // 敏感词检测API调用
    async detectSensitiveWords(text) {
        try {
            const appId = this.elements.bannedWordsAppId?.value || '';
            const secretKey = this.elements.bannedWordsSecret?.value || '';
            
            if (!appId || !secretKey) {
                console.warn('敏感词检测API密钥未配置，跳过敏感词检测');
                return { hasSensitiveWords: false, sensitiveWords: [] };
            }

            const apiUrl = 'https://api.check51.cn/api/word/detect-text';
            
            // 获取行业和平台参数
            const selectedIndustries = Array.from(document.querySelectorAll('.industry-filter:checked')).map(cb => cb.value);
            const selectedPlatforms = Array.from(document.querySelectorAll('.platform-filter:checked')).map(cb => cb.value);
            
            // 创建FormData对象，内容需要进行unicode编码
            const formData = new FormData();
            formData.append('appid', appId);
            formData.append('secretKey', secretKey);
            
            // 过滤掉Markdown标识符，避免发送额外字符
            const cleanedText = text
                .replace(/^#{1,6}\s+/gm, '') // 移除标题标识 #
                .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体 **text**
                .replace(/\*(.*?)\*/g, '$1') // 移除斜体 *text*
                .replace(/`(.*?)`/g, '$1') // 移除代码块 `code`
                .replace(/```[\s\S]*?```/g, '') // 移除多行代码块 ```code```
                .replace(/^\s*[-*+]\s+/gm, '') // 移除列表标识 - * +
                .replace(/^\s*\d+\.\s+/gm, '') // 移除数字列表 1.
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接 [text](url)
                .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // 移除图片 ![alt](url)
                .replace(/^[\s>]+/gm, '') // 移除引用标识 >
                .replace(/\|/g, '') // 移除表格分隔符 |
                .replace(/\n\s*\n/g, '\n') // 合并多余空行
                .trim();
            
            // 将清理后的内容进行unicode编码
            const unicodeContent = cleanedText.substring(0, 50000).split('').map(char => 
                char.charCodeAt(0) > 127 ? '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0') : char
            ).join('');
            
            formData.append('content', unicodeContent); // 最大字符长度5万
            formData.append('detectMode', '0'); // 0=严格，1=宽松
            formData.append('isCommonWord', 'true');
            
            // 添加行业和平台参数
            if (selectedIndustries.length > 0) {
                formData.append('industry', selectedIndustries.join(','));
            }
            if (selectedPlatforms.length > 0) {
                formData.append('platform', selectedPlatforms.join(','));
            }
            
            // 添加unicode编码参数
            formData.append('encode', 'unicode');
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn('敏感词检测API调用失败，继续正常处理');
                return { hasSensitiveWords: false, sensitiveWords: [] };
            }

            const result = await response.json();
            
            if (result.code === '0000' && result.data) {
                const sensitiveWords = [];
                
                // 收集所有敏感词（包括禁用词和敏感词）
                if (result.data.riskList && Array.isArray(result.data.riskList)) {
                    result.data.riskList.forEach(item => {
                        if (item.title) {
                            sensitiveWords.push(item.title);
                        }
                    });
                }
                
                // 同时收集topRiskStr和lowRiskStr中的词
                if (result.data.topRiskStr) {
                    const topRiskWords = result.data.topRiskStr.split('、').filter(word => word.trim());
                    topRiskWords.forEach(word => {
                        if (!sensitiveWords.includes(word)) {
                            sensitiveWords.push(word);
                        }
                    });
                }
                
                if (result.data.lowRiskStr) {
                    const lowRiskWords = result.data.lowRiskStr.split('、').filter(word => word.trim());
                    lowRiskWords.forEach(word => {
                        if (!sensitiveWords.includes(word)) {
                            sensitiveWords.push(word);
                        }
                    });
                }
                
                return {
                    hasSensitiveWords: sensitiveWords.length > 0,
                    sensitiveWords: sensitiveWords,
                    riskData: result.data // 返回完整的风险数据用于调试
                };
            }
            
            return { hasSensitiveWords: false, sensitiveWords: [] };
        } catch (error) {
            console.warn('敏感词检测出错，继续正常处理:', error.message);
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }
    }

    // 过滤敏感词用于朗读（将敏感词替换为停顿标记）
    filterSensitiveWordsForSpeech(text, sensitiveWords) {
        if (!sensitiveWords || sensitiveWords.length === 0) {
            return text;
        }

        let filteredText = text;
        sensitiveWords.forEach(word => {
            // 使用正则表达式全局替换敏感词为停顿标记
            const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            // 使用逗号作为停顿标记，朗读时会停顿对应时间
            // 每个敏感词替换为等长的逗号，确保停顿时间与原词长度匹配
            filteredText = filteredText.replace(regex, ','.repeat(Math.min(word.length, 3)));
        });

        return filteredText;
    }

    // 过滤敏感词用于显示（将敏感词替换为星号）
    filterSensitiveWordsForDisplay(text, sensitiveWords) {
        if (!sensitiveWords || sensitiveWords.length === 0) {
            return text;
        }

        let filteredText = text;
        sensitiveWords.forEach(word => {
            // 使用正则表达式全局替换敏感词为星号
            const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            // 用星号替换敏感词
            filteredText = filteredText.replace(regex, '*'.repeat(Math.min(word.length, 5)));
        });

        return filteredText;
    }

    // 获取敏感词过滤模式
    getSensitiveFilterMode() {
        const radioElements = document.querySelectorAll('input[name="sensitive-filter-mode"]');
        for (const radio of radioElements) {
            if (radio.checked) {
                return radio.value;
            }
        }
        return 'voice-only'; // 默认仅语音消音
    }

    // 更新显示的文本（用于思维导图或内容显示）
    updateDisplayedText(originalText, filteredText = null) {
        // 这个方法会在思维导图更新时被调用
        // 实际显示更新会在思维导图渲染时处理
        console.log('文本显示已更新，原始内容:', originalText);
        if (filteredText && filteredText !== originalText) {
            console.log('过滤后显示内容:', filteredText);
        }
    }

    // 通用API调用重试机制
    async callAPIWithRetry(apiCall, maxRetries, apiType) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[${apiType}] 第 ${attempt}/${maxRetries} 次调用...`);
                const result = await apiCall();
                console.log(`[${apiType}] 第 ${attempt} 次调用成功`);
                return result;
            } catch (error) {
                lastError = error;
                console.error(`[${apiType}] 第 ${attempt} 次调用失败:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error(`[${apiType}] 所有重试都失败，最终错误:`, error.message);
                    throw new Error(`${apiType}调用失败 (${attempt}/${maxRetries}): ${error.message}`);
                }
                
                // 指数退避延迟
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.log(`[${apiType}] 等待 ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    // 预加载下一个文件
    async preloadNextFile() {
        if (!this.files || this.files.length === 0) {
            console.log('没有文件需要预加载');
            return;
        }
        
        if (this.currentIndex >= this.files.length - 1) {
            console.log('已经是最后一个文件，无需预加载');
            return; // 已经是最后一个文件
        }
        
        const nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.files.length) {
            console.log('下一个索引超出范围');
            return;
        }
        
        const nextFile = this.files[nextIndex];
        if (!nextFile) {
            console.log('下一个文件不存在');
            return;
        }
        
        if (this.preloadedResults[nextFile.name]) {
            console.log(`文件 ${nextFile.name} 已预加载过`);
            return; // 已经预加载过
        }
        
        console.log(`预加载下一个文件: ${nextFile.name} (索引: ${nextIndex}/${this.files.length})`);
        
        try {
            // 并行处理视觉模型和思维导图模型
            const visionPromise = this.processWithVisionModel(nextFile);
            const mindmapPromise = visionPromise.then(visionResult => 
                this.processWithMindmapModel(visionResult)
            );
            
            const [visionResult, mindmapResult] = await Promise.all([
                visionPromise,
                mindmapPromise
            ]);
            
            this.preloadedResults[nextFile.name] = {
                visionResult,
                mindmapResult,
                fileName: nextFile.name,
                timestamp: Date.now()
            };
            
            console.log(`预加载完成: ${nextFile.name}`);
        } catch (error) {
            console.error(`预加载失败: ${nextFile.name}`, error.message);
            // 预加载失败不影响主流程，清理失败的预加载记录
            delete this.preloadedResults[nextFile.name];
        }
    }
}

// 初始化文件夹处理器
let folderProcessor;

document.addEventListener('DOMContentLoaded', () => {
    folderProcessor = new FolderProcessor();
    console.log('文件夹处理器已初始化');
});