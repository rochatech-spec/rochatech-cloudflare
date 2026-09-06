import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const dist=path.join(process.cwd(),'dist')
if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Build ausente')
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}
let persistedScope='personal'

function boot(scope='personal'){
  const shared=scope==='shared'
  return {
    profile:{id:'u1',name:'Flávio Neto',username:'flavio.neto',data_version:7},
    scope,
    sharing:{active:true,partnership_id:'p1',partner:{user_id:'u2',name:'Laís Rocha',username:'lais.rocha'},members:[{user_id:'u1',name:'Flávio Neto',username:'flavio.neto'},{user_id:'u2',name:'Laís Rocha',username:'lais.rocha'}],incoming_invites:[],outgoing_invites:[]},
    wallet:{personal_balance:1500,shared_balance:5180,personal_income:4000,personal_expenses:0,sent_to_shared:2500,shared_income:800,shared_expenses:120,shared_transfers:4500,real_income_total:4800,contributions:[{owner_user_id:'u1',name:'Flávio Neto',username:'flavio.neto',amount:2500},{owner_user_id:'u2',name:'Laís Rocha',username:'lais.rocha',amount:2000}],transfers:[{id:'t1',owner_user_id:'u1',created_by:'u1',created_by_name:'Flávio Neto',amount:2500,date:'2026-09-03',description:'Casa',can_edit:true},{id:'t2',owner_user_id:'u2',created_by:'u2',created_by_name:'Laís Rocha',amount:2000,date:'2026-09-04',description:'Mercado',can_edit:false}]},
    settings:{theme:'light',notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,auto_lock_minutes:0},
    security:{webauthn_count:0},
    incomes:shared?[{id:'si1',description:'Venda do casal',category:'Venda',amount:800,date:'2026-09-02',scope:'shared',created_by_name:'Flávio Neto'}]:[{id:'i1',description:'Salário',category:'Salário',amount:4000,date:'2026-09-02',scope:'personal'}],
    expenses:shared?[{id:'se1',description:'Mercado',category:'Supermercado',amount:120,date:'2026-09-05',due_date:'2026-09-05',status:'pago',scope:'shared',created_by_name:'Laís Rocha'},{id:'se2',description:'Internet',category:'Contas da casa',amount:100,date:'2026-09-10',due_date:'2026-09-10',status:'pendente',scope:'shared'}]:[{id:'e1',description:'Academia',category:'Saúde',amount:90,date:'2026-09-01',due_date:'2026-09-08',status:'pago',scope:'personal'}],
    debts:shared?[{id:'sd1',creditor:'Móveis',total_amount:1200,balance:700,paid_amount:500,start_date:'2026-08-01',due_date:'2026-09-20',status:'ativa',scope:'shared'}]:[{id:'d1',creditor:'Cartão',total_amount:1000,balance:600,paid_amount:400,start_date:'2026-08-01',due_date:'2026-09-18',status:'ativa',scope:'personal'}],
    debt_events:[],
    goals:shared?[{id:'sg1',name:'Viagem',target_amount:5000,current_amount:1800,deadline:'2026-12-20',category:'Viagem',scope:'shared'}]:[{id:'g1',name:'Notebook',target_amount:4000,current_amount:1200,deadline:'2026-11-30',category:'Personalizado',scope:'personal'}],
    goal_contributions:[],server_time:'2026-09-06T23:50:00.000Z'
  }
}

function report(scope,from,to){
  const shared=scope==='shared'
  return {scope,from,to,summary:shared?{income:800,expenses:120,receivable:0,pending:100,transfers:4500,period_result:5180,current_balance:5180,real_income_total:800}:{income:4000,expenses:90,receivable:0,pending:0,transfers:2500,period_result:1410,current_balance:1500,real_income_total:4000},personal:shared?null:{incomes:boot('personal').incomes,expenses:boot('personal').expenses},shared:shared?{incomes:boot('shared').incomes,expenses:boot('shared').expenses,contributions:boot('shared').wallet.contributions}:null,transfers:shared?boot('shared').wallet.transfers:[boot('personal').wallet.transfers[0]]}
}

const harness=`<script>(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));const root=document.getElementById('root');const errors=[];addEventListener('error',e=>errors.push(String(e.message||e.error||'erro')));addEventListener('unhandledrejection',e=>errors.push(String(e.reason||'rejeicao')));const ok=(v,m)=>{if(!v)throw new Error(m)};const txt=(needle)=>root?.innerText?.includes(needle);const byText=(sel,needle)=>[...document.querySelectorAll(sel)].find(x=>x.textContent?.includes(needle));const click=async(el,label,delay=90)=>{ok(!!el,'controle '+label);el.click();await wait(delay)};const noOverflow=label=>ok(document.documentElement.scrollWidth<=innerWidth+4,'sem overflow '+label);const visible=el=>!!el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;const noProfileSwitch=label=>ok(!document.querySelector('.profile-dock'),'sem seletor de perfil em '+label);
try{
 for(let i=0;i<80&&!document.querySelector('.profile-dock');i++)await wait(50);ok(!!document.querySelector('.profile-dock'),'app carregado');ok(!document.querySelector('.auth-shell'),'sessao reconhecida');ok(document.querySelectorAll('.profile-dock').length===1,'um seletor de perfil');ok(document.querySelectorAll('.profile-dock .profile-choice').length===2,'dois perfis financeiros');ok(document.querySelectorAll('.finance-hero').length===1,'um unico hero financeiro');ok(txt('PERFIL PESSOAL'),'perfil pessoal');noOverflow('home pessoal');
 await wait(950);const shared=[...document.querySelectorAll('.profile-choice')].find(x=>x.textContent?.includes('CASAL'));const t=performance.now();await click(shared,'perfil casal',20);for(let i=0;i<30&&!txt('PERFIL DO CASAL');i++)await wait(8);ok(txt('PERFIL DO CASAL'),'perfil casal renderizado');ok(performance.now()-t<280,'troca casal usa cache local');ok(document.querySelectorAll('.finance-hero').length===1,'hero casal sem duplicacao');noOverflow('home casal');
 const entry=byText('.hero-action','Entrada');await click(entry,'entrada');ok(txt('Destino da entrada'),'destino da entrada');ok(txt('Pessoal')&&txt('Casal / Compartilhado'),'carteiras no formulario');await click(document.querySelector('.sheet .icon-button'),'fechar entrada',40);
 const expense=byText('.hero-action','Saída');await click(expense,'saida');ok(txt('Pagar com'),'pagar com');await click(document.querySelector('.sheet .icon-button'),'fechar saida',40);
 const nav=(label)=>byText('.bottom-nav .nav-button,.desktop-sidebar .nav-button',label);
 await click(nav('Movimentos'),'movimentacoes');ok(txt('Entradas e saídas'),'tela movimentacoes');noProfileSwitch('movimentacoes');noOverflow('movimentacoes');
 await click(nav('Dívidas'),'dividas');ok(txt('Compromissos sob controle'),'tela dividas');ok(txt('Haver'),'acao haver');noProfileSwitch('dividas');noOverflow('dividas');
 await click(nav('Metas'),'metas');ok(txt('Planos com progresso visível'),'tela metas');noProfileSwitch('metas');noOverflow('metas');
 await click(nav('Menu'),'menu');ok(txt('Tudo no lugar certo'),'tela menu');noProfileSwitch('menu');const reportCard=byText('.menu-card','Relatório');await click(reportCard,'relatorio',80);for(let i=0;i<40&&!byText('button','Gerar PDF');i++)await wait(40);ok(txt('Relatório'),'tela relatorio');noProfileSwitch('relatorio');ok(!/extrato/i.test(root.innerText),'somente Relatório');let pdf=byText('button','Gerar PDF');for(let i=0;i<40&&pdf?.disabled;i++){await wait(35);pdf=byText('button','Gerar PDF')}ok(pdf&&!pdf.disabled,'pdf habilitado');let pdfType='',pdfSize=0,download=false;const oldUrl=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{pdfType=b?.type||'';pdfSize=Number(b?.size||0);return 'blob:ritmo-ci'};HTMLAnchorElement.prototype.click=function(){download=true};pdf.click();await wait(120);URL.createObjectURL=oldUrl;HTMLAnchorElement.prototype.click=oldClick;ok(pdfType==='application/pdf'&&pdfSize>700&&download,'pdf real gerado');noOverflow('relatorio');
 await click(nav('Início'),'inicio',70);for(let i=0;i<20&&!document.querySelector('.finance-hero');i++)await wait(20);ok(document.querySelectorAll('.profile-dock').length===1,'seletor reaparece apenas na home');if(innerWidth<700){const bottom=document.querySelector('.bottom-nav');ok(visible(bottom),'barra inferior mobile');scrollTo(0,document.documentElement.scrollHeight);await wait(40);const frame=document.querySelector('.page-frame');ok(frame.getBoundingClientRect().bottom<=bottom.getBoundingClientRect().top+2,'conteudo nao coberto pela barra inferior')}else{ok(visible(document.querySelector('.desktop-sidebar')),'sidebar desktop');ok(!visible(document.querySelector('.bottom-nav')),'sem tabbar desktop')}
 ok(!/Cloudflare|Service Worker|WebAuthn|IndexedDB|\\bD1\\b|\\bR2\\b|Queues|trace/i.test(root.innerText),'sem termos tecnicos');ok(errors.length===0,'sem erros globais: '+errors.join(';'));document.body.dataset.ritmoAudit='pass'
}catch(e){document.body.dataset.ritmoAudit='fail';document.body.dataset.ritmoError=String(e.message||e).slice(0,240)}})()</script>`

const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1')
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/bootstrap'){
    const scope=url.searchParams.get('scope')==='shared'?'shared':'personal';setTimeout(()=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(boot(scope)))},scope==='shared'?170:15);return
   }
   if(url.pathname==='/api/sharing/scope'){let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{try{persistedScope=JSON.parse(raw||'{}').scope||persistedScope}catch{}setTimeout(()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,scope:persistedScope}))},220)});return}
   if(url.pathname==='/api/wallet/report'){const scope=url.searchParams.get('scope')==='shared'?'shared':'personal',from=url.searchParams.get('from')||'2026-09-01',to=url.searchParams.get('to')||'2026-09-06';res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(report(scope,from,to)));return}
   res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return
  }
  let rel=url.pathname==='/'?'index.html':url.pathname.replace(/^\\/+/,''),file=path.join(dist,rel)
  if(!file.startsWith(dist)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html')
  let body=fs.readFileSync(file)
  if(path.basename(file)==='index.html')body=Buffer.from(body.toString().replace('</body>',harness+'</body>'))
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)
 }catch(error){res.writeHead(500);res.end(String(error))}
})
await new Promise((resolve,reject)=>server.listen(4175,'127.0.0.1',error=>error?reject(error):resolve()))
const browser=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync)
if(!browser){server.close();throw new Error('Chrome/Chromium ausente')}
async function run(size){persistedScope='personal';const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size='+size,'--virtual-time-budget=11000','--user-data-dir=/tmp/ritmo-next-'+Date.now()+'-'+Math.random(),'--dump-dom','http://127.0.0.1:4175/'];const child=spawn(browser,args,{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);const code=await new Promise(r=>child.on('close',r));clearTimeout(timer);if(code!==0)throw new Error(err.slice(-1600));if(!/data-ritmo-audit="pass"/.test(out)){const match=out.match(/data-ritmo-error="([^"]*)"/);throw new Error(`Auditoria ${size}: ${match?.[1]||'falhou sem detalhe'}`)}return out}
await run('390,844')
await run('1440,900')
await new Promise(resolve=>server.close(resolve))
console.log('Ritmo Next: auditoria premium aprovada em mobile e desktop; troca Pessoal/Casal somente na Home.')
