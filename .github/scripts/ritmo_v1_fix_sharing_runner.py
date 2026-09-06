from pathlib import Path

p=Path('.github/scripts/ritmo_v1_sharing_patch.py')
s=p.read_text()
old="""def areplace_func(name,next_name,new_code):
    global a
    p=a.find('function '+name+'(')
    q=a.find('\\nfunction '+next_name+'(',p)
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
new="""def areplace_func(name,next_name,new_code):
    global a
    p=a.find('async function '+name+'(')
    if p<0: p=a.find('function '+name+'(')
    q=a.find('\\nasync function '+next_name+'(',p)
    if q<0: q=a.find('\\nfunction '+next_name+'(',p)
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]
"""
if old not in s:
    if new in s:
        print('Sharing runner já corrigido.')
        raise SystemExit(0)
    raise SystemExit('Trecho do executor de compartilhamento não encontrado.')
p.write_text(s.replace(old,new,1))
print('Executor de compartilhamento corrigido para funções async e sync.')
