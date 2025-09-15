document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，开始初始化应用');
    
    // 获取DOM元素
    const markdownInput = document.getElementById('markdown-input');
    const generateBtn = document.getElementById('generate-btn');
    const copyBtn = document.getElementById('copy-btn');
    const clearBtn = document.getElementById('clear-btn');
    const mindmapContainer = document.getElementById('mindmap-container');
    const outputSection = document.querySelector('.output-section'); // For hiding mindmap
    const typingEffectCheckbox = document.getElementById('typing-effect');
    const toggleMindmapBtn = document.getElementById('toggle-mindmap-btn'); // New button
    const readMarkdownBtn = document.getElementById('read-markdown-btn'); // New button
    const downloadBtn = document.getElementById('download-btn'); // 下载按钮
    const downloadAllBtn = document.getElementById('download-all-btn'); // 合并下载按钮
    const markdownSyncDisplay = document.getElementById('markdown-sync-display'); // 新增同步显示
    
    // 从本地存储加载用户设置
    // loadUserSettings(); // 旧位置
    
    // 语音设置相关元素
    const voiceSelect = document.getElementById('voice-select');
    const voiceSpeed = document.getElementById('voice-speed');
    const voiceVolume = document.getElementById('voice-volume');
    const speedValue = document.getElementById('speed-value');
    const volumeValue = document.getElementById('volume-value');
    
    // 从本地存储加载用户设置
    loadUserSettings(); // 新位置
    
    // 默认示例文本
    const defaultMarkdown = `# Markmap思维导图示例
## 功能特点
### Markdown转换
- 支持标准Markdown语法
- 自动生成层级结构
### 交互功能
- 缩放
- 展开/折叠节点
- 拖动导图
## 使用方法
### 输入
- 在左侧输入Markdown文本
- 实时更新思维导图
### 导出
- 支持导出为图片
- 可复制原始Markdown内容`;
    
    markdownInput.value = defaultMarkdown;
    
    // 全局变量，用于保存思维导图实例和SVG元素
    let markmapInstance = null;
    let svgElement = null;
    let transformerInstance = null;
    let currentMarkmapRootData = null; // Added: To hold the current root data for modifications
    /*
     * 思维导图逐步朗读时的动态删除策略
     * ------------------------------------------------------------------
     * 1. idsOfNodesToDelete      : 累积需要从后续步骤中删除的节点 ID 列表
     * 2. lastReadNodeIdByDepth   : 记录每一个 depth（0~N）上最近朗读过的节点 ID
     *                              当出现同一 depth 的新节点时，自动将之前的节点列入删除列表。
     * 这样即可支持"删除上一个同级分支，但保留其父级" 的需求，
     * 并天然支持最多 10 层甚至更多层级，无需写死 depth 值。
     */
    let idsOfNodesToDelete = [];          // 待删除节点 ID 列表（累积）
    // 使用 pathStack 记录当前路径上节点 ID；用于精准删除已完成的节点（含同级兄弟）
    let pathStack = []; // index 对应 depth, 值为 nodeId
    // （兼容旧逻辑变量，保留但不再使用）
    let idsOfSecondLevelNodesToDelete = []; // Deprecated
    let idOfLastReadSecondLevelNode = null; // Deprecated
    let lastReadSecondLevelSvgElement = null; // Stores the SVG element of the last read 2nd level node
    
    // 语音合成相关
    let speechSynthesis = window.speechSynthesis;
    let isReading = false; // General flag for any reading process
    let currentReadingType = null; // 'mindmap' or 'markdown'
    let shouldStopReading = false;
    let currentReadingNode = null; // 当前正在朗读的节点
    let loadedPreferredVoiceName = null; // Stores voice name from localStorage
    const DESIRED_DEFAULT_VOICE = "Microsoft 曉臻 Online (Natural) - Chinese (Taiwanese Mandarin, Traditional) (zh-TW)";
    const DESIRED_DEFAULT_ENGLISH_VOICE = "Microsoft Sonia Online (Natural) - English (United Kingdom) (en-GB)";
    
    // 全局变量，用于控制缩放 -- 这些将被移除或替换
    // let initialScaleSet = false; // 将被移除
    // let fixedScale = 1.0; // 将被移除
    const DESIRED_FOCUS_SCALE = 1.5; // 新增：朗读时期望的聚焦缩放级别
    
    // 填充语音选择下拉框
    function populateVoiceList() {
        console.log('填充语音选择下拉框...');
        const voices = speechSynthesis.getVoices();
        console.log('可用语音数量:', voices.length);
        
        // 调试：显示所有可用语音
        console.log('=== 调试：所有可用语音 ===');
        voices.forEach((voice, index) => {
            console.log(`${index}: ${voice.name} (${voice.lang}) - ${voice.localService ? 'Local' : 'Remote'}`);
        });
        console.log('=== 调试结束 ===');
        
        if (voices.length === 0) {
            console.warn('没有找到可用的语音');
            return;
        }

        // 清空下拉框
        voiceSelect.innerHTML = '';

        // 添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.textContent = '自动选择';
        voiceSelect.appendChild(defaultOption);

        // 按语言分组语音
        const voiceGroups = {
            'zh': [],
            'en': [],
            'other': []
        };

        voices.forEach(voice => {
            if (voice.lang.includes('zh') || voice.lang.includes('CN')) {
                voiceGroups.zh.push(voice);
            } else if (voice.lang.startsWith('en')) {
                voiceGroups.en.push(voice);
            } else {
                voiceGroups.other.push(voice);
            }
        });

        // 添加中文语音组
        if (voiceGroups.zh.length > 0) {
            const zhOptgroup = document.createElement('optgroup');
            zhOptgroup.label = '中文语音';
            addVoicesToOptgroup(zhOptgroup, voiceGroups.zh);
            voiceSelect.appendChild(zhOptgroup);
        }

        // 添加英文语音组
        if (voiceGroups.en.length > 0) {
            const enOptgroup = document.createElement('optgroup');
            enOptgroup.label = '英文语音';
            addVoicesToOptgroup(enOptgroup, voiceGroups.en);
            voiceSelect.appendChild(enOptgroup);
        }

        // 添加其他语音组
        if (voiceGroups.other.length > 0) {
            const otherOptgroup = document.createElement('optgroup');
            otherOptgroup.label = '其他语音';
            addVoicesToOptgroup(otherOptgroup, voiceGroups.other);
            voiceSelect.appendChild(otherOptgroup);
        }

        // 添加语音到分组的辅助函数
        function addVoicesToOptgroup(optgroup, voiceList) {
            voiceList.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                optgroup.appendChild(option);
            });
        }

        // 如果没有找到任何语音，添加一个占位符选项
        if (voiceSelect.options.length === 1) { // 只有默认选项
            const optionElement = document.createElement('option');
            optionElement.value = 'none';
            optionElement.textContent = '无可用语音';
            voiceSelect.appendChild(optionElement);
            console.warn("没有找到语音，添加了占位符选项");
        }
        
        // 恢复用户之前选择的语音
        restoreVoiceSelection();
        
        console.log('语音选择下拉框已更新，当前选中:', voiceSelect.value);
    }

    // 恢复语音选择
    function restoreVoiceSelection() {
        const voices = speechSynthesis.getVoices();
        
        // 强制设置默认中文语音 Microsoft 曉臻 Online (Natural)
        const defaultVoice = 'Microsoft 曉臻 Online (Natural) - Chinese (Taiwanese Mandarin, Traditional) (zh-TW)';
        
        // 查找并设置默认中文语音
        for (let i = 0; i < voiceSelect.options.length; i++) {
            if (voiceSelect.options[i].value === defaultVoice) {
                voiceSelect.selectedIndex = i;
                localStorage.setItem('selectedVoice', defaultVoice);
                console.log(`已强制设置默认中文语音: ${defaultVoice}`);
                return;
            }
        }
        
        // 如果强制默认语音不可用，尝试其他中文语音
        const chineseVoices = voices.filter(v => 
            v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW')
        );
        
        if (chineseVoices.length > 0) {
            let preferredVoice = chineseVoices.find(v => 
                v.name.includes('Natural') || v.name.includes('Online')
            );
            
            if (!preferredVoice) {
                preferredVoice = chineseVoices[0];
            }
            
            for (let i = 0; i < voiceSelect.options.length; i++) {
                if (voiceSelect.options[i].value === preferredVoice.name) {
                    voiceSelect.selectedIndex = i;
                    localStorage.setItem('selectedVoice', preferredVoice.name);
                    console.log(`已设置中文语音: ${preferredVoice.name}`);
                    return;
                }
            }
        }
        
        // 最后选择第一个可用语音
        if (voiceSelect.options.length > 1) {
            voiceSelect.selectedIndex = 1;
            localStorage.setItem('selectedVoice', voiceSelect.value);
            console.log('已选择第一个可用语音');
        }
    }
    
    // 尝试获取可用的语音列表并填充下拉框
    function getVoiceList() {
        console.log('尝试获取语音列表...');
        
        if (window.speechSynthesis) {
            // 尝试获取Web Speech API的语音列表
            console.log('使用Web Speech API获取语音列表');
            const voices = window.speechSynthesis.getVoices();
            
            // 如果语音列表已加载，直接填充
            if (voices && voices.length > 0) {
                console.log('语音列表已加载:', voices.length);
                populateVoiceList();
            } else {
                // 否则，添加事件监听器等待列表加载
                console.log('语音列表尚未加载，添加onvoiceschanged监听器');
                speechSynthesis.onvoiceschanged = function() {
                    console.log('语音列表已变化，重新填充下拉框');
                    populateVoiceList();
                };
            }
        } else {
            console.log('Web Speech API不可用');
        }
    }
    
    // 在页面加载时尝试获取语音列表
    getVoiceList();
    
    // 绑定语音设置控件事件
    voiceSpeed.addEventListener('input', function() {
        speedValue.textContent = parseFloat(this.value).toFixed(1);
        saveUserSettings();
    });
    
    voiceVolume.addEventListener('input', function() {
        volumeValue.textContent = parseFloat(this.value).toFixed(1);
        saveUserSettings();
    });

    voiceSelect.addEventListener('change', function() {
        const selectedVoiceName = this.value;
        
        // 自动记忆中英文语音选择
        const voices = speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === selectedVoiceName);
        
        if (selectedVoice) {
            if (selectedVoice.lang.includes('zh') || selectedVoice.lang.includes('CN') || selectedVoice.lang.includes('TW')) {
                voiceSelect.dataset.chineseVoice = selectedVoiceName;
                console.log('已记忆中文语音:', selectedVoiceName);
            } else if (selectedVoice.lang.startsWith('en')) {
                voiceSelect.dataset.englishVoice = selectedVoiceName;
                console.log('已记忆英文语音:', selectedVoiceName);
            }
        }
        
        saveUserSettings();
    }); // Enhanced to save language-specific voice choices

    // 文件夹处理器集成：处理完成后自动朗读
    window.handleFolderProcessingComplete = async function(markdownContent, fileName, visionResult) {
        console.log('文件夹处理完成，准备自动朗读');
        console.log('视觉结果:', visionResult ? visionResult.substring(0, 100) + '...' : '空');
        
        // 更新视觉结果文本框 - 只有当有有效结果时才更新
        if (visionResult && visionResult.trim() && visionResult !== '无视觉识别结果') {
            if (folderProcessor && folderProcessor.displayVisionResult) {
                folderProcessor.displayVisionResult(visionResult);
            } else if (window.displayVisionResult) {
                window.displayVisionResult(visionResult);
            }
        }
        
        // 清理markdown内容，移除```markdown和```标记
        const cleanedContent = markdownContent
            .replace(/```markdown\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        // 设置到markdown输入框
        markdownInput.value = cleanedContent;
        
        // 生成思维导图
        await updateMindmapData(cleanedContent);
        
        // 等待思维导图生成完成，然后开始朗读
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (!isReading) {
            return new Promise((resolve) => {
                // 设置朗读完成后的回调
                const originalStopReading = stopReading;
                stopReading = function() {
                    const result = originalStopReading.call(this);
                    resolve();
                    return result;
                };
                
                const readingPromise = startReadingMarkdown();
                
                // 如果朗读立即完成（没有内容等情况），也resolve
                setTimeout(() => {
                    if (!isReading) {
                        resolve();
                    }
                }, 200);
                
                // 等待朗读完成
                if (readingPromise && readingPromise.then) {
                    readingPromise.then(() => {
                        resolve();
                    }).catch(() => {
                        resolve(); // 即使出错也继续
                    });
                }
            });
        } else {
            return Promise.resolve();
        }
    };

    // 开始朗读markdown内容
    function startReadingMarkdown() {
        const text = markdownInput.value.trim();
        if (!text) {
            console.log('没有内容需要朗读');
            return Promise.resolve();
        }
        
        console.log('开始朗读markdown内容');
        return readAndAnimateMindmap(text);
    }
    
    // Detect language of the text
    function detectLanguage(text) {
        if (!text || typeof text !== 'string' || text.trim() === '') return 'unknown';

        // Regex for CJK ideographs and other relevant East Asian scripts
        const cjkPattern = /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3200-\u32FF\u3400-\u4DBF\u4DC0-\u4DFF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;
        // Regex for basic Latin alphabet
        const latinPattern = /[a-zA-Z]/;

        const hasCJK = cjkPattern.test(text);
        const hasLatin = latinPattern.test(text);

        if (hasCJK) {
            return 'zh'; // Prioritize CJK if present
        }
        if (hasLatin) {
            return 'en';
        }
        // If neither specifically detected, but text exists, might default based on context or user preference
        // For now, 'unknown' will likely fallback to Chinese voice logic due to project history.
        console.warn(`detectLanguage: Could not determine language for text: "${text.substring(0,50)}...". Returning 'unknown'.`);
        return 'unknown'; 
    }
    
    // 使用Web Speech API与Edge TTS朗读文本
    async function speakWithWebSpeechAPI(text, rate, volume, detectedLang = 'unknown', enableSensitiveFilter = true) {
        let speechText = text;
        let displayText = text;
        console.log('进入speakWithWebSpeechAPI, enableSensitiveFilter:', enableSensitiveFilter);
        
        // 敏感词过滤
        if (enableSensitiveFilter) {
            const enableSensitiveFilterCheckbox = document.getElementById('enable-sensitive-filter');
            const shouldFilter = enableSensitiveFilterCheckbox ? enableSensitiveFilterCheckbox.checked : true;
            console.log('shouldFilter:', shouldFilter);
            
            if (shouldFilter) {
                try {
                    const detectionResult = await detectSensitiveWords(text);
                    console.log('检测结果:', detectionResult);
                    if (detectionResult.hasSensitiveWords) {
                        const filterMode = getSensitiveFilterMode();
                        
                        if (filterMode === 'both') {
                            // 文字和语音都拦截
                            console.log(`检测到敏感词: ${detectionResult.sensitiveWords.join(', ')}，文字和语音都将被过滤`);
                            speechText = filterSensitiveWordsForSpeech(text, detectionResult.sensitiveWords);
                            displayText = filterSensitiveWordsForDisplay(text, detectionResult.sensitiveWords);
                            console.log('both模式下过滤后 speechText:', speechText, 'displayText:', displayText);
                        } else {
                            // 仅语音消音，文字显示完整
                            console.log(`检测到敏感词: ${detectionResult.sensitiveWords.join(', ')}，朗读时将消音处理，文字显示保持不变`);
                            speechText = filterSensitiveWordsForSpeech(text, detectionResult.sensitiveWords);
                            displayText = text; // 保持原文显示
                            console.log('voice-only模式下过滤后 speechText:', speechText, 'displayText:', displayText);
                        }
                        
                        // 更新显示的文本
                        updateDisplayedText(text, displayText);
                        console.log('更新显示文本: original:', text, 'filtered:', displayText);
                    }
                } catch (error) {
                    console.error('敏感词检测失败:', error);
                    console.log('检测错误详情:', error.message);
                    // 敏感词检测失败时，继续朗读原文，不中断流程
                    speechText = text;
                    displayText = text;
                }
            }
        }
        
        return new Promise(async (resolve, reject) => {
            console.log(`使用Web Speech API朗读: "${speechText.substring(0,50)}...", 检测语言: ${detectedLang}`);

            // 解析 speechText 中的 [停顿xxxms] 标记
            const parts = [];
            let remaining = speechText;
            const pauseRegex = /\[停顿(\d+)ms\]/g;
            let match;
            let lastIndex = 0;
            while ((match = pauseRegex.exec(remaining)) !== null) {
                const textPart = remaining.slice(lastIndex, match.index);
                if (textPart) parts.push({type: 'text', content: textPart});
                parts.push({type: 'pause', duration: parseInt(match[1])});
                lastIndex = pauseRegex.lastIndex;
            }
            const finalText = remaining.slice(lastIndex);
            if (finalText) parts.push({type: 'text', content: finalText});

            const voices = speechSynthesis.getVoices();
            let selectedVoice = null;
            const userSelectedVoiceNameInDropdown = voiceSelect.value;

            if (voices.length === 0) {
                console.error("No voices available from speechSynthesis.getVoices()");
                return reject(new Error("No speech synthesis voices available."));
            }

            // 增强的语音选择策略 - 支持中英文语音记忆
            if (detectedLang === 'en') {
                // utterance.lang = 'en-GB'; // Move to utterance creation
                
                // 1. 优先使用记忆的英文语音
                const rememberedEnglishVoice = voiceSelect.dataset.englishVoice;
                if (rememberedEnglishVoice) {
                    const memoryVoice = voices.find(v => v.name === rememberedEnglishVoice && v.lang.startsWith('en'));
                    if (memoryVoice) {
                        selectedVoice = memoryVoice;
                        console.log('使用记忆的英文语音:', selectedVoice.name);
                    }
                }
                
                // 2. 如果用户选择了英文语音，优先使用
                if (!selectedVoice && userSelectedVoiceNameInDropdown && userSelectedVoiceNameInDropdown !== 'default') {
                    const userChoiceVoice = voices.find(v => 
                        v.name === userSelectedVoiceNameInDropdown && v.lang.startsWith('en')
                    );
                    if (userChoiceVoice) {
                        selectedVoice = userChoiceVoice;
                        console.log('使用用户选择的英文语音:', selectedVoice.name);
                    }
                }
                
                // 3. 使用预设的英文语音
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => 
                        v.name === DESIRED_DEFAULT_ENGLISH_VOICE
                    );
                    if (selectedVoice) {
                        console.log('使用预设默认英文语音 Sonia:', selectedVoice.name);
                    }
                }
                
                // 4. 其他英文语音回退
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Microsoft'));
                    if (selectedVoice) console.log('使用其他Microsoft英国英文语音:', selectedVoice.name);
                }
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => v.lang.startsWith('en-'));
                    if (selectedVoice) console.log('使用任意英文语音:', selectedVoice.name);
                }

            } else if (detectedLang === 'zh') {
                // utterance.lang = 'zh-TW';
                
                // 1. 优先使用记忆的中文语音
                const rememberedChineseVoice = voiceSelect.dataset.chineseVoice;
                if (rememberedChineseVoice) {
                    const memoryVoice = voices.find(v => v.name === rememberedChineseVoice && 
                        (v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW')));
                    if (memoryVoice) {
                        selectedVoice = memoryVoice;
                        console.log('使用记忆的中文语音:', selectedVoice.name);
                    }
                }
                
                // 2. 如果用户选择了中文语音，优先使用
                if (!selectedVoice && userSelectedVoiceNameInDropdown && userSelectedVoiceNameInDropdown !== 'default') {
                    const userChoiceVoice = voices.find(v => 
                        v.name === userSelectedVoiceNameInDropdown && 
                        (v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW'))
                    );
                    if (userChoiceVoice) {
                        selectedVoice = userChoiceVoice;
                        console.log('使用用户选择的中文语音:', selectedVoice.name);
                    }
                }
                
                // 3. 使用预设的中文语音
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => 
                        v.name === DESIRED_DEFAULT_VOICE
                    );
                    if (selectedVoice) {
                        console.log('使用预设默认中文语音 曉臻:', selectedVoice.name);
                    }
                }
                
                // 4. 其他中文语音回退
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => (v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW')) && v.name.includes('Microsoft'));
                    if (selectedVoice) console.log('使用其他Microsoft中文语音:', selectedVoice.name);
                }
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW'));
                    if (selectedVoice) console.log('使用任意中文语音:', selectedVoice.name);
                }

            } else {
                // 未知语言，默认使用中文
                // utterance.lang = 'zh-TW';
                console.warn(`语言 "${detectedLang}" 未知，使用中文语音回退`);
                
                // 优先使用记忆的中文语音
                const rememberedChineseVoice = voiceSelect.dataset.chineseVoice;
                if (rememberedChineseVoice) {
                    const memoryVoice = voices.find(v => v.name === rememberedChineseVoice && 
                        (v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW')));
                    if (memoryVoice) {
                        selectedVoice = memoryVoice;
                        console.log('使用记忆的中文语音:', selectedVoice.name);
                    }
                }
                
                if (!selectedVoice && userSelectedVoiceNameInDropdown && userSelectedVoiceNameInDropdown !== 'default') {
                    selectedVoice = voices.find(v => v.name === userSelectedVoiceNameInDropdown);
                }
                
                // 使用指定的默认中文语音
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => v.name === DESIRED_DEFAULT_VOICE);
                    if (selectedVoice) console.log('回退使用预设默认中文语音 曉臻:', selectedVoice.name);
                }
                
                if (!selectedVoice) {
                    selectedVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN') || v.lang.includes('TW'));
                    if (selectedVoice) console.log('回退使用任意中文语音:', selectedVoice.name);
                }
            }

            // 顺序处理每个部分
            for (const part of parts) {
                if (part.type === 'text') {
                    const utterance = new SpeechSynthesisUtterance(part.content);
                    utterance.rate = rate;
                    utterance.volume = volume;
                    utterance.lang = detectedLang === 'en' ? 'en-GB' : (detectedLang === 'zh' ? 'zh-TW' : 'zh-TW');
                    
                    if (selectedVoice) {
                        utterance.voice = selectedVoice;
                        console.log(`使用语音: ${selectedVoice.name} (${selectedVoice.lang})`);
                    } else {
                        console.warn(`未找到合适语音，浏览器将根据 utterance.lang (${utterance.lang}) 自动选择`);
                    }

                    const timeoutDuration = Math.max(10000, part.content.length * 200);
                    const timeout = setTimeout(() => {
                        console.warn(`语音合成超时 (${timeoutDuration}ms) for: ${part.content.substring(0,30)}...`);
                        speechSynthesis.cancel();
                        reject(new Error("语音合成超时"));
                    }, timeoutDuration);

                    await new Promise((res, rej) => {
                        utterance.onend = () => {
                            clearTimeout(timeout);
                            res();
                        };
                        utterance.onerror = (event) => {
                            clearTimeout(timeout);
                            console.error('语音合成错误:', event.error, '对于文本:', part.content.substring(0,50));
                            // 提供详细的错误信息
                            if (event.error === 'network') {
                                console.error('网络错误：请检查网络连接');
                            } else if (event.error === 'not-allowed') {
                                console.error('权限错误：请检查浏览器权限设置');
                            } else if (event.error === 'language-not-supported') {
                                console.error('语言不支持：尝试使用其他语音');
                            }
                            rej(new Error(`语音合成错误: ${event.error}`));
                        };
                        speechSynthesis.speak(utterance);
                    });
                } else if (part.type === 'pause') {
                    await new Promise(res => setTimeout(res, part.duration));
                }
            }
            resolve();
        });
    }
    
    // 敏感词检测函数
    async function detectSensitiveWords(text) {
        const appId = document.getElementById('banned-words-appid')?.value || '';
        const secretKey = document.getElementById('banned-words-secret')?.value || '';
        
        if (!appId || !secretKey) {
            console.warn('敏感词检测API配置不完整');
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }

        // 获取选中的行业和平台
        const selectedIndustries = Array.from(document.querySelectorAll('.industry-filter:checked')).map(cb => cb.value);
        const selectedPlatforms = Array.from(document.querySelectorAll('.platform-filter:checked')).map(cb => cb.value);

        const apiUrl = 'https://api.check51.cn/api/word/detect-text';
        const formData = new FormData();
        formData.append('appid', appId);
        formData.append('secretKey', secretKey);
        // 对内容进行Unicode转义
        let unicodeContent = '';
        for (let i = 0; i < text.length; i++) {
            let charCode = text.charCodeAt(i);
            if (charCode > 127) {
                unicodeContent += '\\u' + charCode.toString(16).padStart(4, '0');
            } else {
                unicodeContent += text[i];
            }
        }
        formData.append('content', unicodeContent);
        formData.append('detectMode', '0'); // 0=严格，1=宽松
        formData.append('encode', 'unicode');
        
        // 添加行业和平台参数
        if (selectedIndustries.length > 0) {
            formData.append('industries', selectedIndustries.join(','));
        }
        if (selectedPlatforms.length > 0) {
            formData.append('platforms', selectedPlatforms.join(','));
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                console.error('敏感词检测API请求失败:', response.status);
                return { hasSensitiveWords: false, sensitiveWords: [] };
            }

            const result = await response.json();
            console.log('API响应:', result);
            console.log('Diagnostic: code value =', result.code);
            console.log('Diagnostic: code type =', typeof result.code);
            console.log('Diagnostic: has data =', !!result.data);
            console.log('Diagnostic: data content =', JSON.stringify(result.data));
            
            if (result.code === '0000' && result.data) {
                const sensitiveWords = [];
                
                // 处理禁用词
                if (result.data.forbiddenWords) {
                    result.data.forbiddenWords.forEach(item => {
                        if (item.title) {
                            sensitiveWords.push(item.title);
                        }
                    });
                }
                
                // 处理风险词
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
                
                console.log('提取的敏感词:', sensitiveWords);
                console.log('敏感词检测结果:', {
                    industries: selectedIndustries,
                    platforms: selectedPlatforms,
                    sensitiveWords: sensitiveWords
                });
                
                return {
                    hasSensitiveWords: sensitiveWords.length > 0,
                    sensitiveWords: sensitiveWords
                };
            }
            
            console.log('API返回代码不为0或无data:', result);
            return { hasSensitiveWords: false, sensitiveWords: [] };
        } catch (error) {
            console.error('敏感词检测API调用错误:', error);
            console.log('错误详情:', error.message);
            return { hasSensitiveWords: false, sensitiveWords: [] };
        }
    }

    // 敏感词过滤函数 - 语音消音（用停顿替代）
    function filterSensitiveWordsForSpeech(text, sensitiveWords) {
        if (!sensitiveWords || sensitiveWords.length === 0) {
            return text;
        }
        
        let filteredText = text;
        sensitiveWords.forEach(word => {
            if (word && word.trim()) {
                const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                // 根据敏感词长度生成相应时长的停顿
                // 每个字符对应100ms停顿，最少200ms，最多2000ms
                const pauseDuration = Math.max(200, Math.min(2000, word.length * 100));
                const pauseText = `[停顿${pauseDuration}ms]`;
                filteredText = filteredText.replace(regex, pauseText);
            }
        });
        
        return filteredText;
    }

    // 敏感词过滤函数 - 文字显示（用星号替换）
    function filterSensitiveWordsForDisplay(text, sensitiveWords) {
        if (!sensitiveWords || sensitiveWords.length === 0) {
            return text;
        }
        
        let filteredText = text;
        sensitiveWords.forEach(word => {
            if (word && word.trim()) {
                const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                filteredText = filteredText.replace(regex, '*'.repeat(word.length));
            }
        });
        
        return filteredText;
    }

    // 获取敏感词过滤模式
    function getSensitiveFilterMode() {
        const radioBoth = document.querySelector('input[name="sensitive-filter-mode"][value="both"]');
        return radioBoth && radioBoth.checked ? 'both' : 'voice-only';
    }

    // 更新显示的文本（当敏感词被过滤时）
    function updateDisplayedText(originalText, filteredText) {
        if (originalText === filteredText) {
            return; // 没有变化，不需要更新
        }
        
        console.log('更新显示的文本，原始文本将被过滤显示');
        
        // 更新思维导图中的文本
        if (window.markmapInstance && window.currentMindmapData) {
            // 递归更新节点文本
            function updateNodeText(node) {
                if (node.content && node.content.includes(originalText)) {
                    node.content = filteredText;
                }
                if (node.children) {
                    node.children.forEach(updateNodeText);
                }
            }
            
            updateNodeText(window.currentMindmapData);
            
            // 重新渲染思维导图
            try {
                const { Transformer } = window.markmap;
                if (Transformer && window.markmapInstance) {
                    const transformer = new Transformer();
                    const { root } = transformer.transform(window.currentMindmapData.content || '');
                    window.markmapInstance.setData(root);
                    console.log('思维导图显示已更新');
                }
            } catch (error) {
                console.error('更新思维导图显示时出错:', error);
            }
        }
        
        // 更新原文显示区域（如果有）
        const originalContentDiv = document.getElementById('original-content');
        if (originalContentDiv && originalContentDiv.textContent.includes(originalText)) {
            originalContentDiv.textContent = filteredText;
        }
    }

    // 更新思维导图中特定节点的显示文本
    function updateNodeTextDisplay(rootNode, originalText, filteredText) {
        if (originalText === filteredText) {
            return;
        }
        
        function updateNodeRecursive(node) {
            if (node.payload && node.payload.content && node.payload.content.includes(originalText)) {
                node.payload.content = filteredText;
                if (node.content) {
                    node.content = filteredText;
                }
            }
            
            if (node.children) {
                node.children.forEach(updateNodeRecursive);
            }
        }
        
        updateNodeRecursive(rootNode);
    }

    // 停止朗读
    function stopReading() {
        console.log("stopReading called, currentReadingType:", currentReadingType);
        shouldStopReading = true;
        currentReadingNode = null;
        
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

        // Reset mindmap reading button if it was active
        generateBtn.textContent = '朗读内容';
        generateBtn.classList.remove('reading');
        generateBtn.disabled = false;

        // Reset markdown reading button if it was active
        if (readMarkdownBtn) { // Check if button exists
            readMarkdownBtn.textContent = '朗读原文';
            readMarkdownBtn.classList.remove('reading');
            readMarkdownBtn.disabled = false;
        }

        // 重置思维导图朗读状态，但不重新加载数据以保持视觉结果
        if (currentReadingType === 'mindmap' && markmapInstance) {
            // 不再重新加载数据，避免清除视觉结果
            console.log('停止朗读，保留视觉结果和思维导图状态');
        }

        isReading = false;
        currentReadingType = null;
    }
    
    // 防抖函数 - 避免频繁更新
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    // 创建一次思维导图实例和SVG，后续只更新数据
    function createMarkmapElements() {
        try {
            // --- BEGIN NEW DIAGNOSTIC LOGS ---
            console.log('createMarkmapElements: Entry - window.markmap object:', window.markmap);
            if (window.markmap) {
                console.log('createMarkmapElements: Entry - typeof window.markmap.Markmap:', typeof window.markmap.Markmap);
                console.log('createMarkmapElements: Entry - typeof window.markmap.Transformer:', typeof window.markmap.Transformer);
            }
            // --- END NEW DIAGNOSTIC LOGS ---

                // 检查markmap库是否已加载
    if (!window.markmap || !window.d3) {
        console.error('Markmap或D3库未正确加载');
        mindmapContainer.innerHTML = '<div class="error-message">思维导图库加载失败<br><small>请刷新页面或检查网络连接</small><br><button onclick="location.reload()">刷新页面</button></div>';
        return null;
    }
            
            // 清空容器
            mindmapContainer.innerHTML = '';
            
            // 创建SVG元素
            svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgElement.setAttribute('style', 'width: 100%; height: 100%;');
            mindmapContainer.appendChild(svgElement);
            
            try {
                // 创建Transformer实例
                const { Transformer } = window.markmap;
                if (!Transformer) {
                    throw new Error('Markmap Transformer不可用');
                }
                transformerInstance = new Transformer();
                
                // 创建Markmap实例
                const { Markmap } = window.markmap;
                if (!Markmap) {
                    throw new Error('Markmap不可用');
                }
                
                // --- BEGIN NEW DIAGNOSTIC LOGS ---
                console.log('createMarkmapElements: Before Markmap.create - typeof Markmap (local const):', typeof Markmap);
                // --- END NEW DIAGNOSTIC LOGS ---

                // 创建Markmap实例，使用更强大的配置
                markmapInstance = Markmap.create(svgElement, {
                    embedAssets: false,
                    zoom: true,
                    pan: true,
                    maxWidth: 0, // 0表示无宽度限制，让文字完全显示
                    initialExpandLevel: -1, // 展开所有层级，无限制
                    duration: 500, // 动画持续时间
                    autoFit: true, // 自动调整大小
                    spacingVertical: 12, // 增加垂直间距
                    spacingHorizontal: 120, // 进一步增加水平间距，给文字更多空间
                    paddingX: 8, // 增加节点内边距
                    color: (node) => {
                        // 确保所有层级的节点都能正常显示
                        return null; // 使用默认颜色方案
                    },
                    toggleRecursively: false, // 禁用递归折叠，保持节点展开状态
                    colorFreezeLevel: 0 // 不冻结颜色，让每层都有不同颜色
                });
                
                // --- BEGIN NEW DIAGNOSTIC LOGS ---
                console.log('createMarkmapElements: markmapInstance created:', markmapInstance);
                if (markmapInstance) {
                    console.log('createMarkmapElements: typeof markmapInstance.navigateToNode:', typeof markmapInstance.navigateToNode);
                    console.log('createMarkmapElements: typeof markmapInstance.setData:', typeof markmapInstance.setData);
                    console.log('createMarkmapElements: typeof markmapInstance.fit:', typeof markmapInstance.fit);
                }
                // --- END NEW DIAGNOSTIC LOGS ---
                
                // 保存原始的fit方法 -- 将被移除
                // const originalFitMethod = markmapInstance.fit.bind(markmapInstance);
                
                // 覆盖fit方法 -- 将被移除
                // markmapInstance.fit = function() { ... };
                
                // 确保d3变换可用
                if (d3.zoomTransform && !svgElement.__zoom) {
                    svgElement.__zoom = d3.zoomIdentity;
                }
                
                console.log('思维导图实例创建成功');
                return markmapInstance;
            } catch (error) {
                console.error('创建思维导图实例时出错:', error);
                mindmapContainer.innerHTML = '<div class="error-message">创建思维导图实例失败，请刷新页面重试</div>';
                return null;
            }
        } catch (error) {
            console.error('初始化思维导图时发生错误:', error);
            mindmapContainer.innerHTML = '<div class="error-message">初始化思维导图失败，请刷新页面重试</div>';
            return null;
        }
    }
    
    // 检查SVG中的节点结构，用于调试
    function checkSvgNodeStructure() {
        if (!svgElement) {
            console.log('SVG元素不存在');
            return;
        }
        
        console.log('===== SVG节点结构检查 =====');
        
        // 检查所有可能的节点选择器
        const selectors = [
            '.markmap-node',
            'g.markmap-node',
            '[data-id]',
            '[data-key]',
            'g[data-id]',
            'g[data-key]',
            'g > circle',
            'g > text'
        ];
        
        selectors.forEach(selector => {
            const elements = svgElement.querySelectorAll(selector);
            console.log(`${selector}: 找到 ${elements.length} 个元素`);
            
            // 显示前3个元素的属性
            if (elements.length > 0) {
                console.log('示例元素:');
                for (let i = 0; i < Math.min(3, elements.length); i++) {
                    const el = elements[i];
                    console.log(`- 元素 #${i+1}:`, {
                        tagName: el.tagName,
                        classList: Array.from(el.classList),
                        attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`),
                        dataId: el.getAttribute('data-id'),
                        dataKey: el.getAttribute('data-key')
                    });
                }
            }
        });
        
        console.log('===== 检查完成 =====');
    }
    
    // 辅助：判断是否处于 MEM 模式
    function isInMemMode(){
        try{ const p = new URLSearchParams(location.search); return (p.get('embed')==='1' && p.get('mode')==='mem'); }catch(_e){ return false; }
    }
    try{ window.__mem_ack_by_api_sent = false; }catch(_e){}

    // 更新思维导图数据
    async function updateMindmapData(markdownContent, currentLine = null) {
        console.log("updateMindmapData: 更新思维导图数据", currentLine ? `当前行: ${currentLine}` : '');
        if (!transformerInstance) {
            console.error("Transformer 实例未初始化");
            return Promise.resolve(null); 
        }
        if (!markmapInstance || !svgElement) {
            console.log("Markmap 实例或SVG元素不存在，重新创建...");
            createMarkmapElements();
            if (!markmapInstance || !svgElement) {
                 console.error("Failed to create Markmap instance or SVG element in updateMindmapData.");
                 return Promise.resolve(null);
            }
        }

        const processedMarkdown = preprocessMarkdown(markdownContent, currentLine);
        
        // 对思维导图内容进行敏感词过滤
        const filterMode = getSensitiveFilterMode();
        let filteredMarkdown = processedMarkdown;
        if (filterMode === 'both') {
            try {
                const detectionResult = await detectSensitiveWords(processedMarkdown);
                if (detectionResult.hasSensitiveWords) {
                    filteredMarkdown = filterSensitiveWordsForDisplay(processedMarkdown, detectionResult.sensitiveWords);
                }
            } catch (error) {
                console.error('思维导图内容敏感词过滤失败:', error);
                // 继续使用原始内容，不中断流程
            }
        }
        
        // ============== 新增：当处于 MEM 模式时，通过思维导图模型API生成结构，再渲染 ==============
        try{
            const inMemMode = isInMemMode();
            // 若已在左侧 push() 中调用过 API，则不再重复调用，直接按本地渲染流程
            if(inMemMode && window.__mem_pre_api){
                window.__mem_pre_api = false; // 使用一次后清除
                const tr = transformerInstance.transform(filteredMarkdown);
                const parsedRootNode = tr.root;
                addNodeIds(parsedRootNode, 'node-', 0);
                // 不在这里 ack，改为朗读完成后统一 ack
                return Promise.resolve(parsedRootNode);
            }
            const apiBase = localStorage.getItem('mindmap-api-base') || '';
            const model = localStorage.getItem('mindmap-model') || 'kimi-k2-0711';
            const sys = localStorage.getItem('mindmap-system-prompt') || '';
            const userTpl = localStorage.getItem('mindmap-user-prompt-template') || '请根据以下内容生成一个结构化的思维导图：{content}';
            const apiKey = localStorage.getItem('mindmap-api-key') || '';
            const contentForApi = filteredMarkdown;

            // 过滤掉 base64 内联图片，仅传文本
            const noB64 = contentForApi.replace(/!\[[^\]]*\]\(data:image\/[\w+\-.]+;base64,[^)]+\)/g,'');
            const promptText = (sys? (sys+"\n\n") : '') + (userTpl||'').replace('{content}', noB64);

            // 在 MEM 模式尽量走 API；失败则回退本地渲染
            if(inMemMode){
                const body = { model, messages:[{ role:'user', content: promptText }], max_tokens: 4000 };
                // 选择后端代理（优先 /api/kimi 等），否则直连 openai 兼容接口
                let endpoint = '';
                if(model.startsWith('kimi')) endpoint = '/api/kimi';
                // 可根据后续扩展增加 qwen/gpt/claude
                const headers = { 'Content-Type':'application/json' };
                if(apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                try{
                    const resp = await fetch(endpoint || (apiBase ? apiBase : '/api/kimi'), { method:'POST', headers, body: JSON.stringify(body) });
                    if(resp.ok){
                        const data = await resp.json();
                        const mmText = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : filteredMarkdown;
                        // 将API返回的思维导图Markdown写回右侧输入框，确保后续朗读/复制用的是模型结果
                        try{ if (typeof markdownInput !== 'undefined' && markdownInput) { markdownInput.value = mmText; } }catch(_e){}
                        const tr = transformerInstance.transform(mmText);
                        const parsedRootNode = tr.root;
                        addNodeIds(parsedRootNode, 'node-', 0);
                        // 不在这里 ack，改为朗读完成后统一 ack
                        return Promise.resolve(parsedRootNode);
                    }
                }catch(e){ console.warn('思维导图API调用失败，回退本地解析：', e); }
            }
        }catch(e){ console.warn('mem/api 分支异常，回退本地解析：', e); }

        // 默认：本地转换
        const transformResult = transformerInstance.transform(filteredMarkdown);
        const parsedRootNode = transformResult.root;
        addNodeIds(parsedRootNode, 'node-', 0);
        return Promise.resolve(parsedRootNode);
    }
    
    // 递归为节点添加唯一ID
    // function addNodeIds(rootD3HierarchyNode, prefix = 'node-') { // 参数名修改，它不是D3层级节点
    // let nodeIdCounter = 0; // 将计数器移到函数外部，以便在多次调用updateMindmapData时保持唯一性
    //
    // function addNodeIds(node, prefix = 'node-') { // node 是 markmap-lib.transform 返回的原始节点结构
    function addNodeIds(node, prefix = 'node-', currentDepth = 0) {
        /**
         * 深度优先遍历，为每个节点生成路径型 ID。
         * @param {Object} currentNode - 当前遍历到的节点
         * @param {number} level - 深度，根节点为 0
         * @param {Array<number>} pathArr - 表示从根到当前节点的兄弟索引路径
         */
        function dfs(currentNode, level, pathArr) {
            if (!currentNode) {
                console.warn('addNodeIds dfs: 当前节点为空');
                return;
            }

            // 基于路径生成稳定 ID，例如 node-0-2-1
            const pathKey = pathArr.length ? pathArr.join('-') : '0';
            const generatedId = `${prefix}${pathKey}`;

            currentNode.id = generatedId;
            // 确保 payload.id 与 id 一致
            currentNode.payload = currentNode.payload || {};
            currentNode.payload.id = generatedId;

            // 记录深度
            currentNode.depth = level;

            // 递归子节点
            if (currentNode.children && currentNode.children.length > 0) {
                currentNode.children.forEach((child, idx) => {
                    dfs(child, level + 1, [...pathArr, idx]);
                });
            }
        }

        // 从根节点开始递归，根路径为空数组
        dfs(node, currentDepth, []);
    }
    
    // 预处理Markdown，将缩进格式转换为标准Markdown标题格式
    // 动态层级管理：只有当前朗读节点层级 > 6 时才进行调整，否则保持原始层级
    function preprocessMarkdown(markdown, currentLine = null) {
        // 检查是否已经是标准Markdown格式（包含#号标题）
        const hasHeadings = /^#{1,}\s+/m.test(markdown);
        
        // 如果已经包含标准Markdown标题，则不做处理
        if (hasHeadings) {
            return markdown;
        }
        
        // 处理缩进格式的Markdown
        const lines = markdown.split('\n');
        const result = [];
        
        // 记录每行的原始层级和内容
        const lineData = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 跳过空行
            if (!line.trim()) {
                continue;
            }
            
            // 计算前导空格数量
            const leadingSpaces = line.match(/^(\s*)/)[1].length;
            const content = line.trim();
            
            // 如果内容以 - 或 * 开头，保留为列表项
            if (content.startsWith('-') || content.startsWith('*')) {
                lineData.push({ type: 'list', content: line, level: Math.floor(leadingSpaces / 2) + 1 });
                continue;
            }
            
            // 直接根据缩进计算层级：每2个空格为一级，无限制
            const originalLevel = Math.floor(leadingSpaces / 2) + 1;
            lineData.push({ type: 'heading', content, level: originalLevel });
        }
        
        // 完全移除所有层级限制 - 直接保持原始层级
        lineData.forEach(item => {
            if (item.type === 'heading') {
                // 直接使用原始层级，无任何调整
                item.adjustedLevel = item.level;
            }
        });
        
        // 生成最终的Markdown - 完全保留所有层级
        lineData.forEach(item => {
            if (item.type === 'list') {
                result.push(item.content);
            } else if (item.type === 'heading') {
                // 使用原始层级，不隐藏任何节点
                const headingPrefix = '#'.repeat(item.level) + ' ';
                result.push(headingPrefix + item.content);
            }
        });
        
        let finalMarkdown = result.join('\n');
        
        // 对导图显示内容进行敏感词过滤（已在readAndAnimateMindmap中处理，这里不再重复处理）
        
        return finalMarkdown;
    }
    
    // 解析Markdown结构，设计一个线性序列来逐步构建内容
    function buildProgressiveSequence(markdown) {
        // 不在这里预处理！保持原始格式，让 updateMindmapData 根据当前行动态处理
        const lines = markdown.split('\n').filter(line => line.trim());
        const sequence = [];
        
        // 处理有效的Markdown行
        for (let i = 0; i < lines.length; i++) {
            // 将之前所有行和当前行组合成对象格式
            sequence.push({
                markdown: lines.slice(0, i + 1).join('\n'),
                currentLine: lines[i].trim()
            });
        }
        
        return sequence;
    }
    
    // 提取用于朗读的内容文本
    function extractTextForReading(line) {
        line = line.trim();
        
        // 处理标准Markdown标题: '### 标题文本' -> '标题文本'
        if (line.startsWith('#')) {
            line = line.replace(/^#+\s*/, '');
        } 
        // 处理列表项: '- 列表内容' -> '列表内容'
        else if (line.startsWith('-') || line.startsWith('*')) {
            line = line.replace(/^[-*]\s+/, '');
        }
        // 处理缩进格式的文本，直接返回去除缩进的内容
        else {
            line = line.replace(/^\s+/, '');
        }
        
        // 对朗读内容进行敏感词过滤（语音停顿替代）
        return filterSensitiveWordsForSpeech(line);
    }
    
    // 居中显示节点 - 使用D3.js的transform和transition
    async function centerNodeElement(d3NodeToCenter) { // d3NodeToCenter is the D3 Hierarchy Node from datum()
        console.log('centerNodeElement: Entered function. d3NodeToCenter:', d3NodeToCenter);

        if (!d3NodeToCenter || !markmapInstance) { // Removed navigateToNode check
            console.error('centerNodeElement: Missing d3NodeToCenter or markmapInstance.');
            return;
        }

        // Validate if d3NodeToCenter looks like a D3 hierarchy node.
        if (typeof d3NodeToCenter.depth !== 'number' || !d3NodeToCenter.data) {
            console.error('centerNodeElement: d3NodeToCenter does not appear to be a valid D3 hierarchy node. Received:', d3NodeToCenter);
            return;
        }

        const nodeId = d3NodeToCenter.data.id || (d3NodeToCenter.data.payload ? d3NodeToCenter.data.payload.id : 'NO_ID_IN_DATA');
        const nodeContent = d3NodeToCenter.data.content || (d3NodeToCenter.data.payload ? d3NodeToCenter.data.payload.content : 'NO_CONTENT_IN_DATA');

        console.log(`centerNodeElement: Attempting to center d3Node with ID: '${nodeId}', Content: '${nodeContent}', Depth: ${d3NodeToCenter.depth}`);

        // 添加重试机制，等待SVG渲染完成
        let retryCount = 0;
        const maxRetries = 5;
        
        while (retryCount < maxRetries) {
            try {
                // 等待SVG元素完全渲染
                await new Promise(resolve => setTimeout(resolve, 200 * (retryCount + 1)));

                // 检查SVG元素是否存在且有有效尺寸
                const svgRect = svgElement.getBoundingClientRect();
                let viewWidth = svgRect.width;
                let viewHeight = svgRect.height;

                if (viewWidth <= 0 || viewHeight <= 0) {
                    console.warn(`centerNodeElement: SVG dimensions invalid on attempt ${retryCount + 1}, retrying...`);
                    retryCount++;
                    continue;
                }

                // Directly proceed to centering logic using d3 zoom transform if available.
                if (!markmapInstance.zoom || typeof markmapInstance.zoom.transform !== 'function') {
                    console.error('centerNodeElement: markmapInstance.zoom or markmapInstance.zoom.transform is not available. Cannot apply transform.');
                    retryCount++;
                    continue;
                }

                const desiredScale = 1.0; 
                console.log('centerNodeElement: Target scale for centering is:', desiredScale);

                // Get the node's data coordinates.
                // In Markmap's default horizontal layout:
                // d3NodeToCenter.y is the horizontal data coordinate.
                // d3NodeToCenter.x is the vertical data coordinate.
                const nodeDataX = d3NodeToCenter.y; 
                const nodeDataY = d3NodeToCenter.x;

                if (typeof nodeDataX === 'undefined' || typeof nodeDataY === 'undefined') {
                    console.error('centerNodeElement: Node data coordinates (y,x) are undefined. Cannot center.', d3NodeToCenter);
                    retryCount++;
                    continue;
                }
                console.log(`centerNodeElement: Node data coords (y,x from d3Node): (${nodeDataX}, ${nodeDataY})`);

                const viewCenterX = viewWidth / 2;
                const viewCenterY = viewHeight / 2;
                console.log(`centerNodeElement: Viewport center: (${viewCenterX}, ${viewCenterY})`);

                // Calculate the new translation (tx, ty) to center the node.
                const newTx = viewCenterX - (nodeDataX * desiredScale);
                const newTy = viewCenterY - (nodeDataY * desiredScale);

                const finalTransform = d3.zoomIdentity.translate(newTx, newTy).scale(desiredScale);
                
                console.log('centerNodeElement: Calculated final transform:', { tx: newTx, ty: newTy, k: desiredScale });

                // Apply the new transform with a short animation.
                d3.select(svgElement)
                    .transition()
                    .duration(300) // Smooth transition
                    .call(markmapInstance.zoom.transform, finalTransform);

                // Update Markmap's internal state
                if (markmapInstance.state) {
                    markmapInstance.state.x = finalTransform.x;
                    markmapInstance.state.y = finalTransform.y;
                    markmapInstance.state.k = finalTransform.k; // k should be desiredScale (1.0)
                    console.log('centerNodeElement: Updated markmapInstance.state to:', JSON.stringify(markmapInstance.state));
                }
                
                console.log('centerNodeElement: Applied custom centering transform with fixed scale 1.0.');
                return; // 成功居中后退出重试循环

            } catch (error) {
                console.error(`Error in centerNodeElement for node ID '${nodeId}' on attempt ${retryCount + 1}:`, error);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.error('centerNodeElement: Max retries reached, giving up on centering');
                }
            }
        }
    }
    
    // 平滑动画切换视图
    function animateViewBoxChange(startViewBox, endViewBox) {
        if (!markmapInstance) return;
        
        const startTime = Date.now();
        const duration = 500; // 动画持续时间（毫秒）
        
        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeInOutCubic(progress);
            
            // 计算当前视图位置
            const currentViewBox = startViewBox.map((start, i) => 
                start + (endViewBox[i] - start) * easedProgress
            );
            
            // 更新视图（不触发自动缩放）
            markmapInstance.setViewBox(currentViewBox);
            
            // 如果动画未完成，继续下一帧
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    // 缓动函数
    function easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // 高亮显示当前节点 - Now primarily relies on CSS class toggling
    function highlightNode(nodeElement) {
        // This function is now mostly a placeholder or can be removed if all styling is via CSS class.
        // The main logic of adding/removing .node-highlight class is now in readAndAnimateMindmap.
        // However, if there were other highlight-specific actions (e.g., complex animations not in CSS), they could go here.
        // For now, let's keep it minimal. It was previously called from readAndAnimateMindmap *before* typing.
        // The new flow in readAndAnimateMindmap handles adding/removing the class around typing/speech.

        // console.log('[highlightNode] Called. Current flow in readAndAnimateMindmap handles class toggle.');
        // If we need to ensure a clean slate before class is added:
        const previousHighlighted = svgElement.querySelectorAll('.markmap-node.node-highlight');
        previousHighlighted.forEach(el => {
            if (el !== nodeElement) { // Don't remove from the one we are about to highlight (or re-highlight)
                el.classList.remove('node-highlight');
                // Also restore its text to its specific base color if it had one
                const textHolder = el.querySelector('foreignObject div') || el.querySelector('text');
                if (textHolder && textHolder.dataset.baseColor) {
                    if (textHolder.tagName.toLowerCase() === 'div') {
                        textHolder.style.color = textHolder.dataset.baseColor;
                        textHolder.style.fontWeight = textHolder.dataset.baseFontWeight || 'normal';
                    } else {
                        textHolder.setAttribute('fill', textHolder.dataset.baseColor);
                        textHolder.setAttribute('font-weight', textHolder.dataset.baseFontWeight || 'normal');
                    }
                }
            }
        });

        // The actual adding of .node-highlight is done in readAndAnimateMindmap before typing.
        // The removal is also done there after speech.
        // This function (if still called) can ensure other nodes are not highlighted.
    }
    
    // 新增：模拟节点文字打字效果的函数
    async function animateTextTypingEffect(textElement, fullText, charDelay = 50) {
        if (!textElement) {
            console.warn('animateTextTypingEffect: textElement is null');
            return;
        }
        
        const characters = Array.from(fullText); 
        textElement.textContent = ''; 

        for (let i = 0; i < characters.length; i++) {
            if (shouldStopReading) {
                textElement.textContent = fullText; 
                break;
            }
            textElement.textContent += characters[i];
            await new Promise(resolve => setTimeout(resolve, charDelay));
        }
    }
    
    // 粘贴事件处理
    markdownInput.addEventListener('paste', function(e) {
        // 如果用户主动粘贴，阻止默认行为
        // e.preventDefault(); // Temporarily commented out to restore default paste
        
        // 获取粘贴的文本
        // const pastedText = (e.clipboardData || window.clipboardData).getData('text'); // Temporarily commented out
        
        // 根据用户选择决定使用哪种粘贴方式
        // if (typingEffectCheckbox.checked) { // Temporarily commented out
            // 使用模拟打字效果
            // simulateTyping(pastedText); // This function was not defined
        // } else { // Temporarily commented out
            // 直接粘贴文本
            // directPaste(pastedText); // This function was not defined
        // } // Temporarily commented out
    });
    
    // 逐步朗读并更新思维导图
    async function readAndAnimateMindmap(markdown) {
        // 如果正在读取，先停止
        if (isReading) {
            stopReading();
            // 等待一点时间确保语音停止
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 标记开始朗读
        isReading = true;
        currentReadingType = 'mindmap';
        shouldStopReading = false;
        
        // 获取语音设置
        const selectedVoice = voiceSelect.value;
        const speed = parseFloat(voiceSpeed.value);
        const volume = parseFloat(voiceVolume.value);

        // Reset deletion trackers at the start of a new full reading session
        idsOfNodesToDelete = [];
        pathStack = [];
        
        // =============== 新增：确保导图可见，并准备 Markdown 高亮辅助函数 ===============
        // 若用户此前隐藏了导图，在开始朗读时自动显示导图
        const mindmapSectionElem = document.querySelector('.mindmap-section');
        if (mindmapSectionElem && mindmapSectionElem.classList.contains('hidden-mindmap')) {
            mindmapSectionElem.classList.remove('hidden-mindmap');
            if (toggleMindmapBtn) {
                toggleMindmapBtn.textContent = '隐藏导图';
            }
        }

        // 计算平均行高，用于后续滚动定位
        const fullMarkdownText = markdownInput.value;
        const totalLinesCount = fullMarkdownText.split('\n').length;
        let avgLineHeight = 21; // 默认行高
        if (markdownInput.scrollHeight && totalLinesCount > 0) {
            avgLineHeight = markdownInput.scrollHeight / totalLinesCount;
        } else {
            const computedLineHeight = parseFloat(getComputedStyle(markdownInput).lineHeight);
            if (!isNaN(computedLineHeight)) {
                avgLineHeight = computedLineHeight;
            }
        }

        // 高亮并滚动到当前朗读行
        function highlightMarkdownInTextarea(textToHighlight, lineIndex = null, allLines = []) {
            if (!textToHighlight) return;
            
            let startIdx, endIdx;
            
            if (lineIndex !== null && allLines.length > 0) {
                // 使用行索引精确定位
                let currentPos = 0;
                for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i];
                    if (i === lineIndex) {
                        startIdx = currentPos;
                        endIdx = currentPos + line.length;
                        break;
                    }
                    currentPos += line.length + (i < allLines.length - 1 ? 1 : 0); // +1 for newline
                }
            } else {
                // 回退到旧的文本匹配方式
                startIdx = fullMarkdownText.indexOf(textToHighlight);
                if (startIdx === -1) return;
                endIdx = startIdx + textToHighlight.length;
            }

            if (startIdx === undefined || endIdx === undefined) return;

            // 设置选区
            markdownInput.focus();
            markdownInput.setSelectionRange(startIdx, endIdx);

            // 计算需要滚动的位置，使当前行大致居中
            const linesBefore = fullMarkdownText.slice(0, startIdx).split('\n').length - 1;
            const textareaHeight = markdownInput.clientHeight;
            const scrollPosition = Math.max(0, (linesBefore * avgLineHeight) - (textareaHeight / 2) + (avgLineHeight / 2));
            markdownInput.scrollTop = scrollPosition;
        }
        // ============= 新增代码结束 =============

        console.log('开始朗读，语音:', selectedVoice, '语速:', speed, '音量:', volume);
        
        // 更新按钮状态
        generateBtn.textContent = '停止朗读';
        generateBtn.classList.add('reading');

        let originalAutoFitOption = true; 
        let autoFitManuallyDisabled = false;
        
        try {
            // 构建逐步序列
            const sequence = buildProgressiveSequence(markdown);
            
            // 如果序列为空，直接返回
            if (sequence.length === 0) {
                alert('无法解析Markdown内容');
                return; 
            }
            
            console.log('生成了序列，总共', sequence.length, '个步骤');
            
            if (!markmapInstance) {
                createMarkmapElements(); 
                 if (!markmapInstance) { // Check again
                    console.error("Markmap instance could not be created in readAndAnimateMindmap.");
                    isReading = false; 
                    generateBtn.textContent = '朗读内容';
                    generateBtn.classList.remove('reading');
                    return;
                }
            }

            if (markmapInstance && markmapInstance.options) {
                originalAutoFitOption = markmapInstance.options.autoFit;
                if (originalAutoFitOption) { 
                    markmapInstance.setOptions({ autoFit: false });
                    autoFitManuallyDisabled = true;
                    console.log('Temporarily disabled autoFit for reading.');
                }
            }
            
            // 获取原始行列表用于精确定位
            const originalLines = markdown.split('\n').filter(line => line.trim());
            
            for (let i = 0; i < sequence.length; i++) {
                if (shouldStopReading) {
                    break;
                }
                
                const { markdown: currentMarkdown, currentLine } = sequence[i];
                console.log(`[朗读步骤 ${i+1}/${sequence.length}] 当前行:`, currentLine);
                
                // 更新 Markdown 文本框为当前已展示内容并高亮最后一行
                const displayMarkdown = convertHeadingToIndent(currentMarkdown);
                markdownInput.value = displayMarkdown;
                // 计算最后一行起始位置并设置选区
                const lastLineStartIdx = displayMarkdown.lastIndexOf('\n') + 1;
                markdownInput.focus();
                markdownInput.setSelectionRange(lastLineStartIdx, displayMarkdown.length);
                // 滚动到底部，确保当前行可见
                markdownInput.scrollTop = markdownInput.scrollHeight;

                let stepRootData = await updateMindmapData(currentMarkdown, currentLine);
                
                if (!stepRootData) {
                    console.error(`Skipping step ${i+1} due to no data from updateMindmapData for line: "${currentLine}"`);
                    continue;
                }

                let dataWasModifiedThisStep = false;

                // 2. Apply cumulative deletions to stepRootData
                if (idsOfNodesToDelete.length > 0) {
                    console.log('Applying cumulative deletions:', idsOfNodesToDelete);
                    for (const nodeIdToDelete of idsOfNodesToDelete) {
                        if (removeNodeById(stepRootData, nodeIdToDelete)) {
                            console.log(`Cumulatively removed node ${nodeIdToDelete} from stepRootData.`);
                            dataWasModifiedThisStep = true;
                        }
                    }
                }
                
                let textForCurrentNode = extractTextForReading(currentLine);
                
                // 敏感词过滤处理
                const enableSensitiveFilterCheckbox = document.getElementById('enable-sensitive-filter');
                const shouldFilter = enableSensitiveFilterCheckbox ? enableSensitiveFilterCheckbox.checked : true;
                
                let speechText = textForCurrentNode;
                let displayText = textForCurrentNode;
                
                if (shouldFilter) {
                    try {
                        // 对每个节点单独检测敏感词
                        const detectionResult = await detectSensitiveWords(textForCurrentNode);
                        if (detectionResult.hasSensitiveWords) {
                            console.log(`思维导图节点检测到敏感词: ${detectionResult.sensitiveWords.join(', ')}`);
                            
                            // 获取用户选择的过滤模式
                            const filterMode = getSensitiveFilterMode();
                            
                            if (filterMode === 'voice-only') {
                                // 仅语音消音：用停顿替代敏感词，文字显示保持完整
                                speechText = filterSensitiveWordsForSpeech(textForCurrentNode, detectionResult.sensitiveWords);
                                displayText = textForCurrentNode; // 文字显示保持原始内容
                            } else if (filterMode === 'both') {
                                // 文字和语音都拦截：文字显示过滤，语音也过滤
                                speechText = filterSensitiveWordsForSpeech(textForCurrentNode, detectionResult.sensitiveWords);
                                displayText = filterSensitiveWordsForDisplay(textForCurrentNode, detectionResult.sensitiveWords);
                            }
                            
                            // 更新思维导图节点的显示文本 - 使用原始文本查找节点
                            if ((filterMode === 'both' || filterMode === 'speech_only') && displayText !== textForCurrentNode) {
                                const originalText = textForCurrentNode;
                                const nodeToUpdate = findNodeByContent(stepRootData, originalText, i, originalLines);
                                if (nodeToUpdate) {
                                    nodeToUpdate.content = displayText;
                                    if (nodeToUpdate.payload) {
                                        nodeToUpdate.payload.content = displayText;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('思维导图敏感词检测失败:', error);
                        // 继续朗读原文，不中断流程
                    }
                }
                
                // 使用过滤后的文本进行朗读，但保留原始文本用于节点查找
                const originalTextForNode = textForCurrentNode;
                textForCurrentNode = speechText;
                
                const lang = detectLanguage(textForCurrentNode); // Detect language
                
                // 使用原始文本查找节点，避免过滤后无法匹配
                let currentNodeData = findNodeByContent(stepRootData, originalTextForNode, i, originalLines);

                // 3. 全新删除策略：只保留当前朗读层级及其祖先节点
                if (currentNodeData && typeof currentNodeData.depth === 'number') {
                    pruneTreeToCurrentLevel(stepRootData, currentNodeData);
                    dataWasModifiedThisStep = true;
                }
                
                // 4. Render the map with all deletions applied for this step
                console.log('Setting data to markmap instance. Data modified this step:', dataWasModifiedThisStep);
                markmapInstance.setData(stepRootData);
                
                const renderDelay = 700; 
                console.log(`readAndAnimateMindmap: Waiting ${renderDelay}ms for Markmap to render after setData...`);
                await new Promise(resolve => setTimeout(resolve, renderDelay)); 
                console.log('readAndAnimateMindmap: Render delay finished.');
                
                // 5. Find SVG element and proceed with animation/speech
                // Re-find the gMarkmapNodeElement based on the (potentially modified and re-rendered) SVG
                // 使用原始文本查找SVG节点，避免过滤后无法匹配
                let gMarkmapNodeElement = findGMarkmapNodeByContent(originalTextForNode, svgElement, i, originalLines);
                    
                    if (gMarkmapNodeElement) {
                        const d3NodeForCenter = d3.select(gMarkmapNodeElement).datum();
                        if (d3NodeForCenter && typeof d3NodeForCenter.depth === 'number' && d3NodeForCenter.data && d3NodeForCenter.data.id) {
                            currentReadingNode = gMarkmapNodeElement; 

                        // Collapse logic for *previous* second level node (if any) is now replaced by deletion.
                        // The old collapse logic using lastReadSecondLevelSvgElement is removed.

                            await centerNodeElement(d3NodeForCenter);

                        let textHolderElement = gMarkmapNodeElement.querySelector('foreignObject div');
                        if (!textHolderElement) {
                            textHolderElement = gMarkmapNodeElement.querySelector('text');
                        }

                        if (textHolderElement) {
                            const fullTextForAnimation = textHolderElement.textContent || '';

                            const circleElement = gMarkmapNodeElement.querySelector('circle');
                            let nodeSpecificColor = '#F0F0F0'; 
                            if (circleElement && circleElement.getAttribute('fill')) {
                                nodeSpecificColor = circleElement.getAttribute('fill');
                            }
                            
                            if (textHolderElement.tagName.toLowerCase() === 'div') {
                                textHolderElement.style.color = nodeSpecificColor;
                                textHolderElement.style.fontWeight = 'normal';
                        } else {
                                textHolderElement.setAttribute('fill', nodeSpecificColor);
                                textHolderElement.setAttribute('font-weight', 'normal');
                            }
                            textHolderElement.dataset.baseColor = nodeSpecificColor;
                            textHolderElement.dataset.baseFontWeight = 'normal';
                            
                            gMarkmapNodeElement.classList.add('node-highlight');
                            
                            // 根据语言和文本长度调整打字速度，使其与语音同步
                            let charDelay = 100; // Default delay
                            const textLength = fullTextForAnimation.length;
                            
                            if (lang === 'en') {
                                // 英文打字速度：根据文本长度动态调整
                                charDelay = Math.max(20, Math.min(80, textLength * 3));
                            } else if (lang === 'zh') {
                                // 中文打字速度：根据文本长度动态调整
                                charDelay = Math.max(50, Math.min(200, textLength * 8));
                            }
                            
                                                        // 同步开始朗读和打字机效果
                            if (typingEffectCheckbox.checked) {
                                // 同时开始朗读和打字机动画
                                const speechPromise = speakWithWebSpeechAPI(textForCurrentNode, speed, volume, lang, true);
                                const typingPromise = animateTextTypingEffect(textHolderElement, fullTextForAnimation, charDelay);
                                
                                // 等待两个动画都完成
                                try {
                            await Promise.all([speechPromise, typingPromise]);
                        } catch (speechError) {
                            console.error("语音合成失败，跳过当前节点:", speechError);
                            // 继续下一个节点，不中断整个流程
                        }
                    } else {
                                textHolderElement.textContent = fullTextForAnimation;
                                // 没有打字效果时，直接朗读
                                if (!shouldStopReading) {
                            console.log(`Speaking: "${textForCurrentNode}", Language: ${lang}`);
                            try {
                                await speakWithWebSpeechAPI(textForCurrentNode, speed, volume, lang, true);
                            } catch (speechError) {
                                console.error("语音合成失败，跳过当前节点:", speechError);
                                // 继续下一个节点，不中断整个流程
                            }
                        }
                            }
                    
                        } else {
                            console.warn('readAndAnimateMindmap: Could not find text holder element.');
                            // 即使没有找到文本元素，也要朗读
                    if (!shouldStopReading) {
                                console.log(`Speaking (fallback): "${textForCurrentNode}", Language: ${lang}`);
                                try {
                                    await speakWithWebSpeechAPI(textForCurrentNode, speed, volume, lang, true);
                                } catch (speechError) {
                                    console.error("语音合成失败，跳过当前节点:", speechError);
                                    // 继续下一个节点，不中断整个流程
                                }
                            }
                        }

                        if (gMarkmapNodeElement) { 
                            gMarkmapNodeElement.classList.remove('node-highlight');
                            if (textHolderElement && textHolderElement.dataset.baseColor) {
                                 if (textHolderElement.tagName.toLowerCase() === 'div') {
                                    textHolderElement.style.color = textHolderElement.dataset.baseColor;
                                    textHolderElement.style.fontWeight = textHolderElement.dataset.baseFontWeight;
                                } else { 
                                    textHolderElement.setAttribute('fill', textHolderElement.dataset.baseColor);
                                    textHolderElement.setAttribute('font-weight', textHolderElement.dataset.baseFontWeight);
                                }
                            }
                        }

                                        } else {
                        console.warn('readAndAnimateMindmap: FAILED to find g.markmap-node for content:', originalTextForNode, '. Centering/animation will be skipped.');
                        currentReadingNode = null;
                         // Fallback: just speak if node not found for animation
                    if (!shouldStopReading) {
                        console.log(`Speaking (fallback, node not found for animation): "${textForCurrentNode}", Language: ${lang}`);
                        try {
                             await speakWithWebSpeechAPI(textForCurrentNode, speed, volume, lang, true);
                        } catch (speechError) {
                            console.error("语音合成失败，跳过当前节点:", speechError);
                            // 继续下一个节点，不中断整个流程
                        }
                    }
                    }
                } else {
                    console.warn('readAndAnimateMindmap: FAILED to find g.markmap-node for content:', originalTextForNode, '. Centering/animation will be skipped.');
                    currentReadingNode = null;
                    // Fallback: just speak if node not found for animation
                    if (!shouldStopReading) { 
                        console.log(`Speaking (fallback, node not found for animation): "${textForCurrentNode}", Language: ${lang}`);
                        try {
                             await speakWithWebSpeechAPI(textForCurrentNode, speed, volume, lang, true);
                        } catch (speechError) {
                            console.error("speakWithWebSpeechAPI (fallback) failed:", speechError);
                        }
                    }
                }
                
                if (!shouldStopReading) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } catch (error) {
            console.error('朗读过程中出错:', error);
        } finally {
            // 在 MEM 模式下：若本段未由 API 分支发送过 ack，则在朗读完本段后发送 ack，驱动左侧推进到下一段
            try{ if(isInMemMode()){ parent.postMessage({ type:'mem-ack' }, '*'); } }catch(_e){}
            if (markmapInstance && autoFitManuallyDisabled) {
                markmapInstance.setOptions({ autoFit: originalAutoFitOption });
                console.log('Restored autoFit to:', originalAutoFitOption);
            }
            generateBtn.textContent = '朗读内容';
            generateBtn.classList.remove('reading');
            isReading = false;
            shouldStopReading = false; 
            currentReadingNode = null;
            // idOfLastReadSecondLevelNode = null; // Reset at the start of the function now
            // idsOfSecondLevelNodesToDelete = []; // Reset at the start of the function now
        }
    }
    
    // 根据文本内容和位置信息查找文本元素 (used to find SVG g.markmap-node)
    function findGMarkmapNodeByContent(text, svgRoot, lineIndex = null, allLines = []) {
        if (!svgRoot) {
            console.error('findGMarkmapNodeByContent: SVG元素不存在');
            return null;
        }
        
        // 如果没有提供行索引，使用旧的文本匹配方式
        if (lineIndex === null) {
            const normalizedText = text.trim().toLowerCase();
            const textContainers = Array.from(svgRoot.querySelectorAll('foreignObject div, g.markmap-node > text'));
            
            let lastGNode = null;
            for (const containerEl of textContainers) {
                const content = containerEl.textContent.trim().toLowerCase();
                if (content === normalizedText) {
                    const gNode = containerEl.closest('g.markmap-node');
                    if (gNode) {
                        lastGNode = gNode;
                    }
                }
            }
            return lastGNode;
        }

        // 获取当前行的层级
        function getLevel(line) {
            line = line.trim();
            if (line.startsWith('#')) {
                return line.match(/^#+/)[0].length;
            } else if (line.startsWith('-') || line.startsWith('*')) {
                const indent = line.match(/^\s*/)[0].length;
                return Math.floor(indent / 2) + 1;
            }
            return 1;
        }

        // 构建节点到其在原始行中的位置的映射
        const normalizedText = text.trim().toLowerCase();
        const textContainers = Array.from(svgRoot.querySelectorAll('foreignObject div, g.markmap-node > text'));
        
        // 创建所有匹配节点的列表，按DOM顺序排列
        const allNodes = [];
        for (const containerEl of textContainers) {
            const content = containerEl.textContent.trim().toLowerCase();
            const gNode = containerEl.closest('g.markmap-node');
            if (gNode && content === normalizedText) {
                allNodes.push(gNode);
            }
        }

        // 根据行索引直接选择对应的节点
        if (allNodes.length > 0 && lineIndex < allLines.length) {
            // 计算当前行在所有行中的绝对位置序号
            let nodeIndex = 0;
            let currentLevel = getLevel(allLines[lineIndex]);
            
            // 计算到当前行为止，有多少个相同层级的节点
            let targetPosition = 0;
            for (let i = 0; i <= lineIndex; i++) {
                if (getLevel(allLines[i]) === currentLevel) {
                    if (i === lineIndex) {
                        targetPosition = targetPosition;
                        break;
                    }
                    targetPosition++;
                }
            }
            
            // 使用绝对位置选择节点
            if (targetPosition < allNodes.length) {
                return allNodes[targetPosition];
            }
        }

        return allNodes.length > 0 ? allNodes[0] : null;
    }

    // Helper function to find a node in the data structure by its content and path
    function findNodeByContent(currentNode, text, lineIndex = null, allLines = []) {
        if (!currentNode) return null;

        // 如果没有提供行索引，使用旧的文本匹配方式
        if (lineIndex === null) {
            let lastMatch = null;
            function traverse(node) {
                if (!node) return;
                if (node.children) {
                    for (const child of node.children) {
                        traverse(child);
                    }
                }
                const normalizedTextLocal = (typeof text === 'string' ? text : String(text)).trim().toLowerCase();
                const nodeContent = (node.content || '').trim().toLowerCase();
                if (nodeContent === normalizedTextLocal) {
                    lastMatch = node;
                }
            }
            traverse(currentNode);
            return lastMatch;
        }

        // 获取当前行的层级
        function getLevel(line) {
            line = line.trim();
            if (line.startsWith('#')) {
                return line.match(/^#+/)[0].length;
            } else if (line.startsWith('-') || line.startsWith('*')) {
                const indent = line.match(/^\s*/)[0].length;
                return Math.floor(indent / 2) + 1; // 每2个空格一个层级
            }
            return 1;
        }

        // 收集所有节点并按DOM遍历顺序排列
        const allNodes = [];
        function collectAllNodes(node, level = 0) {
            if (!node) return;
            
            const normalizedTextLocal = (typeof text === 'string' ? text : String(text)).trim().toLowerCase();
            const nodeContent = (node.content || '').trim().toLowerCase();
            
            if (nodeContent === normalizedTextLocal) {
                allNodes.push({
                    node: node,
                    level: level
                });
            }

            if (node.children) {
                for (const child of node.children) {
                    collectAllNodes(child, level + 1);
                }
            }
        }

        collectAllNodes(currentNode);

        // 根据行索引精确定位节点
        if (allNodes.length > 0 && lineIndex < allLines.length) {
            const currentLevel = getLevel(allLines[lineIndex]);
            
            // 计算当前行在所有行中的绝对位置序号
            let targetPosition = 0;
            for (let i = 0; i <= lineIndex; i++) {
                if (getLevel(allLines[i]) === currentLevel) {
                    if (i === lineIndex) {
                        break;
                    }
                    targetPosition++;
                }
            }
            
            // 找到对应层级的第targetPosition个节点
            let levelNodes = allNodes.filter(item => item.level === currentLevel - 1);
            if (targetPosition < levelNodes.length) {
                return levelNodes[targetPosition].node;
            }
        }

        return allNodes.length > 0 ? allNodes[0].node : null;
    }

    // Helper function to remove a node by its ID from the data structure
    function removeNodeById(currentNode, targetId) {
        if (!currentNode || !currentNode.children || !targetId) {
            return false; 
        }

        for (let i = 0; i < currentNode.children.length; i++) {
            const child = currentNode.children[i];
            if (child.id === targetId || (child.payload && child.payload.id === targetId)) {
                currentNode.children.splice(i, 1); 
                console.log(`Node with ID ${targetId} removed from parent ${currentNode.id || currentNode.content}.`);
                return true; 
            }
            if (removeNodeById(child, targetId)) {
                return true; 
            }
        }
        return false; 
    }
    
    // =======================
    // 新删除策略辅助函数
    // =======================
    /**
     * 仅保留当前朗读节点及其所有祖先节点，删除其余分支。
     * 这样可以自动适配任意层级，确保导图中只展示与当前朗读内容相关的路径。 
     * @param {Object} rootNode - Markmap 数据根节点（会被原地修改）
     * @param {Object} currentNodeData - 当前朗读节点的数据对象（需包含 id、depth）
     */
    function pruneTreeToCurrentLevel(rootNode, currentNodeData) {
        if (!rootNode || !currentNodeData || typeof currentNodeData.depth !== 'number' || !currentNodeData.id) {
            console.warn('pruneTreeToCurrentLevel: 参数非法或缺失，跳过裁剪。', {
                rootNode, currentNodeData
            });
            return;
        }

        // 完全移除层级限制，保留所有节点
        // 这个函数现在只是空操作，不再裁剪任何节点
        console.log('pruneTreeToCurrentLevel: 保留所有层级的节点，不再进行裁剪');
        return;
    }
    
    // 朗读按钮点击事件
    generateBtn.addEventListener('click', function() {
        if (isReading) {
            stopReading();
            return;
        }
        // Set reading state for mindmap
        isReading = true;
        currentReadingType = 'mindmap';
        readMarkdownBtn.disabled = true; // Disable other read button
        
        const markdown = markdownInput.value.trim();
        
        if (!markdown) {
            alert('请输入Markdown文本');
            return;
        }
        
        // 开始朗读并动画展示；若在 MEM 模式，确保从 API 路径触发 ack
        try{ window.__mem_ack_by_api_sent = false; }catch(_e){}
        readAndAnimateMindmap(markdown);
    });
    
    // 复制Markdown按钮点击事件
    copyBtn.addEventListener('click', function() {
        markdownInput.select();
        document.execCommand('copy');
        
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    });
    
    // 清空按钮点击事件
    clearBtn.addEventListener('click', function() {
        markdownInput.value = '';
        markdownInput.focus();
        // 清空思维导图
        updateMindmapData(' '); // This will eventually call setData in readAndAnimate or directly if not reading
    });
    
    // Toggle Mindmap Button Logic - 更新为新的布局
    if (toggleMindmapBtn) {
        const mindmapSection = document.querySelector('.mindmap-section');
        toggleMindmapBtn.addEventListener('click', function() {
            if (mindmapSection) {
                const isHidden = mindmapSection.classList.toggle('hidden-mindmap');
                toggleMindmapBtn.textContent = isHidden ? '显示导图' : '隐藏导图';
                localStorage.setItem('mindmapHidden', isHidden ? 'true' : 'false');
            }
        });
    }

    // Read Markdown Button Logic
    if (readMarkdownBtn) {
        readMarkdownBtn.addEventListener('click', async function() {
            if (isReading) {
                stopReading();
                return;
            }

            const markdownText = markdownInput.value;
            if (!markdownText.trim()) {
                alert('Markdown输入框为空。');
                return;
            }
            // Set reading state for markdown
            isReading = true;
            currentReadingType = 'markdown';
            shouldStopReading = false;
            readMarkdownBtn.textContent = '停止朗读';
            readMarkdownBtn.classList.add('reading');
            generateBtn.disabled = true; // Disable other read button

            const lines = markdownText.split('\n');
            const speed = parseFloat(voiceSpeed.value);
            const volume = parseFloat(voiceVolume.value);

            // Pre-calculate line start positions for selection and scrolling
            const lineStartPositions = [0];
            for (let k = 0; k < lines.length - 1; k++) {
                lineStartPositions.push(lineStartPositions[k] + lines[k].length + 1); // +1 for newline char
            }
            
            // Calculate average line height for more accurate scrolling
            let averageLineHeight = 21; // Default fallback
            if (markdownInput.scrollHeight && lines.length > 0) {
                averageLineHeight = markdownInput.scrollHeight / lines.length;
            } else {
                // Fallback to getComputedStyle or estimate if scrollHeight is not reliable yet
                const computedLineHeight = parseFloat(getComputedStyle(markdownInput).lineHeight);
                if (!isNaN(computedLineHeight)) {
                    averageLineHeight = computedLineHeight;
                }
            }
            console.log("Average Line Height for scrolling:", averageLineHeight);

            try {
                for (let k = 0; k < lines.length; k++) { // Changed loop variable to k
                    if (shouldStopReading) break;
                    const line = lines[k]; // Current line text
                    const textToRead = line.trim(); 
                    
                    if (textToRead) {
                        const currentLineNumber = k;
                        const lineStart = lineStartPositions[currentLineNumber];
                        const lineEnd = lineStart + (lines[currentLineNumber] ? lines[currentLineNumber].length : 0); // Ensure lines[currentLineNumber] exists
                        
                        markdownInput.focus();
                        markdownInput.setSelectionRange(lineStart, lineEnd);

                        // Scroll into view (center-ish) using calculated average line height
                        const textareaHeight = markdownInput.clientHeight;
                        const scrollTo = Math.max(0, (currentLineNumber * averageLineHeight) - (textareaHeight / 2) + (averageLineHeight / 2));                        
                        markdownInput.scrollTop = scrollTo;

                        const lang = detectLanguage(textToRead);
                        console.log(`朗读Markdown行: "${textToRead}", 语言: ${lang}`);
                        try {
                            await speakWithWebSpeechAPI(textToRead, speed, volume, lang, false); // 固定朗读内容不启用敏感词过滤
                        } catch (speechError) {
                            console.error("语音合成失败，跳过当前行:", speechError);
                            // 继续下一行，不中断整个流程
                        }
                        
                        if (shouldStopReading) break; 
                        if (!shouldStopReading) { 
                            await new Promise(resolve => setTimeout(resolve, 200)); 
                        }
                    }
                }
            } catch (error) {
                console.error("朗读Markdown原文时出错:", error);
            } finally {
                // stopReading() handles resetting button text and state if user clicked stop.
                // If loop finished naturally, reset state here.
                if (!shouldStopReading) {
                    stopReading(); // Call stopReading to ensure consistent state reset
                } 
                // Ensure generateBtn is re-enabled if it was disabled by this function
                generateBtn.disabled = false;
                // 在 MEM 模式下：无论朗读是否成功，均发送 ack 以推动下一分段
                try{ if(isInMemMode()){ try{ window.postMessage({ type:'mem-ack' }, '*'); }catch(_e){}; try{ if(parent && parent!==window){ parent.postMessage({ type:'mem-ack' }, '*'); } }catch(_e){} } }catch(_e){}
            }
        });
    }
    
    // 初始化思维导图（默认示例）
    createMarkmapElements();
    updateMindmapData(defaultMarkdown).catch(error => {
        console.error('初始化思维导图失败:', error);
    });
    
    // 实时更新思维导图（带防抖）
    const debouncedUpdateMindmap = debounce((markdown) => {
        if (markdown.trim()) {
            updateMindmapData(markdown).catch(error => {
                console.error('更新思维导图失败:', error);
            });
        }
    }, 300);
    
    // 输入框内容变化时更新思维导图
    markdownInput.addEventListener('input', function() {
        debouncedUpdateMindmap(this.value);
    });
    
    // 保存用户设置到本地存储
    function saveUserSettings() {
        try {
            const settings = {
                typingEffect: typingEffectCheckbox.checked,
                voiceSpeed: voiceSpeed.value,
                voiceVolume: voiceVolume.value,
                voiceName: voiceSelect.value,
                chineseVoice: voiceSelect.dataset.chineseVoice || '',
                englishVoice: voiceSelect.dataset.englishVoice || ''
            };
            
            localStorage.setItem('mindmapSettings', JSON.stringify(settings));
            console.log('用户设置已保存:', settings);
        } catch (error) {
            console.error('保存用户设置时出错:', error);
        }
    }

    // 保存朗读进度
    function saveReadingProgress(fileName, progress) {
        try {
            const progressData = {
                fileName: fileName,
                progress: progress,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('readingProgress', JSON.stringify(progressData));
            console.log('朗读进度已保存:', progressData);
        } catch (error) {
            console.error('保存朗读进度时出错:', error);
        }
    }

    // 加载朗读进度
    function loadReadingProgress() {
        try {
            const progressJson = localStorage.getItem('readingProgress');
            if (progressJson) {
                const progress = JSON.parse(progressJson);
                console.log('从本地存储加载的朗读进度:', progress);
                return progress;
            }
            return null;
        } catch (error) {
            console.error('加载朗读进度时出错:', error);
            return null;
        }
    }

    // 清除朗读进度
    function clearReadingProgress() {
        try {
            localStorage.removeItem('readingProgress');
            console.log('朗读进度已清除');
        } catch (error) {
            console.error('清除朗读进度时出错:', error);
        }
    }
    
    // 从本地存储加载用户设置
    function loadUserSettings() {
        try {
            const settingsJson = localStorage.getItem('mindmapSettings');
            
            if (settingsJson) {
                const settings = JSON.parse(settingsJson);
                console.log('从本地存储加载的设置:', settings);
                
                // 恢复打字效果设置
                if (settings.typingEffect !== undefined) {
                    typingEffectCheckbox.checked = settings.typingEffect;
                }
                
                // 恢复语音设置
                if (settings.voiceSpeed !== undefined) {
                    voiceSpeed.value = settings.voiceSpeed;
                    speedValue.textContent = parseFloat(settings.voiceSpeed).toFixed(1);
                }
                
                if (settings.voiceVolume !== undefined) {
                    voiceVolume.value = settings.voiceVolume;
                    volumeValue.textContent = parseFloat(settings.voiceVolume).toFixed(1);
                }

                // 强制使用曉臻语音，不加载用户之前保存的语音设置
                loadedPreferredVoiceName = null; // 忽略用户保存的语音
                
                // 强制设置中文语音为曉臻
                voiceSelect.dataset.chineseVoice = 'Microsoft 曉臻 Online (Natural) - Chinese (Taiwanese Mandarin, Traditional) (zh-TW)';
                
                console.log('已从本地存储加载用户设置（语音设置已强制为曉臻）');
                
                // 恢复思维导图显示状态
                const mindmapSection = document.querySelector('.mindmap-section');
                if (mindmapSection && toggleMindmapBtn && localStorage.getItem('mindmapHidden') === 'true') {
                    mindmapSection.classList.add('hidden-mindmap');
                    toggleMindmapBtn.textContent = '显示导图';
                }
            }
        } catch (error) {
            console.error('加载用户设置时出错:', error);
        }
    }

    // 绑定设置变化事件
    typingEffectCheckbox.addEventListener('change', saveUserSettings);

    // 将 "# 标题" 转换为空格缩进形式（不带#，每级两空格）
    function convertHeadingToIndent(md) {
        if (!md) return '';
        const lines = md.split('\n');
        return lines.map(line => {
            // 匹配任意级别标题
            const match = line.match(/^(#{1,})\s+(.*)$/);
            if (match) {
                const level = match[1].length;
                const content = match[2];
                return '  '.repeat(level - 1) + content; // 一级标题无缩进，二级开始缩进
            }
            return line;
        }).join('\n');
    }
    
    // 下载功能
    let processedResults = []; // 存储所有处理结果
    let visionResults = []; // 存储原始视觉识别结果
    let currentFileIndex = 0; // 当前文件索引
    
    // 下载单个结果
    function downloadSingleResult() {
        const markdownContent = markdownInput.value.trim();
        if (!markdownContent) {
            alert('没有内容可以下载！');
            return;
        }
        
        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `思维导图_${new Date().getTime()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 合并下载所有结果
    function downloadAllResults() {
        if (processedResults.length === 0) {
            // 如果没有处理结果，下载当前内容
            downloadSingleResult();
            return;
        }
        
        let combinedContent = '# 批量处理思维导图结果\n\n';
        combinedContent += `生成时间：${new Date().toLocaleString()}\n\n`;
        combinedContent += '---\n\n';
        
        processedResults.forEach((result, index) => {
            combinedContent += `## 文件 ${index + 1}: ${result.fileName || '未知文件'}\n\n`;
            combinedContent += result.content || result;
            combinedContent += '\n\n---\n\n';
        });
        
        const blob = new Blob([combinedContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `批量思维导图_${new Date().getTime()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 合并下载原始视觉识别内容
    function downloadAllVisionResults() {
        if (visionResults.length === 0) {
            alert('没有原始视觉识别内容可以下载！');
            return;
        }
        
        let combinedContent = '# 批量原始视觉识别内容\n\n';
        combinedContent += `生成时间：${new Date().toLocaleString()}\n\n`;
        combinedContent += '---\n\n';
        
        visionResults.forEach((result, index) => {
            combinedContent += `## 文件 ${index + 1}: ${result.fileName || '未知文件'}\n\n`;
            combinedContent += '### 原始视觉识别内容：\n\n';
            combinedContent += result.visionContent || result.content || '无内容';
            combinedContent += '\n\n---\n\n';
        });
        
        const blob = new Blob([combinedContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `原始视觉识别内容_${new Date().getTime()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 添加处理结果到列表
    function addProcessedResult(fileName, content) {
        processedResults.push({
            fileName: fileName,
            content: content,
            timestamp: new Date().toISOString()
        });
        
        // 每处理5个文件自动下载一次
        if (processedResults.length % 5 === 0) {
            console.log(`已处理 ${processedResults.length} 个文件，自动下载合并结果`);
            // 不自动下载，等待用户点击合并下载按钮
        }
    }
    
    // 绑定下载按钮事件
    downloadBtn.addEventListener('click', downloadSingleResult);
    downloadAllBtn.addEventListener('click', downloadAllResults);
    
    // 新增：原始视觉识别内容下载
    const downloadVisionBtn = document.getElementById('download-vision-btn');
    if (downloadVisionBtn) {
        downloadVisionBtn.addEventListener('click', downloadAllVisionResults);
    }
    
    // 扩展文件夹处理完成回调，添加结果到列表
    const originalHandleFolderProcessingComplete = window.handleFolderProcessingComplete;
    window.handleFolderProcessingComplete = async function(markdownContent, fileName = '未知文件', visionContent = '') {
        console.log('文件夹处理完成，添加结果到下载列表');
        
        // 清理markdown内容，移除```markdown和```标记
        const cleanedContent = markdownContent
            .replace(/```markdown\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        // 添加到处理结果
        addProcessedResult(fileName || '未知文件', cleanedContent);
        
        // 存储原始视觉识别内容
        if (visionContent) {
            visionResults.push({
                fileName: fileName || '未知文件',
                content: visionContent,
                timestamp: new Date().toISOString()
            });
            console.log(`已存储原始视觉识别内容: ${fileName}`);
        }
        
        // 调用原始的处理函数
        if (originalHandleFolderProcessingComplete) {
            return originalHandleFolderProcessingComplete.call(this, cleanedContent, fileName);
        }
    };
    
    // 清除所有处理结果
    function clearProcessedResults() {
        processedResults = [];
        currentFileIndex = 0;
        console.log('已清除所有处理结果');
    }
    
    // 导出清除结果的函数供其他模块使用
    window.clearProcessedResults = clearProcessedResults;
    window.addProcessedResult = addProcessedResult;

});