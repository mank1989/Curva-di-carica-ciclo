// Prepara la cartella www/: copia della pagina (app.html), numero di versione e il guscio di avvio.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '..');          // radice del repository
const www = path.resolve('www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
const need = f => { const p = path.join(root, f); if (!fs.existsSync(p)) throw new Error('manca ' + f + ' nel repository'); return p; };
// app.html = la pagina del sito con il Bluetooth nativo caricato in testa, prima di tutto il resto
const page = fs.readFileSync(need('index.html'), 'utf8');
const hd = page.indexOf('</head>');
if (hd < 0) throw new Error('index.html: non trovo </head>');
fs.writeFileSync(path.join(www, 'app.html'), page.slice(0, hd) + '<script src="native.js"></script>\n' + page.slice(hd));
for (const f of ['manifest.json', 'icon-192.png', 'icon-512.png']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(www, f));
const sw = fs.readFileSync(need('sw.js'), 'utf8');
const m = /nc3000-v(\d+)/.exec(sw);
if (!m) throw new Error('in sw.js non trovo il numero di versione (const CACHE = \'nc3000-vNN\')');
fs.writeFileSync(path.join(www, 'version.json'), JSON.stringify({ v: +m[1] }));
fs.writeFileSync(path.join(www, 'index.html'),
  '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<title>NC3000 Monitor</title><style>html,body{margin:0;background:#0b0c0f;color:#9aa0a6;font:16px sans-serif}</style></head>' +
  '<body><p style="padding:24px">Avvio…</p><script>window.__nc3000Shell = 1</script><script src="native.js"></script></body></html>');
console.log('www pronta, versione pagina', m[1]);
