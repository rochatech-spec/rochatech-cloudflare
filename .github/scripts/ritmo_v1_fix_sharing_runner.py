from pathlib import Path

# -----------------------------------------------------------------------------
# Compartilhamento: tolerar funções async/sync e localizar o bloco de Meta
# pela estrutura, não pela linha inteira.
# -----------------------------------------------------------------------------
p=Path('.github/scripts/ritmo_v1_sharing_patch.py')
s=p.read_text()

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
    if a<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
# Não usamos o helper antigo para goalCard porque updateSystemNow fica muito
# depois e isso apagava todas as telas existentes entre as duas funções.
if old_func in s:
    s=s.replace(old_func,new_func,1)
elif new_func not in s:
    # Compatibilidade com versões já robustecidas do helper.
    if "p=a.find('async function '+name+'(')" not in s:
        raise SystemExit('Trecho do executor de funções do Compartilhamento não encontrado.')

old_meta="arep(old,new,'tipo meta')"
new_meta="""p=a.find(\"if(type==='goal'){\")
q=a.find(\"\\nif(type==='payment'||type==='credit')\",p)
if p<0 or q<0: raise SystemExit('APP bloco de meta não encontrado')
a=a[:p]+new+a[q:]"""
if old_meta in s:
    s=s.replace(old_meta,new_meta,1)
elif new_meta not in s:
    raise SystemExit('Trecho de meta compartilhada não encontrado.')

old_goal="areplace_func('goalCard','updateSystemNow',goal_card)"
new_goal="""import re as _re
_gp=a.find('function goalCard(')
if _gp<0: raise SystemExit('APP goalCard não encontrado')
_gm=_re.search(r'\\n(?:async\\s+)?function\\s+[A-Za-z0-9_]+\\s*\\(',a[_gp+1:])
if not _gm: raise SystemExit('APP próxima função após goalCard não encontrada')
_gq=_gp+1+_gm.start()
a=a[:_gp]+goal_card+a[_gq:]"""
if old_goal in s:
    s=s.replace(old_goal,new_goal,1)
elif new_goal not in s:
    raise SystemExit('Troca segura do goalCard não encontrada.')

p.write_text(s)

# -----------------------------------------------------------------------------
# Organização iOS: localizar funções pelo nome com assinatura flexível.
# -----------------------------------------------------------------------------
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
        names=re.findall(r'(?:async\\s+)?function\\s+([A-Za-z0-9_]+)\\s*\\(',a)
        raise SystemExit(f'Trecho não encontrado: {label}; funções: '+','.join(names[:100]))
    a=a[:p]+new_text+'\\n'+a[q:]
"""
if old_ios in i:
    i=i.replace(old_ios,new_ios,1)
elif new_ios not in i:
    if "import re" not in i or "funções:" not in i:
        raise SystemExit('Helper da organização iOS não encontrado.')
p_ios.write_text(i)

print('Compartilhamento corrigido sem apagar telas; executor iOS mantido robusto.')
