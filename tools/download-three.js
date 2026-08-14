// One-off helper: download three.module.js into js/libs with TLS verification disabled.
const https = require('https');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
const out = path.join(__dirname, '..', 'js', 'libs', 'three.module.js');

const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    console.log('redirect -> ' + res.headers.location);
    res.resume();
    https.get(res.headers.location, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r2) => {
      if (r2.statusCode !== 200) { console.error('status ' + r2.statusCode); process.exit(1); }
      const ws = fs.createWriteStream(out);
      r2.pipe(ws);
      ws.on('finish', () => { ws.close(); console.log('saved ' + fs.statSync(out).size + ' bytes'); });
    }).on('error', (e) => { console.error(e.message); process.exit(1); });
    return;
  }
  if (res.statusCode !== 200) { console.error('status ' + res.statusCode); process.exit(1); }
  const ws = fs.createWriteStream(out);
  res.pipe(ws);
  ws.on('finish', () => { ws.close(); console.log('saved ' + fs.statSync(out).size + ' bytes'); });
});
req.on('error', (e) => { console.error(e.message); process.exit(1); });
