'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {checkDirectory, files} = require('./build-public-demo.cjs');

function createServer(directory) {
  checkDirectory(directory);
  // Serve a fixed set of generated assets. The server cannot read private inputs.
  const assets = new Map(files.filter(file => /\.(html|css|js)$/.test(file)).map(file => [file, fs.readFileSync(path.join(directory, file))]));
  const types = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8'};
  return http.createServer((request, response) => {
    let file;
    try { file = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
    catch { response.writeHead(400); response.end(); return; }
    if (!['GET','HEAD'].includes(request.method) || !assets.has(file)) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {'Content-Type':types[path.extname(file)], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    response.end(request.method === 'HEAD' ? undefined : assets.get(file));
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  try {
    const server = createServer(path.join(__dirname, '../dist'));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log('Practice demo: http://127.0.0.1:' + server.address().port));
  } catch (error) {
    console.error('Run npm run build:demo first. ' + error.message);
    process.exitCode = 1;
  }
}
module.exports = {createServer};
