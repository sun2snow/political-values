import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

// Test/preview only. Production is published as static Pages artifacts.
export async function startTestServer(root=process.cwd()){
  root=resolve(root);
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
  const server=createServer(async(req,res)=>{
    try{
      let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root&&!file.startsWith(root+sep))throw new Error('outside root');
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
      res.end(await readFile(file));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
