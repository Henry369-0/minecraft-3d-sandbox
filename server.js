// 极简静态文件服务器（Node.js）：npm 不需要，直接 node server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const port = process.env.PORT || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  console.log('[req] ' + req.method + ' ' + req.url);
  let url;
  try {
    url = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    url = '/';
  }

  // 测试报告端点：页面 POST /report 时写入 tools/reports.log（开发/自测用）
  if (url === '/report' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const dir = path.join(root, 'tools');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        const entry = JSON.stringify({ ts: Date.now(), body: JSON.parse(body || '{}') });
        fs.appendFileSync(path.join(dir, 'reports.log'), entry + '\n');
        fs.writeFileSync(path.join(dir, 'last-report.json'), entry + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(500);
        res.end('{"ok":false}');
      }
    });
    return;
  }

  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found: ' + url);
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log('==============================================');
  console.log('  方块世界服务器已启动');
  console.log('  在浏览器打开: http://127.0.0.1:' + port);
  console.log('  按 Ctrl+C 停止');
  console.log('==============================================');
});
