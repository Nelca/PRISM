/* Local-only static preview with byte-range support for MP4 seeking. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../public/promotion');
const port = Number(process.env.PRISM_PREVIEW_PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return}
  let target;
  try {
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    target=path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!target.startsWith(root+path.sep)) throw new Error('Outside root');
  } catch {res.writeHead(400);res.end();return}
  fs.stat(target,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return}
    const headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    let start=0,end=stat.size-1,status=200;
    if(req.headers.range){
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return}
      if(m[1]){start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end}
      else {start=Math.max(0,stat.size-Number(m[2]))}
      if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=end-start+1;
    res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return}
    const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);res.on('close',()=>stream.destroy());
  });
}).listen(port,'127.0.0.1',()=>console.log(`PRISM preview: http://127.0.0.1:${port}/index.html`));
