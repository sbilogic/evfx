import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep, extname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain'};
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{
  try {
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Serve at the same /evfx/ base path as GitHub Pages, as well as /.
    if(path==='/evfx') {res.writeHead(302,{Location:'/evfx/'});res.end();return;}
    if(path.startsWith('/evfx/'))path=path.slice(5);
    if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,`.${path}`);
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`EVFX preview: http://127.0.0.1:${port}/evfx/`));
