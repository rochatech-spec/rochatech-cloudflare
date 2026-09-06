from pathlib import Path

p=Path('.github/scripts/ritmo_v1_ios_organization_patch.py')
s=p.read_text()
old="""def replace_between(start_marker,end_marker,new_text,label):
    global a
    p=a.find(start_marker)
    q=a.find(end_marker,p+len(start_marker))
    if p<0 or q<0:
        raise SystemExit(f'Trecho não encontrado: {label}')
    a=a[:p]+new_text+'\\n'+a[q:]
"""
new="""def replace_between(start_marker,end_marker,new_text,label):
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
        m=re.search(r'(?:async\\s+)?function\\s+'+re.escape(name)+r'\\s*\\(',a[p+1 if p>=0 else 0:])
        q=(p+1+m.start()) if m and p>=0 else (m.start() if m else -1)
    if p<0 or q<0:
        names=re.findall(r'(?:async\\s+)?function\\s+([A-Za-z0-9_]+)\\s*\\(',a)
        raise SystemExit(f'Trecho não encontrado: {label}; funções próximas: '+','.join(names[:80]))
    a=a[:p]+new_text+'\\n'+a[q:]
"""
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('Helper da organização iOS não encontrado.')
p.write_text(s)
print('Executor da organização iOS robustecido para assinaturas flexíveis.')
