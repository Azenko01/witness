const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const EXPIRE_MS = 24 * 60 * 60 * 1000;

let messages = [];
let onlineCount = 0;

function pruneExpired() {
  const now = Date.now();
  messages = messages.filter(m => (now - m.timestamp) < EXPIRE_MS);
}

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on('connection', (ws, req) => {
  onlineCount++;
  pruneExpired();

  ws.send(JSON.stringify({ type: 'init', messages, onlineCount }));
  broadcast({ type: 'online', count: onlineCount });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'post') {
      const text = (data.text || '').trim().slice(0, 280);
      if (!text) return;
      const msg = { id: Date.now() + Math.random(), text, lang: data.lang || 'en', timestamp: Date.now(), heard: 0 };
      messages.unshift(msg);
      if (messages.length > 100) messages.pop();
      broadcast({ type: 'new_message', message: msg });
    }

    if (data.type === 'hear') {
      const msg = messages.find(m => m.id === data.id);
      if (msg) {
        msg.heard++;
        broadcast({ type: 'heard', id: msg.id, heard: msg.heard });
      }
    }
  });

  ws.on('close', () => {
    onlineCount = Math.max(0, onlineCount - 1);
    broadcast({ type: 'online', count: onlineCount });
  });

  ws.on('error', () => {
    onlineCount = Math.max(0, onlineCount - 1);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Witness running → http://localhost:${PORT}`));
