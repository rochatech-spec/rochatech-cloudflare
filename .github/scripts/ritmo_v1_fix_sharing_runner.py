from pathlib import Path

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
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
if old_func in s:
    s=s.replace(old_func,new_func,1)
elif new_func not in s:
    raise SystemExit('Trecho do executor de funções não encontrado.')

old_meta="arep(old,new,'tipo meta')"
new_meta="""p=a.find(\"if(type==='goal'){\")
q=a.find(\"\\nif(type==='payment'||type==='credit')\",p)
if p<0 or q<0: raise SystemExit('APP bloco de meta não encontrado')
a=a[:p]+new+a[q:]"""
if old_meta in s:
    s=s.replace(old_meta,new_meta,1)
elif new_meta not in s:
    raise SystemExit('Trecho de meta compartilhada não encontrado.')

p.write_text(s)
print('Executor de compartilhamento robustecido para funções async/sync e formulário de metas.')
