// 简易反向代理：监听 10222，将 HTTP 与 WebSocket 转发到本机 7860
// 需求背景：保持内部 Gradio 端口 7860 不变，但对外访问固定 10222
// 依赖：仅使用 Node 内置模块（http/net/url），无需额外安装

const http = require('http');
const net = require('net');
const url = require('url');

const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = parseInt(process.env.GRADIO_INTERNAL_PORT || process.env.TARGET_PORT || '7860', 10);
const LISTEN_HOST = process.env.PROXY_LISTEN_HOST || '127.0.0.1';
const LISTEN_PORT = parseInt(process.env.GRADIO_PUBLIC_PORT || process.env.LISTEN_PORT || '10222', 10);

// Automindmap upstream (e.g., 5173)
const AM_HOST = process.env.AUTOMINDMAP_PUBLIC_HOST || '127.0.0.1';
const AM_PORT = parseInt(process.env.AUTOMINDMAP_PORT || '5173', 10);

// HTTP 请求转发
const server = http.createServer((clientReq, clientRes) => {
  try {
    const parsed = url.parse(clientReq.url);
    const isAmPath = parsed.pathname === '/am/save-settings' || parsed.pathname === '/am/export-settings';
    const upstreamHost = isAmPath ? AM_HOST : TARGET_HOST;
    const upstreamPort = isAmPath ? AM_PORT : TARGET_PORT;
    const upstreamPath = isAmPath
      ? (parsed.pathname === '/am/save-settings' ? '/save-settings' : '/export-settings') + (parsed.search || '')
      : (parsed.path || '/');

    const options = {
      hostname: upstreamHost,
      port: upstreamPort,
      path: upstreamPath,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: `${upstreamHost}:${upstreamPort}`,
        connection: 'close',
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      try {
        // 透传响应头与状态码
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      } catch (e) {
        try { clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); } catch (_) {}
        try { clientRes.end(`Bad Gateway: ${e.message || e}`); } catch (_) {}
      }
    });

    proxyReq.on('error', (err) => {
      try {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        clientRes.end(`Bad Gateway: ${err.message || err}`);
      } catch (_) {}
    });

    clientReq.pipe(proxyReq);
  } catch (e) {
    try {
      clientRes.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      clientRes.end(`Proxy Error: ${e.message || e}`);
    } catch (_) {}
  }
});

// WebSocket 转发（升级握手 + 双向管道）
server.on('upgrade', (req, clientSocket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    try {
      // 重新构造原始请求行与头部（尽量保持原样，必要时修正 Host）
      const startLine = `${req.method} ${req.url} HTTP/${req.httpVersion}`;
      const raw = req.rawHeaders || [];
      const hdrs = [];
      for (let i = 0; i < raw.length; i += 2) {
        let name = raw[i];
        let value = raw[i + 1];
        if (/^host$/i.test(name)) {
          value = `${TARGET_HOST}:${TARGET_PORT}`;
        }
        hdrs.push(`${name}: ${value}`);
      }
      const payload = startLine + '\r\n' + hdrs.join('\r\n') + '\r\n\r\n';
      upstream.write(payload);
      if (head && head.length) upstream.write(head);

      // 建立双向管道
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    } catch (e) {
      try { clientSocket.destroy(); } catch (_) {}
      try { upstream.destroy(); } catch (_) {}
    }
  });

  upstream.on('error', () => {
    try { clientSocket.destroy(); } catch (_) {}
  });
});

server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (_) {}
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[proxy] listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});


