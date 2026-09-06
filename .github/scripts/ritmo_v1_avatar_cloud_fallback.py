from pathlib import Path
import sys

root=Path(sys.argv[1])
worker=root/'_worker.js'
app=root/'public'/'app.js'

s=worker.read_text()
start=s.find("  if(path==='/api/avatar'&&request.method==='GET'){")
put=s.find("  if(path==='/api/avatar'&&request.method==='PUT'){",start)
end=s.find("\n  const b=request.method==='GET'?{}:await body(request);",put)
if start<0 or put<0 or end<0:
    raise SystemExit('Blocos de avatar não encontrados no Worker.')

avatar=r'''  if(path==='/api/avatar'&&request.method==='GET'){
    const u=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();
    if(!u?.avatar_key)return new Response(null,{status:404});
    const avatarKey=String(u.avatar_key);
    if(avatarKey.startsWith('kv:')&&env.CACHE){
      const key=avatarKey.slice(3);const item=await env.CACHE.getWithMetadata(key,{type:'arrayBuffer'});
      if(!item?.value)return new Response(null,{status:404});
      return new Response(item.value,{headers:{'content-type':item.metadata?.contentType||'image/jpeg','cache-control':'private, max-age=3600'}});
    }
    if(env.AVATARS){const o=await env.AVATARS.get(avatarKey);if(!o)return new Response(null,{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'image/jpeg','cache-control':'private, max-age=3600'}})}
    return new Response(null,{status:404});
  }
  if(path==='/api/avatar'&&request.method==='PUT'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const ct=request.headers.get('content-type')||'';
    if(!/^image\/(jpeg|png|webp)$/.test(ct))return json({error:'Use JPG, PNG ou WebP.'},400);
    const buf=await request.arrayBuffer();if(buf.byteLength>1024*1024)return json({error:'A foto deve ter até 1 MB após otimização.'},413);
    const old=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();let key='';
    if(env.AVATARS){const ext=ct.split('/')[1].replace('jpeg','jpg');key=`avatars/${userId}/${uid()}.${ext}`;await env.AVATARS.put(key,buf,{httpMetadata:{contentType:ct}})}
    else if(env.CACHE){const kvKey=`avatar:${userId}:${uid()}`;await env.CACHE.put(kvKey,buf,{metadata:{contentType:ct}});key=`kv:${kvKey}`}
    else return json({error:'O armazenamento de foto está temporariamente indisponível.'},503);
    await env.DB.prepare(`UPDATE users SET avatar_key=?,updated_at=? WHERE id=?`).bind(key,now(),userId).run();
    if(old?.avatar_key&&old.avatar_key!==key){const previous=String(old.avatar_key);try{if(previous.startsWith('kv:')&&env.CACHE)await env.CACHE.delete(previous.slice(3));else if(env.AVATARS)await env.AVATARS.delete(previous)}catch{}}
    await bump(env,userId,'update','avatar',userId);return json({ok:true});
  }'''
s=s[:start]+avatar+s[end:]
worker.write_text(s)

a=app.read_text()
a=a.replace("if(file.size<=900000)return file;const url=URL.createObjectURL(file);", "if(file.size<=280000)return file;const url=URL.createObjectURL(file);")
a=a.replace("const max=768,scale=", "const max=512,scale=")
a=a.replace("c.toBlob(r,'image/jpeg',.86)", "c.toBlob(r,'image/jpeg',.80)")
app.write_text(a)
print('Ritmo V1: avatar cloud-first com fallback KV e otimização econômica aplicado.')
