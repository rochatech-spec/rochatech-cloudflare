from pathlib import Path
import sys

root=Path(sys.argv[1]);p=root/'ci-commercial-audit.mjs'
if not p.exists():raise SystemExit('Auditoria comercial base não encontrada')
s=p.read_text()

old="security:{webauthn_count:1},incomes:"
new="security:{webauthn_count:1},wallet:{personal_balance:1500,shared_balance:4500,personal_income:4000,personal_expenses:0,sent_to_shared:2500,shared_income:0,shared_expenses:0,shared_transfers:4500,contributions:[{owner_user_id:'1',name:'Flavio Neto',username:'flavio.neto',amount:2500},{owner_user_id:'2',name:'Parceiro Teste',username:'parceiro',amount:2000}],transfers:[{id:'t1',owner_user_id:'1',created_by:'1',created_by_name:'Flavio Neto',amount:2500,date:'2026-09-03',description:'Casa',can_edit:true},{id:'t2',owner_user_id:'2',created_by:'2',created_by_name:'Parceiro Teste',amount:2000,date:'2026-09-04',description:'Mercado',can_edit:false}]},incomes:"
if old not in s:raise SystemExit('Fixture wallet não localizado')
s=s.replace(old,new,1)

route="if(u.pathname==='/api/version'){"
report_route="if(u.pathname==='/api/wallet/report'){const scope=u.searchParams.get('scope')==='shared'?'shared':'personal',from=u.searchParams.get('from')||'2026-09-01',to=u.searchParams.get('to')||'2026-09-06';const personal={incomes:[{id:'i1',description:'Salário',category:'Salário',amount:4000,date:'2026-09-02'}],expenses:[]},shared={incomes:[{id:'si1',description:'Venda do casal',category:'Venda',amount:800,date:'2026-09-02',created_by_name:'Flavio Neto'}],expenses:[{id:'se1',description:'Mercado',category:'Supermercado',amount:120,date:'2026-09-05',status:'pago',created_by_name:'Parceiro Teste'}],contributions:[{owner_user_id:'1',name:'Flavio Neto',amount:2500},{owner_user_id:'2',name:'Parceiro Teste',amount:2000}]},transfers=scope==='shared'?[{id:'t1',owner_user_id:'1',created_by_name:'Flavio Neto',amount:2500,date:'2026-09-03',description:'Casa'},{id:'t2',owner_user_id:'2',created_by_name:'Parceiro Teste',amount:2000,date:'2026-09-04',description:'Mercado'}]:[{id:'t1',owner_user_id:'1',created_by_name:'Flavio Neto',amount:2500,date:'2026-09-03',description:'Casa'}],summary=scope==='shared'?{income:800,expenses:120,receivable:0,pending:0,transfers:4500,period_result:5180,current_balance:4500,real_income_total:800}:{income:4000,expenses:0,receivable:0,pending:0,transfers:2500,period_result:1500,current_balance:1500,real_income_total:4000};res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({scope,from,to,summary,personal:scope==='personal'?personal:null,shared:scope==='shared'?shared:null,transfers}));return}"
if route not in s:raise SystemExit('Rota version não localizada')
s=s.replace(route,report_route+route,1)

marker="const more=document.querySelector('[data-page=\"more\"]');"
insert="""await click('[data-page=\"more\"]','menu relatorio');await click('[data-page=\"reports\"]','relatorio');ok(text('Relatório'),'tela relatorio');ok(!/extrato/i.test(root.innerText),'nome somente Relatório');let pdfBtn=document.querySelector('[data-report-pdf]');for(let i=0;i<30&&(!pdfBtn||pdfBtn.disabled);i++){await wait(40);pdfBtn=document.querySelector('[data-report-pdf]')}ok(!!pdfBtn&&!pdfBtn.disabled,'dados do relatorio');let pdfType='',pdfSize=0,downloadClicked=false;const oldCreate=URL.createObjectURL,oldAnchorClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{pdfType=b?.type||'';pdfSize=Number(b?.size||0);return 'blob:ritmo-ci-pdf'};HTMLAnchorElement.prototype.click=function(){downloadClicked=true};pdfBtn.click();await wait(180);URL.createObjectURL=oldCreate;HTMLAnchorElement.prototype.click=oldAnchorClick;ok(pdfType==='application/pdf'&&pdfSize>700&&downloadClicked,'PDF A4 gerado pelo botão');let rf=document.querySelector('#reportFrom'),rt=document.querySelector('#reportTo');ok(!!rf&&!!rt,'filtro por periodo');rf.value='2026-09-01';rt.value='2026-09-05';document.querySelector('[data-report-apply]')?.click();await wait(220);rf=document.querySelector('#reportFrom');rt=document.querySelector('#reportTo');ok(rf?.value==='2026-09-01'&&rt?.value==='2026-09-05','periodo aplicado');\n"""+marker
if marker not in s:raise SystemExit('Ponto de auditoria do menu não encontrado')
s=s.replace(marker,insert,1)

# Regras estruturais adicionais: transferência não pode usar receitas/despesas artificiais.
head="const appCode=fs.readFileSync(path.join(dist,'app.js'),'utf8'),workerCode=fs.readFileSync(path.join(dist,'_worker.js'),'utf8');"
extra=head+"\nfor(const m of ['wallet_transactions','transaction_type=\\'transfer\\'','/api/wallet/transfers','walletPersonalBalanceCents'])if(!workerCode.includes(m))throw new Error('Carteira ausente no Worker: '+m);for(const m of ['Destino da entrada','Pagar com','Transferir para o casal','ritmoBuildReportPdf','Gerar PDF','compact-money-row','sharing-space-row'])if(!appCode.includes(m))throw new Error('Carteira/Relatório ausente no app: '+m);const transferBlock=workerCode.slice(workerCode.indexOf(\"if(path==='/api/wallet/transfers'\"),workerCode.indexOf('const transferMatch='));if(/INSERT INTO (?:shared_)?(?:incomes|expenses)/i.test(transferBlock))throw new Error('Transferência implementada como receita/despesa artificial');"
if head not in s:raise SystemExit('Cabeçalho da auditoria não encontrado')
s=s.replace(head,extra,1)

p.write_text(s)
print('Ritmo V1: auditoria de carteiras, período e PDF integrada ao navegador comercial pelo fluxo real do usuário.')
