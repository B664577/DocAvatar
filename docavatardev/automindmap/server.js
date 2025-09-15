import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { Server } from 'socket.io';
import http from 'http';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import say from 'say';
import multer from 'multer';
import pdf from 'pdf-parse';
import fs from 'fs';
import puppeteer from 'puppeteer';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DEFAULT_PORT = process.env.PORT || 9301;
const host = process.env.HOST || '127.0.0.1';
const dataDir = join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
}

// 检测端口是否可用
function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(startPort, host, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                findAvailablePort(startPort + 1).then(resolve).catch(reject);
            } else {
                reject(err);
            }
        });
    });
}

// 提供静态文件
app.use(express.static(join(__dirname)));
app.use('/pdfjs-dist', express.static(join(__dirname, 'node_modules/pdfjs-dist/build'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// 设置支持JSON请求体
app.use(express.json({ limit: '10mb' }));

// 全局 CORS 允许：解决转发端口(7860→随机端口)跨源保存/加载失败
app.use((req, res, next) => {
  try{
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
  }catch(e){}
  next();
});

// 配置multer用于文件上传
const upload = multer({ dest: 'uploads/' });

// PDF文本提取端点
app.post('/extract-pdf-text', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdf(dataBuffer);
        fs.unlinkSync(req.file.path); // 删除临时文件
        res.json({ text: data.text });
    } catch (error) {
        console.error('PDF extraction error:', error);
        res.status(500).json({ error: 'Failed to extract text' });
    }
});

// 代理端点，用于获取网页内容
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }
    
    // 验证URL格式
    let validUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
    }
    
    try {
        new URL(validUrl);
    } catch (error) {
        return res.status(400).send('Invalid URL format');
    }
    
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
        const page = await browser.newPage();
        
        // 设置更真实的浏览器环境
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Referer': 'https://www.google.com/'
        });
        
        // 启用JavaScript和Cookie
        await page.setJavaScriptEnabled(true);
        
        // 设置视口大小
        await page.setViewport({
            width: 1920,
            height: 1080
        });
        
        console.log(`正在代理访问: ${validUrl}`);
        
        // 导航到URL并等待网络空闲
        await page.goto(validUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // 获取页面内容
        const content = await page.content();
        
        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        
        // 修改响应内容，处理字体和资源路径
        const modifiedContent = content
            .replace(/(url\(['"]?)(https?:\/\/[^)]+)(['"]?\))/g, (match, prefix, url, suffix) => 
                `${prefix}/proxy?url=${encodeURIComponent(url)}${suffix}`)
            .replace(/(src=['"])(https?:\/\/[^'"]+)(['"])/g, (match, prefix, url, suffix) => 
                `${prefix}/proxy?url=${encodeURIComponent(url)}${suffix}`)
            .replace(/(href=['"])(https?:\/\/[^'"]+)(['"])/g, (match, prefix, url, suffix) => 
                `${prefix}/proxy?url=${encodeURIComponent(url)}${suffix}`);
        
        res.send(modifiedContent);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send(`Error fetching the URL: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// 截图端点
app.get('/screenshot', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    let browser = null;
    try {
        browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const imageBuffer = await page.screenshot({ fullPage: true });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).send(`Failed to take screenshot: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// 获取系统可用的语音列表
function getWindowsVoices() {
    try {
        // 非 Windows 平台（如 Linux/WSL/Mac）直接跳过，避免 PowerShell 报错干扰
        if (process.platform !== 'win32') {
            return [];
        }
        // 使用PowerShell获取Windows系统中的语音列表
        const command = 'powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Select-Object Name, Culture, Gender | ConvertTo-Json"';
        
        const output = execSync(command, { encoding: 'utf8' });
        let voices = JSON.parse(output);
        
        // 如果只有一个语音，确保它是数组
        if (!Array.isArray(voices)) {
            voices = [voices];
        }
        
        console.log('系统语音列表:', voices);
        return voices;
    } catch (error) {
        console.error('获取系统语音失败:', error);
        return [];
    }
}

// 使用say库或直接PowerShell朗读文本
async function speakText(text, voice, rate, volume) {
    return new Promise((resolve, reject) => {
        try {
            const adjustedRate = rate * 10; // 转换为PowerShell中适用的速率范围
            
            if (voice) {
                console.log(`使用语音 ${voice} 朗读文本: ${text}`);
                say.speak(text, voice, adjustedRate, (err) => {
                    if (err) {
                        console.error('使用say库朗读失败，尝试PowerShell:', err);
                        
                        // 尝试使用PowerShell
                        const command = `powershell -Command "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SelectVoice('${voice}'); $synth.Rate = ${adjustedRate - 5}; $synth.Volume = ${volume * 100}; $synth.Speak('${text.replace(/'/g, "''")}'); $synth.Dispose()"`;
                        
                        exec(command, (err) => {
                            if (err) {
                                console.error('PowerShell朗读失败:', err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            } else {
                // 使用默认语音
                say.speak(text, null, adjustedRate, (err) => {
                    if (err) {
                        console.error('使用默认语音朗读失败:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        } catch (error) {
            console.error('朗读过程中出错:', error);
            reject(error);
        }
    });
}

// 停止当前朗读
function stopSpeech() {
    try {
        say.stop();
    } catch (error) {
        console.error('停止朗读出错:', error);
    }
}

// Socket.io连接处理
io.on('connection', (socket) => {
    console.log('客户端已连接:', socket.id);
    
    // 获取系统语音列表
    socket.on('getVoices', () => {
        const voices = getWindowsVoices();
        socket.emit('voicesList', voices);
    });
    
    // 朗读文本
    socket.on('speak', async (data) => {
        const { text, voice, rate, volume } = data;
        
        try {
            await speakText(text, voice, rate, volume);
            socket.emit('speakComplete');
        } catch (error) {
            console.error('朗读出错:', error);
            socket.emit('speakError', { error: error.message });
        }
    });
    
    // 停止朗读
    socket.on('stopSpeaking', () => {
        stopSpeech();
        socket.emit('speakingStopped');
    });
    
    // 断开连接
    socket.on('disconnect', () => {
        console.log('客户端已断开连接:', socket.id);
    });
});

// Kimi API代理端点
app.post('/api/kimi', async (req, res) => {
    try {
        const { model, messages, max_tokens } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: '缺少消息数据' });
        }

        // 检查请求大小
        const requestSize = JSON.stringify(req.body).length;
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (requestSize > maxSize) {
            return res.status(413).json({ 
                error: '请求数据过大，请压缩内容后重试' 
            });
        }

        // 调用Kimi API
        const response = await axios.post('https://api.moonshot.cn/v1/chat/completions', {
            model: model || 'kimi-k2-0711-preview',
            messages: messages,
            max_tokens: max_tokens || 2000,
            temperature: 0.6
        }, {
            headers: {
                'Authorization': `Bearer ${req.headers.authorization?.replace('Bearer ', '') || ''}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000 // 增加超时时间
        });

        // 提取响应内容
        const content = response.data.choices[0]?.message?.content || '';
        res.json({
            choices: [{
                message: {
                    content: content
                }
            }],
            usage: response.data.usage
        });

    } catch (error) {
        console.error('Kimi API调用失败:', error.response?.data || error.message);
        
        if (error.response?.status === 413) {
            return res.status(413).json({ 
                error: '请求数据过大，请压缩内容后重试' 
            });
        }
        
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'Kimi API调用失败'
        });
    }
});

// StepFun API代理端点
app.post('/api/step-v8', async (req, res) => {
    try {
        const { model, image, system, prompt } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: '缺少图片数据' });
        }

        // 检查图片大小（限制为5MB）
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const sizeInMB = buffer.length / (1024 * 1024);
        
        if (sizeInMB > 5) {
            return res.status(413).json({ 
                error: `图片大小(${sizeInMB.toFixed(2)}MB)超过限制(5MB)` 
            });
        }

        // 调用StepFun API
        const response = await axios.post('https://api.stepfun.com/v1/chat/completions', {
            model: model || 'step-1o-turbo-vision',
            messages: [
                {
                    role: 'system',
                    content: system || '你是一位专业的视觉内容分析专家，请详细分析图片内容并用中文回答。'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt || '请详细分析这张图片的内容'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 2000,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${req.headers.authorization?.replace('Bearer ', '') || ''}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // 提取响应内容
        const content = response.data.choices[0]?.message?.content || '';
        res.json({
            text: content,
            markdown: content,
            usage: response.data.usage
        });

    } catch (error) {
        console.error('StepFun API调用失败:', error.response?.data || error.message);
        
        if (error.response?.status === 413) {
            return res.status(413).json({ 
                error: '请求数据过大，请压缩图片后重试' 
            });
        }
        
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'API调用失败'
        });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    try{
      const addr = server.address();
      const p = (addr && addr.port) ? addr.port : null;
      res.status(200).json({ 
          status: 'OK', 
          timestamp: new Date().toISOString(),
          port: p,
          uptime: process.uptime()
      });
    }catch(e){
      res.status(200).json({ status:'INIT', timestamp: new Date().toISOString(), port: null, uptime: process.uptime() });
    }
});

// 保存/导出设置（用于与外部主应用同步）
app.post('/save-settings', (req, res) => {
    try {
        const incoming = req.body || {};
        const file = join(dataDir, 'settings.json');

        // 读取旧配置，进行合并，避免被部分字段覆盖
        let existing = {};
        try {
            if (fs.existsSync(file)) {
                const txt = fs.readFileSync(file, 'utf-8');
                existing = JSON.parse(txt || '{}');
            }
        } catch (_) { existing = {}; }

        // 简单深合并：对象递归，其它类型直接覆盖
        function deepMerge(target, src){
            if (!src || typeof src !== 'object') return target;
            Object.keys(src).forEach((k)=>{
                const sv = src[k];
                // 忽略 undefined/null 空串的覆盖，避免把已有配置清空
                const isEmptyScalar = (sv === undefined || sv === null || (typeof sv === 'string' && sv === ''));
                if (sv && typeof sv === 'object' && !Array.isArray(sv)){
                    if (!target[k] || typeof target[k] !== 'object') target[k] = {};
                    deepMerge(target[k], sv);
                } else if (!isEmptyScalar) {
                    target[k] = sv;
                }
            });
            return target;
        }

        // 针对 mem_results / mem_progress 进行深合并，其他字段常规覆盖
        const merged = deepMerge({} , existing);
        deepMerge(merged, incoming);

        fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8');
        res.json({ ok: true });
    } catch (e) {
        console.error('save-settings error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.get('/export-settings', (req, res) => {
    try {
        const file = join(dataDir, 'settings.json');
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, 'utf-8');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.send(data);
        } else {
            res.json({});
        }
    } catch (e) {
        console.error('export-settings error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// 启动服务器
async function startServer() {
  try {
    const port = process.env.PORT || await findAvailablePort(DEFAULT_PORT);
    server.listen(port, host, () => {
      console.log(`思维导图应用已启动，访问 http://${host}:${port}`);
      console.log('自动在浏览器中打开...');
      // open disabled on server start;
    });

    // 获取系统语音列表（不阻塞启动）
    try{
      const voices = getWindowsVoices();
      if (voices.length > 0) {
        console.log(`系统检测到 ${voices.length} 个可用语音`);
      }
    }catch(e){ console.warn('获取语音列表失败（忽略）：', e.message); }
  } catch (error) {
    console.error('启动服务器失败:', error.message);
    process.exit(1);
  }
}

startServer();