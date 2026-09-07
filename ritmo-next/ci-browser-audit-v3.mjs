import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const dist = path.join(process.cwd(), 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build ausente')

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

let sharedBootstrapCalls = 0

function boot(scope = 'personal') {
  const shared = scope === 'shared'
  return {
    profile: { id: 'u1', name: 'Flávio Neto', username: 'flavio.neto', data_version: 7 },
    scope,
    sharing: {
      active: true,
      partnership_id: 'p1',
      partner: { user_id: 'u2', name: 'Laís Rocha', username: 'lais.rocha' },
      members: [
        { user_id: 'u1', name: 'Flávio Neto', username: 'flavio.neto' },
        { user_id: 'u2', name: 'Laís Rocha', username: 'lais.rocha' },
      ],
      incoming_invites: [],
      outgoing_invites: [],
    },
    wallet: {
      personal_balance: 1500,
      shared_balance: 5180,
      personal_income: 4000,
      personal_expenses: 90,
      sent_to_shared: 2500,
      shared_income: 800,
      shared_expenses: 120,
      shared_transfers: 4500,
      real_income_total: 4800,
      contributions: [
        { owner_user_id: 'u1', name: 'Flávio Neto', username: 'flavio.neto', amount: 2500 },
        { owner_user_id: 'u2', name: 'Laís Rocha', username: 'lais.rocha', amount: 2000 },
      ],
      transfers: [
        { id: 't1', owner_user_id: 'u1', created_by: 'u1', created_by_name: 'Flávio Neto', amount: 2500, date: '2026-09-03', description: 'Casa', can_edit: true },
        { id: 't2', owner_user_id: 'u2', created_by: 'u2', created_by_name: 'Laís Rocha', amount: 2000, date: '2026-09-04', description: 'Mercado', can_edit: false },
      ],
    },
    settings: { theme: 'light', notifications_enabled: 1, notify_due: 1, notify_overdue: 1, notify_goals: 1, reminder_days: 3, monthly_summary: 1, auto_lock_minutes: 0 },
    security: { webauthn_count: 0 },
    incomes: shared
      ? [{ id: 'si1', description: 'Venda do casal', category: 'Venda', amount: 800, date: '2026-09-02', scope: 'shared', created_by_name: 'Flávio Neto' }]
      : [
          { id: 'i1', description: 'Salário', category: 'Salário', amount: 4000, date: '2026-09-02', scope: 'personal' },
          { id: 'i2', description: 'Renda futura', category: 'Outros', amount: 9999, date: '2026-09-20', scope: 'personal' },
        ],
    expenses: shared
      ? [
          { id: 'se1', description: 'Mercado', category: 'Supermercado', amount: 120, date: '2026-09-05', due_date: '2026-09-05', status: 'pago', scope: 'shared', created_by_name: 'Laís Rocha' },
          { id: 'se2', description: 'Internet', category: 'Contas da casa', amount: 100, date: '2026-09-10', due_date: '2026-09-10', status: 'pendente', scope: 'shared' },
        ]
      : [
          { id: 'e1', description: 'Academia', category: 'Saúde', amount: 90, date: '2026-09-01', due_date: '2026-09-08', status: 'pago', scope: 'personal' },
          { id: 'e2', description: 'Conta futura', category: 'Outros', amount: 777, date: '2026-09-20', due_date: '2026-09-20', status: 'pago', scope: 'personal' },
        ],
    debts: shared
      ? [{ id: 'sd1', creditor: 'Móveis', total_amount: 1200, balance: 700, paid_amount: 500, start_date: '2026-08-01', due_date: '2026-09-20', status: 'ativa', scope: 'shared' }]
      : [{ id: 'd1', creditor: 'Cartão', total_amount: 1000, balance: 600, paid_amount: 400, start_date: '2026-08-01', due_date: '2026-09-18', status: 'ativa', scope: 'personal' }],
    debt_events: [],
    goals: shared
      ? [{ id: 'sg1', name: 'Viagem', target_amount: 5000, current_amount: 1800, deadline: '2026-12-20', category: 'Viagem', scope: 'shared' }]
      : [{ id: 'g1', name: 'Notebook', target_amount: 4000, current_amount: 1200, deadline: '2026-11-30', category: 'Personalizado', scope: 'personal' }],
    goal_contributions: [],
    server_time: '2026-09-06T23:50:00.000Z',
  }
}

function report(scope, from, to) {
  const shared = scope === 'shared'
  return {
    scope,
    from,
    to,
    summary: shared
      ? { income: 800, expenses: 120, receivable: 0, pending: 100, transfers: 4500, period_result: 5180, current_balance: 5180, real_income_total: 800 }
      : { income: 4000, expenses: 90, receivable: 9999, pending: 777, transfers: 2500, period_result: 1410, current_balance: 1500, real_income_total: 4000 },
    personal: shared ? null : { incomes: [boot('personal').incomes[0]], expenses: [boot('personal').expenses[0]] },
    shared: shared ? { incomes: boot('shared').incomes, expenses: boot('shared').expenses, contributions: boot('shared').wallet.contributions } : null,
    transfers: shared ? boot('shared').wallet.transfers : [boot('personal').wallet.transfers[0]],
  }
}

const harness = `<script>(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const root=document.getElementById('root');
const errors=[];
addEventListener('error',e=>errors.push(String(e.message||e.error||'erro')));
addEventListener('unhandledrejection',e=>errors.push(String(e.reason||'rejeicao')));
const ok=(v,m)=>{if(!v)throw new Error(m)};
const text=x=>root?.innerText?.includes(x);
const by=(sel,x)=>[...document.querySelectorAll(sel)].find(e=>e.textContent?.includes(x));
const click=async(e,m,d=70)=>{ok(e,'controle '+m);e.click();await wait(d)};
const noSwitch=m=>ok(!document.querySelector('.profile-dock'),'seletor fora da Home: '+m);
const calls=async()=>Number(await fetch('/__audit/shared-count').then(r=>r.text()));
const noOverflow=m=>ok(document.documentElement.scrollWidth<=innerWidth+4,'overflow '+m);
try{
  for(let i=0;i<160&&!document.querySelector('.profile-dock');i++)await wait(40);
  ok(document.querySelector('.profile-dock'),'app carregado');
  ok(document.querySelectorAll('.profile-dock').length===1,'um seletor');
  ok(document.querySelectorAll('.profile-choice').length===2,'dois perfis');
  ok(document.querySelectorAll('.finance-hero').length===1,'um hero');
  ok(text('PERFIL PESSOAL'),'perfil pessoal');
  ok(text('R$ 4.000,00'),'entrada realizada na Home');
  ok(!text('R$ 13.999,00'),'futuro nao somado como realizado');
  noOverflow('home pessoal');

  for(let i=0;i<80&&(await calls())<1;i++)await wait(40);
  await wait(250);
  const before=await calls();
  ok(before===1,'perfil casal pre-carregado uma vez');
  await click(by('.profile-choice','CASAL'),'casal',90);
  for(let i=0;i<50&&!text('PERFIL DO CASAL');i++)await wait(20);
  ok(text('PERFIL DO CASAL'),'casal renderizado');
  const after=await calls();
  ok(after===before,'troca usa cache sem nova consulta');
  ok(document.querySelectorAll('.finance-hero').length===1,'hero casal unico');

  await click(by('.hero-action','Entrada'),'entrada');
  ok(text('Destino da entrada'),'destino entrada');
  ok(text('Casal / Compartilhado'),'destino casal');
  await click(document.querySelector('.sheet .icon-button'),'fechar entrada');
  await click(by('.hero-action','Saída'),'saida');
  ok(text('Pagar com'),'pagar com');
  await click(document.querySelector('.sheet .icon-button'),'fechar saida');

  const nav=label=>by('.bottom-nav .nav-button,.desktop-sidebar .nav-button',label);
  await click(nav('Movimentos'),'movimentos');
  ok(text('Entradas e saídas'),'movimentos');
  noSwitch('movimentos');
  await click(nav('Dívidas'),'dividas');
  ok(text('Compromissos sob controle'),'dividas');
  ok(text('Haver'),'haver');
  noSwitch('dividas');
  await click(nav('Metas'),'metas');
  ok(text('Planos com progresso visível'),'metas');
  noSwitch('metas');
  await click(nav('Menu'),'menu');
  ok(text('Tudo no lugar certo'),'menu');
  noSwitch('menu');

  await click(by('.menu-card','Relatório'),'relatorio');
  for(let i=0;i<50&&!by('button','Gerar PDF');i++)await wait(30);
  ok(text('Relatório'),'relatorio');
  noSwitch('relatorio');
  ok(!/extrato/i.test(root.innerText),'sem extrato');
  let pdf=by('button','Gerar PDF');
  for(let i=0;i<40&&pdf?.disabled;i++){await wait(30);pdf=by('button','Gerar PDF')}
  ok(pdf&&!pdf.disabled,'pdf habilitado');
  let pdfType='',pdfSize=0,download=false;
  const oldUrl=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=blob=>{pdfType=blob.type;pdfSize=blob.size;return 'blob:ci'};
  HTMLAnchorElement.prototype.click=function(){download=true};
  pdf.click();await wait(100);
  URL.createObjectURL=oldUrl;HTMLAnchorElement.prototype.click=oldClick;
  ok(pdfType==='application/pdf'&&pdfSize>700&&download,'pdf real');

  await click(nav('Início'),'inicio');
  ok(document.querySelector('.profile-dock'),'seletor somente Home');
  noOverflow('home final');
  if(innerWidth<700){
    const bottom=document.querySelector('.bottom-nav'),frame=document.querySelector('.page-frame');
    scrollTo(0,document.documentElement.scrollHeight);await wait(30);
    ok(getComputedStyle(bottom).display!=='none','tabbar mobile');
    ok(frame.getBoundingClientRect().bottom<=bottom.getBoundingClientRect().top+3,'conteudo livre da tabbar');
  }else{
    ok(getComputedStyle(document.querySelector('.desktop-sidebar')).display!=='none','sidebar desktop');
    ok(getComputedStyle(document.querySelector('.bottom-nav')).display==='none','sem tabbar desktop');
  }
  ok(!/Cloudflare|Service Worker|WebAuthn|IndexedDB|\\bD1\\b|\\bR2\\b|Queues|trace/i.test(root.innerText),'sem termos tecnicos');
  ok(errors.length===0,'erros globais '+errors.join(';'));
  document.body.dataset.ritmoAudit='pass';
}catch(e){
  document.body.dataset.ritmoAudit='fail';
  document.body.dataset.ritmoError=String(e.message||e).slice(0,220);
  document.body.dataset.ritmoDebug=(root?.innerText||'').replace(/\\s+/g,' ').slice(0,300);
}})()</script>`

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/__audit/shared-count') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(String(sharedBootstrapCalls))
      return
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/bootstrap') {
        const scope = url.searchParams.get('scope') === 'shared' ? 'shared' : 'personal'
        if (scope === 'shared') sharedBootstrapCalls += 1
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(boot(scope)))
        return
      }
      if (url.pathname === '/api/wallet/report') {
        const scope = url.searchParams.get('scope') === 'shared' ? 'shared' : 'personal'
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(report(scope, url.searchParams.get('from') || '2026-09-01', url.searchParams.get('to') || '2026-09-06')))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
      return
    }

    const relative = url.pathname === '/' ? 'index.html' : url.pathname.split('/').filter(Boolean).join('/')
    let file = path.join(dist, relative)
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    let body = fs.readFileSync(file)
    if (path.basename(file) === 'index.html') body = Buffer.from(body.toString().replace('</body>', harness + '</body>'))
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})

await new Promise((resolve, reject) => server.listen(4176, '127.0.0.1', error => error ? reject(error) : resolve()))
const browser = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync)
if (!browser) { server.close(); throw new Error('Chrome/Chromium ausente') }

async function run(size) {
  sharedBootstrapCalls = 0
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=' + size, '--virtual-time-budget=18000',
    '--user-data-dir=/tmp/ritmo-next-v3-' + Date.now() + '-' + Math.random(),
    '--dump-dom', 'http://127.0.0.1:4176/',
  ]
  const child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''
  child.stdout.on('data', data => out += data)
  child.stderr.on('data', data => err += data)
  const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
  const code = await new Promise(resolve => child.on('close', resolve))
  clearTimeout(timer)
  if (code !== 0) throw new Error(err.slice(-1500))
  if (!/data-ritmo-audit="pass"/.test(out)) {
    const failure = out.match(/data-ritmo-error="([^"]*)"/)
    const debug = out.match(/data-ritmo-debug="([^"]*)"/)
    throw new Error(`Auditoria ${size}: ${failure?.[1] || 'falhou'} | ${debug?.[1] || ''}`)
  }
}

await run('390,844')
await run('1440,900')
await new Promise(resolve => server.close(resolve))
console.log('Ritmo Next: UI premium, cache Pessoal/Casal e PDF aprovados em mobile e desktop.')
