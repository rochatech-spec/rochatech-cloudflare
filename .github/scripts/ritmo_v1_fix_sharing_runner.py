from pathlib import Path

# Ajusta os geradores antes de aplicá-los ao fonte reconstruído.
p=Path('.github/scripts/ritmo_v1_sharing_patch.py')
s=p.read_text()

# Funções podem ser async ou sync.
old_func="""def areplace_func(name,next_name,new_code):
    global a
    p=a.find('function '+name+'(')
    q=a.find('\\nfunction '+next_name+'(',p)
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
new_func="""def areplace_func(name,next_name,new_code):
    global a
    p=a.find('async function '+name+'(')
    if p<0: p=a.find('function '+name+'(')
    q=a.find('\\nasync function '+next_name+'(',p)
    if q<0: q=a.find('\\nfunction '+next_name+'(',p)
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
if old_func in s:
    s=s.replace(old_func,new_func,1)

# Formulário de Meta: mesma função, mas sem templates JavaScript aninhados.
goal_old=s.find("old=\"if(type==='goal')")
goal_apply=s.find("\narep(old,new,'tipo meta')",goal_old)
if goal_old<0 or goal_apply<0:
    raise SystemExit('Definição de meta do Compartilhamento não encontrada.')
new_line=s.find('\nnew=',goal_old)
if new_line<0 or new_line>goal_apply:
    raise SystemExit('Bloco new da meta não encontrado.')

safe_new="""new=r'''if(type==='goal'){
  title=item?'Editar meta':'Nova meta';
  let mode='';
  if(item){
    mode='<div class="goal-mode-readonly full"><div><strong>'+(state.data.scope==='shared'?'Meta em conjunto':'Meta individual')+'</strong><small>O tipo não muda durante a edição.</small></div></div>';
  }else if(sharedActive()){
    const ps=state.data.scope==='personal'?' selected':'',ss=state.data.scope==='shared'?' selected':'';
    mode='<label class="field full">Tipo da meta<select name="goal_scope"><option value="personal"'+ps+'>Individual</option><option value="shared"'+ss+'>Juntos</option></select></label>';
  }else{
    mode='<input type="hidden" name="goal_scope" value="personal"><div class="goal-mode-readonly full"><div><strong>Meta individual</strong><small>Conecte um parceiro em Compartilhamento para criar metas juntos.</small></div></div>';
  }
  fields=mode+input('name','Nome da meta',item?.name,'Ex.: Viagem')+moneyInput('target_amount','Valor alvo',item?.target_amount)+select('category','Categoria',['Viagem','Carro','Casa','Estudos','Reserva de emergência','Personalizado'],item?.category)+dateInput('deadline','Prazo',item?.deadline||'')+input('notes','Observação',item?.notes,'Opcional','full');
}'''"""
s=s[:new_line+1]+safe_new+s[goal_apply:]

# Alterar Meta somente dentro de modalHtml.
s=s.replace("arep(old,new,'tipo meta')",'''_modal=a.find('function modalHtml(){')
if _modal<0: raise SystemExit('APP modalHtml não encontrado')
p=a.find("if(type==='goal'){",_modal)
q=a.find("\\nif(type==='payment'||type==='credit')",p)
if p<0 or q<0: raise SystemExit('APP bloco de meta do modal não encontrado')
a=a[:p]+new+a[q:]''',1)

# goalCard: trocar somente até a próxima função real.
unsafe="areplace_func('goalCard','updateSystemNow',goal_card)"
safe="""import re as _re
_gp=a.find('function goalCard(')
if _gp<0: raise SystemExit('APP goalCard não encontrado')
_gm=_re.search(r'\\n(?:async\\s+)?function\\s+[A-Za-z0-9_]+\\s*\\(',a[_gp+1:])
if not _gm: raise SystemExit('APP próxima função após goalCard não encontrada')
_gq=_gp+1+_gm.start()
a=a[:_gp]+goal_card+a[_gq:]"""
if unsafe in s:
    s=s.replace(unsafe,safe,1)
elif safe not in s:
    raise SystemExit('Troca segura de goalCard não encontrada.')
p.write_text(s)

# Organização iOS: assinatura flexível entre funções.
p_ios=Path('.github/scripts/ritmo_v1_ios_organization_patch.py')
i=p_ios.read_text()
old_ios="""def replace_between(start_marker,end_marker,new_text,label):
    global a
    p=a.find(start_marker)
    q=a.find(end_marker,p+len(start_marker))
    if p<0 or q<0:
        raise SystemExit(f'Trecho não encontrado: {label}')
    a=a[:p]+new_text+'\\n'+a[q:]
"""
new_ios="""def replace_between(start_marker,end_marker,new_text,label):
    global a
    import re
    p=a.find(start_marker)
    if p<0 and start_marker.startswith('function '):
        name=start_marker[len('function '):].split('(',1)[0]
        m=re.search(r'(?:async\\s+)?function\\s+'+re.escape(name)+r'\\s*\\(',a)
        p=m.start() if m else -1
    q=a.find(end_marker,p+1 if p>=0 else 0)
    if q<0 and end_marker.startswith('function '):
        name=end_marker[len('function '):].split('(',1)[0]
        base=p+1 if p>=0 else 0
        m=re.search(r'(?:async\\s+)?function\\s+'+re.escape(name)+r'\\s*\\(',a[base:])
        q=base+m.start() if m else -1
    if p<0 or q<0:
        raise SystemExit(f'Trecho não encontrado: {label}')
    a=a[:p]+new_text+'\\n'+a[q:]
"""
if old_ios in i:
    i=i.replace(old_ios,new_ios,1)
p_ios.write_text(i)

print('Ritmo V1: modal de Meta estabilizado e telas preservadas.')
