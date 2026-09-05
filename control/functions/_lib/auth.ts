const te=new TextEncoder()
const b64u=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const ub64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))
const sessionSecret=(env:any)=>{const s=env?.SESSION_SECRET;if(typeof s!=='string'||s.length<32)throw new Error('SESSION_SECRET_MISSING');return s}
async function hmac(secret:string,data:string){const k=await crypto.subtle.importKey('raw',te.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',k,te.encode(data))))}
export async function hashPassword(password:string,salt:string=String(crypto.randomUUID())){const key=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:te.encode(salt),iterations:120000},key,256);return `${salt}.${b64u(new Uint8Array(bits))}`}
export async function verifyPassword(password:string,stored:string){if(typeof stored!=='string'||!stored.includes('.'))return false;try{const [salt]=stored.split('.');return !!salt&&(await hashPassword(password,salt))===stored}catch{return false}}
export async function signSession(env:any,payload:any){const body=b64u(te.encode(JSON.stringify({...payload,exp:Date.now()+1000*60*60*24*30})));return `${body}.${await hmac(sessionSecret(env),body)}`}
export async function session(request:Request,env:any){const a=request.headers.get('Authorization')||'';if(!a.startsWith('Bearer '))return null;const [body,sig]=a.slice(7).split('.');if(!body||!sig)return null;try{if(await hmac(sessionSecret(env),body)!==sig)return null;const p=JSON.parse(new TextDecoder().decode(ub64(body)));return p.exp>Date.now()?p:null}catch{return null}}
export function hasSessionSecret(env:any){return typeof env?.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=32}
export function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
export const id=(prefix='id')=>`${prefix}_${String(crypto.randomUUID()).replace(/-/g,'')}`
