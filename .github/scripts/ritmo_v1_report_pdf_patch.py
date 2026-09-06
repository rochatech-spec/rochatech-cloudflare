from pathlib import Path
import sys
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js'; worker=root/'_worker.js'; cssp=root/'public'/'styles.css'
a=app.read_text(); w=worker.read_text(); css=cssp.read_text()

def replace_func(src,name,code):
    p,q=js_function_bounds(src,name); return src[:p]+code+src[q:]

def need(src,text,label):
    if text not in src: raise SystemExit('Relatório: trecho ausente '+label)

# -----------------------------------------------------------------------------
# Backend: relatório filtrado no D1 por carteira e período. Transferências são
# retornadas separadamente e nunca entram no total de receita real.
# -----------------------------------------------------------------------------
report_worker=r'''async function walletReport(env,userId,scope='personal',from=null,to=null){
  await ensureWalletSchema(env);const sharing=await partnershipState(env,userId),todayIso=today(),valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
  scope=scope==='shared'?'shared':'personal';from=valid(from)?from:todayIso.slice(0,7)+'-01';to=valid(to)?to:todayIso;if(from>to){const x=from;from=to;to=x}
  if(scope==='shared'&&!sharing.active)throw new Error('O relatório do casal precisa de duas contas conectadas.');
  const coupleId=sharing.active?sharing.id:null;
  let incomes,expenses,transfers,contributions={results:[]};
  if(scope==='personal'){
    [incomes,expenses,transfers]=await Promise.all([
      env.DB.prepare(`SELECT id,description,category,amount,date,created_at FROM incomes WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC`).bind(userId,from,to).all(),
      env.DB.prepare(`SELECT id,description,category,amount,date,due_date,status,created_at FROM expenses WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC`).bind(userId,from,to).all(),
      env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.owner_user_id=? AND t.transaction_type='transfer' AND t.source_wallet='personal' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? ORDER BY t.date DESC,t.created_at DESC`).bind(userId,from,to).all()
    ]);
  }else{
    [incomes,expenses,transfers,contributions]=await Promise.all([
      env.DB.prepare(`SELECT x.id,x.description,x.category,x.amount,x.date,x.created_at,u.name created_by_name FROM shared_incomes x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? AND x.date>=? AND x.date<=? ORDER BY x.date DESC,x.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT x.id,x.description,x.category,x.amount,x.date,x.due_date,x.status,x.created_at,u.name created_by_name FROM shared_expenses x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? AND x.date>=? AND x.date<=? ORDER BY x.date DESC,x.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.couple_id=? AND t.transaction_type='transfer' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? ORDER BY t.date DESC,t.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT t.owner_user_id,u.name,u.username,COALESCE(SUM(t.amount),0) amount FROM wallet_transactions t JOIN users u ON u.id=t.owner_user_id WHERE t.couple_id=? AND t.transaction_type='transfer' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? GROUP BY t.owner_user_id,u.name,u.username ORDER BY amount DESC`).bind(coupleId,from,to).all()
    ]);
  }
  const inc=mapMoney(incomes.results||[]),out=mapMoney(expenses.results||[]),trs=mapMoney(transfers.results||[]),realIn=inc.filter(x=>x.date<=todayIso).reduce((s,x)=>s+Number(x.amount||0),0),realOut=out.filter(x=>x.status==='pago'&&x.date<=todayIso).reduce((s,x)=>s+Number(x.amount||0),0),plannedIn=inc.filter(x=>x.date>todayIso).reduce((s,x)=>s+Number(x.amount||0),0),pendingOut=out.filter(x=>!(x.status==='pago'&&x.date<=todayIso)).reduce((s,x)=>s+Number(x.amount||0),0),transferTotal=trs.reduce((s,x)=>s+Number(x.amount||0),0),wallet=await walletSnapshot(env,userId,sharing),periodResult=scope==='shared'?realIn+transferTotal-realOut:realIn-realOut-transferTotal;
  return {scope,from,to,summary:{income:realIn,expenses:realOut,receivable:plannedIn,pending:pendingOut,transfers:transferTotal,period_result:periodResult,current_balance:scope==='shared'?wallet.shared_balance:wallet.personal_balance,real_income_total:realIn},personal:scope==='personal'?{incomes:inc,expenses:out}:null,shared:scope==='shared'?{incomes:inc,expenses:out,contributions:(contributions.results||[]).map(x=>({...x,amount:fromCents(x.amount)}))}:null,transfers:trs};
}'''
w=replace_func(w,'walletReport',report_worker)
old="if(path==='/api/wallet/report'&&request.method==='GET')return json(await walletReport(env,userId));"
need(w,old,'rota relatório')
new="if(path==='/api/wallet/report'&&request.method==='GET'){const rs=url.searchParams.get('scope'),rf=url.searchParams.get('from'),rt=url.searchParams.get('to');try{return json(await walletReport(env,userId,rs,rf,rt))}catch(e){return json({error:e.message||'Não foi possível gerar o relatório.'},400)}}"
w=w.replace(old,new,1)

# -----------------------------------------------------------------------------
# Frontend: página chama-se somente Relatório. Filtro simples e PDF A4 gerado
# localmente, sem dependência externa e sem enviar dados financeiros a terceiros.
# -----------------------------------------------------------------------------
load_report=r'''async function loadWalletReport(force=false){const f=ritmoReportFilter();if(state.walletReportBusy||(!force&&state.walletReport&&state.walletReport.scope===f.scope&&state.walletReport.from===f.from&&state.walletReport.to===f.to))return;state.walletReportBusy=true;try{state.walletReport=await api(`/api/wallet/report?scope=${encodeURIComponent(f.scope)}&from=${encodeURIComponent(f.from)}&to=${encodeURIComponent(f.to)}`,{headers:{'cache-control':'no-cache'}});if(state.page==='reports')renderApp(false)}catch(e){toast(e.message)}finally{state.walletReportBusy=false}}'''
a=replace_func(a,'loadWalletReport',load_report)

report_ui=r'''
function ritmoReportFilter(){if(!state.reportFilter){const t=financeToday();state.reportFilter={scope:state.data?.scope==='shared'&&sharedActive()?'shared':'personal',from:t.slice(0,7)+'-01',to:t}}if(state.reportFilter.scope==='shared'&&!sharedActive())state.reportFilter.scope='personal';return state.reportFilter}
function ritmoReportRows(rows,type){if(!rows?.length)return '<div class="wallet-empty-line">Nenhum lançamento neste período.</div>';return rows.slice(0,10).map(x=>`<div class="report-line"><div><strong>${esc(x.description)}</strong><small>${dateBR(x.date)} • ${esc(x.category||'Outros')}${x.created_by_name?` • ${esc(x.created_by_name.split(' ')[0])}`:''}${type==='expense'?` • ${x.status==='pago'?'Pago':'Pendente'}`:''}</small></div><b class="${type==='income'?'in':'out'}">${type==='income'?'+':'−'} ${money(x.amount)}</b></div>`).join('')}
function ritmoPdfEsc(v){return String(v??'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ')}
function ritmoPdfBytes(v){const map={8211:150,8212:151,8216:145,8217:146,8220:147,8221:148,8226:149,8364:128};const out=[];for(const ch of String(v)){const c=ch.codePointAt(0);out.push(c<=255?c:(map[c]||63))}return Uint8Array.from(out)}
function ritmoPdfByteLength(v){return ritmoPdfBytes(v).length}
function ritmoBuildReportPdf(model){
  const scope=model.scope==='shared'?'shared':'personal',data=scope==='shared'?model.shared:model.personal,s=model.summary||{},profile=state.data?.profile||{},partner=state.data?.sharing?.partner||{},label=scope==='shared'?`Casal • ${profile.name?.split(' ')[0]||''} & ${partner.name?.split(' ')[0]||''}`:`Pessoal • ${profile.name||''}`,pages=[];let stream='',y=0,pageNo=0;
  const txt=(x,yy,size,text,bold=false,color='0.16 0.17 0.18')=>`${color} rg BT /F${bold?2:1} ${size} Tf 1 0 0 1 ${x} ${yy} Tm (${ritmoPdfEsc(text)}) Tj ET\n`,line=(x1,yy1,x2,yy2,color='0.88 0.88 0.86')=>`${color} RG 0.6 w ${x1} ${yy1} m ${x2} ${yy2} l S\n`,box=(x,yy,wid,hei,color='0.965 0.965 0.95')=>`${color} rg ${x} ${yy} ${wid} ${hei} re f\n`,short=(v,n=48)=>{v=String(v||'');return v.length>n?v.slice(0,n-1)+'…':v},right=(v,x=550,size=9)=>Math.max(400,x-String(v).length*size*.48);
  function begin(first=false){if(stream)pages.push(stream);pageNo++;stream=box(0,0,595,842,'1 1 1')+txt(38,805,20,'Ritmo',true,'0.059 0.298 0.361')+txt(38,783,11,'Relatório',true)+txt(38,766,8,label,false,'0.42 0.43 0.43')+txt(557-String(`Página ${pageNo}`).length*4,766,8,`Página ${pageNo}`,false,'0.42 0.43 0.43')+line(38,752,557,752);y=first?650:724;if(first){stream+=txt(38,731,9,`Período: ${dateBR(model.from)} a ${dateBR(model.to)}`,false,'0.36 0.37 0.37');const cards=[['Entradas',money(s.income||0),'0.20 0.48 0.30'],['Saídas',money(s.expenses||0),'0.66 0.25 0.23'],[scope==='shared'?'Contribuições':'Transferido ao casal',money(s.transfers||0),'0.62 0.45 0.18'],['Saldo atual',money(s.current_balance||0),'0.059 0.298 0.361']];cards.forEach((c,i)=>{const x=38+i*130;stream+=box(x,674,121,48,'0.972 0.972 0.963')+txt(x+9,707,7.5,c[0],false,'0.43 0.44 0.44')+txt(x+9,687,11,c[1],true,c[2])});stream+=txt(38,658,7.5,`Resultado realizado do período: ${money(s.period_result||0)}. Transferências não são contabilizadas como receita.`,false,'0.43 0.44 0.44')}}
  const ensure=h=>{if(y-h<55)begin(false)};
  function section(title,rows,type){ensure(34);stream+=txt(38,y,11,title,true);y-=16;stream+=box(38,y-4,519,18,'0.965 0.965 0.955')+txt(43,y+1,7,'DATA',true,'0.43 0.44 0.44')+txt(96,y+1,7,'DESCRIÇÃO',true,'0.43 0.44 0.44')+txt(345,y+1,7,'DETALHE',true,'0.43 0.44 0.44')+txt(505,y+1,7,'VALOR',true,'0.43 0.44 0.44');y-=22;if(!rows?.length){stream+=txt(43,y,8,'Nenhum lançamento neste período.',false,'0.48 0.49 0.49');y-=22;return}for(const r of rows){ensure(27);const amount=money(r.amount||0),detail=type==='transfer'?(scope==='shared'?`${r.created_by_name||'Pessoa'} • contribuição`:'Para o casal'):`${r.category||'Outros'}${type==='expense'?` • ${r.status==='pago'?'Pago':'Pendente'}`:''}`;stream+=txt(43,y,7.5,dateBR(r.date))+txt(96,y,8,short(type==='transfer'?(r.description||'Transferência para o casal'):r.description,42),true)+txt(345,y,7.5,short(detail,28),false,'0.38 0.39 0.39')+txt(right(amount),y,8,amount,true,type==='income'?'0.20 0.48 0.30':type==='expense'?'0.66 0.25 0.23':'0.62 0.45 0.18')+line(43,y-8,552,y-8);y-=24}}
  begin(true);section('Entradas',data?.incomes||[],'income');section('Saídas',data?.expenses||[],'expense');if((model.transfers||[]).length)section(scope==='shared'?'Contribuições para o casal':'Transferências para o casal',model.transfers||[],'transfer');pages.push(stream);
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','',"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"],pageIds=[];
  for(const content of pages){const cid=objects.length;objects.push(`<< /Length ${ritmoPdfByteLength(content)} >>\nstream\n${content}endstream`);const pid=objects.length;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);pageIds.push(pid)}objects[2]=`<< /Type /Pages /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const parts=[],offsets=[0];let pos=0;const push=v=>{const b=ritmoPdfBytes(v);parts.push(b);pos+=b.length};push('%PDF-1.4\n%Ritmo\n');for(let i=1;i<objects.length;i++){offsets[i]=pos;push(`${i} 0 obj\n${objects[i]}\nendobj\n`)}const xref=pos;let table=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)table+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';table+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;push(table);return new Blob(parts,{type:'application/pdf'})
}
async function ritmoGenerateReportPdf(){const f=ritmoReportFilter();if(!state.walletReport||state.walletReport.scope!==f.scope||state.walletReport.from!==f.from||state.walletReport.to!==f.to)await loadWalletReport(true);const r=state.walletReport;if(!r)return toast('Não foi possível preparar o relatório.');try{const blob=ritmoBuildReportPdf(r),scope=f.scope==='shared'?'casal':'pessoal',name=`ritmo-relatorio-${scope}-${f.from}-a-${f.to}.pdf`,file=new File([blob],name,{type:'application/pdf'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Relatório Ritmo'})}else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),8000)}toast('Relatório em PDF gerado.')}catch(e){if(e?.name!=='AbortError')toast('Não foi possível gerar o PDF agora.') }}
function reportsPage(){const f=ritmoReportFilter(),r=state.walletReport,s=r?.summary||{},data=r?(f.scope==='shared'?r.shared:r.personal):null;return `${head('Relatório','Escolha a carteira e o período. Transferências aparecem separadas e não viram receita.')}<section class="report-filter-panel"><div class="report-scope-seg"><button type="button" data-report-scope="personal" class="${f.scope==='personal'?'active':''}">${ic('user',15)} Pessoal</button><button type="button" data-report-scope="shared" class="${f.scope==='shared'?'active':''}" ${!sharedActive()?'disabled':''}>${ic('users',15)} Casal</button></div><div class="report-date-grid"><label>Data inicial<input id="reportFrom" type="date" value="${f.from}"></label><label>Data final<input id="reportTo" type="date" value="${f.to}"></label><button class="btn btn-secondary" type="button" data-report-apply>Aplicar</button><button class="btn btn-primary" type="button" data-report-pdf ${!r?'disabled':''}>${ic('down',15)} Gerar PDF</button></div></section>${state.walletReportBusy&&!r?'<div class="panel report-loading"><strong>Preparando relatório...</strong></div>':r?`<div class="report-summary-grid"><article><small>Entradas</small><strong>${money(s.income||0)}</strong><span>${money(s.receivable||0)} a receber</span></article><article><small>Saídas</small><strong>${money(s.expenses||0)}</strong><span>${money(s.pending||0)} a pagar</span></article><article><small>${f.scope==='shared'?'Contribuições':'Transferido ao casal'}</small><strong>${money(s.transfers||0)}</strong><span>não conta como receita</span></article><article><small>Saldo atual</small><strong>${money(s.current_balance||0)}</strong><span>da carteira selecionada</span></article></div><section class="report-section"><div class="panel-title"><div><h3>Entradas</h3><small>${dateBR(f.from)} a ${dateBR(f.to)}</small></div></div>${ritmoReportRows(data?.incomes,'income')}</section><section class="report-section"><div class="panel-title"><div><h3>Saídas</h3><small>${dateBR(f.from)} a ${dateBR(f.to)}</small></div></div>${ritmoReportRows(data?.expenses,'expense')}</section>${r.transfers?.length?`<section class="report-section"><div class="panel-title"><div><h3>${f.scope==='shared'?'Contribuições para o casal':'Transferências para o casal'}</h3><small>Separadas de entradas e saídas</small></div></div>${r.transfers.map(x=>`<div class="report-line"><div><strong>${f.scope==='shared'?`${esc((x.created_by_name||'Pessoa').split(' ')[0])} contribuiu`:'Transferência para o casal'}</strong><small>${dateBR(x.date)}${x.description?` • ${esc(x.description)}`:''}</small></div><b>${money(x.amount)}</b></div>`).join('')}</section>`:''}`:'<div class="panel report-loading"><strong>Escolha o período para preparar o relatório.</strong></div>'}`}
'''
a=replace_func(a,'reportsPage',report_ui)

# Relatório visível no Menu, sem nome composto.
p,q=js_function_bounds(a,'morePage');more=a[p:q]
if 'data-page="reports"' not in more:
    marker='<button class="ios-list-row" data-page="calendar">'
    need(more,marker,'menu calendário')
    report_row='<button class="ios-list-row" data-page="reports"><span class="more-icon report-tone">${ic(\'wallet\',21)}</span><div><strong>Relatório</strong><small>Períodos, entradas, saídas e saldos em PDF.</small></div>${ic(\'chev\',16)}</button>\n      '
    more=more.replace(marker,report_row+marker,1);a=a[:p]+more+a[q:]

# Bindings do filtro e do PDF.
old_bind="$$('[data-page=\"reports\"]').forEach(b=>b.addEventListener('click',()=>setTimeout(loadWalletReport,0)));"
need(a,old_bind,'binding relatório')
new_bind=old_bind+"if(state.page==='reports')setTimeout(()=>loadWalletReport(false),0);$$('[data-report-scope]').forEach(b=>b.onclick=()=>{const f=ritmoReportFilter(),scope=b.dataset.reportScope;if(scope==='shared'&&!sharedActive())return;f.scope=scope;state.walletReport=null;loadWalletReport(true)});$('[data-report-apply]')?.addEventListener('click',()=>{const f=ritmoReportFilter(),from=$('#reportFrom')?.value,to=$('#reportTo')?.value;if(!from||!to)return toast('Escolha a data inicial e a data final.');f.from=from;f.to=to;if(f.from>f.to){const x=f.from;f.from=f.to;f.to=x}state.walletReport=null;loadWalletReport(true)});$('[data-report-pdf]')?.addEventListener('click',ritmoGenerateReportPdf);"
a=a.replace(old_bind,new_bind,1)

# CSS do módulo Relatório.
css+=r'''
.report-filter-panel{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:end;padding:11px;border:1px solid var(--line);background:var(--surface-solid);border-radius:15px;margin-bottom:10px}.report-scope-seg{display:flex;padding:3px;border-radius:11px;background:var(--surface2);gap:3px}.report-scope-seg button{border:0;background:transparent;color:var(--muted);padding:8px 11px;border-radius:9px;font:inherit;font-size:9px;font-weight:700;display:flex;gap:5px;align-items:center}.report-scope-seg button.active{background:var(--surface-solid);color:var(--primary);box-shadow:0 2px 8px rgba(0,0,0,.05)}.report-scope-seg button:disabled{opacity:.4}.report-date-grid{display:grid;grid-template-columns:minmax(140px,1fr) minmax(140px,1fr) auto auto;gap:7px;align-items:end}.report-date-grid label{font-size:8px;color:var(--muted)}.report-date-grid input{display:block;width:100%;margin-top:4px;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:10px;padding:8px 9px;font:inherit}.report-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.report-tone{background:color-mix(in srgb,var(--gold) 12%,var(--surface2));color:var(--gold)}
@media(max-width:760px){.report-filter-panel{grid-template-columns:1fr}.report-scope-seg button{flex:1;justify-content:center}.report-date-grid{grid-template-columns:1fr 1fr}.report-date-grid .btn{width:100%;min-height:38px}.report-summary-grid{grid-template-columns:1fr 1fr}}
'''

for marker in ['Relatório','Gerar PDF','data-report-scope','ritmoBuildReportPdf','/api/wallet/report?scope=','Transferências aparecem separadas']:
    if marker not in a: raise SystemExit('Relatório: marcador ausente '+marker)
if 'extrato' in a.lower(): raise SystemExit('Relatório: nomenclatura Extrato não deve aparecer')
for marker in ['walletReport(env,userId,scope','transaction_type=\'transfer\'','date>=? AND date<=?']:
    if marker not in w: raise SystemExit('Relatório backend: marcador ausente '+marker)

app.write_text(a);worker.write_text(w);cssp.write_text(css)
print('Ritmo V1: Relatório com filtro Pessoal/Casal, período e PDF A4 aplicado.')
