import { routeAuth, routeWebAuthn } from './auth'
import { bootstrap, routeDebts, routeGoals, routeProfile, routeTransactions } from './data'
import { error, json, requireUser, type Env } from './utils'

async function apiRouter(request:Request,env:Env){
  const pathname=new URL(request.url).pathname
  if(pathname==='/api/health')return json({ok:true,app:env.APP_NAME||'Ritmo Finance',time:new Date().toISOString()})
  const auth=await routeAuth(request,env,pathname);if(auth)return auth
  const webauthn=await routeWebAuthn(request,env,pathname);if(webauthn)return webauthn
  const user=await requireUser(request,env)
  if(pathname==='/api/bootstrap'&&request.method==='GET')return bootstrap(request,env,user)
  for(const handler of [routeTransactions,routeGoals,routeDebts]){const result=await handler(request,env,user,pathname);if(result)return result}
  const profile=await routeProfile(request,env,user,pathname);if(profile)return profile
  return error('Rota não encontrada.',404)
}

async function serveAsset(request:Request,env:Env){
  const response=await env.ASSETS.fetch(request)
  if(response.status!==404||!['GET','HEAD'].includes(request.method))return response
  if(!request.headers.get('accept')?.includes('text/html'))return response
  const url=new URL(request.url);url.pathname='/index.html';url.search=''
  return env.ASSETS.fetch(new Request(url,request))
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    try{const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return await apiRouter(request,env);return await serveAsset(request,env)}
    catch(thrown){if(thrown instanceof Response)return thrown;console.error(thrown);return error(thrown instanceof Error?thrown.message:'Erro interno.',500)}
  }
}
