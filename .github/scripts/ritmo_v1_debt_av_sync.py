from pathlib import Path
import sys

root=Path(sys.argv[1]); worker=root/'_worker.js'; app=root/'public'/'app.js'
s=worker.read_text(); a=app.read_text()

# No Ritmo, AV = abatimento em dinheiro da dívida. Ele reduz saldo devedor e
# cria uma saída vinculada. O vínculo debt_event_id evita dupla contagem e
# permite exclusão sincronizada. Haver permanece disponível para crédito/compensação.

# Backend pessoal: a base já possui debt_event_id/origin. Localiza a rota de pagamento
# e garante descrição explícita de AV quando o cliente enviar kind=av.
# A rota compartilhada é adaptada de payment para aceitar av como sinônimo financeiro.
old="sharedMatch=path.match(/^\\/api\\/shared\\/debts\\/([a-f0-9-]+)\\/(payment|credit)$/i);"
if old in s:
    s=s.replace(old,"sharedMatch=path.match(/^\\/api\\/shared\\/debts\\/([a-f0-9-]+)\\/(payment|av|credit)$/i);",1)
    s=s.replace("kind=sharedMatch[2]==='payment'?'pagamento':'haver'","kind=['payment','av'].includes(sharedMatch[2])?'pagamento':'haver'",1)

# A saída vinculada recebe rótulo de abatimento, sem mudar a semântica de caixa.
s=s.replace("'Pagamento de dívida','Dívidas',amount,date,date,b.notes||null,debtId,eventId", "(sharedMatch[2]==='av'?'AV / abatimento de dívida':'Pagamento de dívida'),'Dívidas',amount,date,date,b.notes||null,debtId,eventId",1)

worker.write_text(s)

# UI: oferece AV como ação principal. Mantemos Pagamento para quitação/parcela comum.
needle='<button class="btn btn-secondary" data-debt-payment="${d.id}" ${balance<=0?\'disabled\':\'\'}>Pagamento</button><button class="btn btn-secondary" data-debt-credit="${d.id}" ${balance<=0?\'disabled\':\'\'}>Haver</button>'
if needle in a:
    repl='<button class="btn btn-secondary" data-debt-av="${d.id}" ${balance<=0?\'disabled\':\'\'}>AV</button><button class="btn btn-secondary" data-debt-payment="${d.id}" ${balance<=0?\'disabled\':\'\'}>Pagamento</button><button class="btn btn-secondary" data-debt-credit="${d.id}" ${balance<=0?\'disabled\':\'\'}>Haver</button>'
    a=a.replace(needle,repl,1)

# Liga AV reaproveitando o modal seguro de pagamento, mas muda título/endpoint quando compartilhado.
bind="$$('[data-debt-payment]').forEach(b=>b.onclick=()=>openDebtEvent(b.dataset.debtPayment,'payment'));"
if bind in a and "data-debt-av" not in a[a.find(bind):a.find(bind)+400]:
    a=a.replace(bind,"$$('[data-debt-av]').forEach(b=>b.onclick=()=>openDebtEvent(b.dataset.debtAv,'av'));"+bind,1)

# Se openDebtEvent só reconhece payment/credit, AV usa mesma lógica de saída do payment.
a=a.replace("kind==='payment'?'Pagamento':'Haver'","['payment','av'].includes(kind)?(kind==='av'?'AV / abatimento':'Pagamento'):'Haver'")
a=a.replace("kind==='payment'?'payment':'credit'","kind==='av'?'av':(kind==='payment'?'payment':'credit')")

app.write_text(a)
print('Ritmo V1: AV integrado a dívidas e sincronizado com Saídas.')
