from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
a=app.read_text()
markers=[
    (r"\nasync function ritmoOpenCouplePage","\nasync function ritmoOpenCouplePage"),
    (r"}}\ndocument.addEventListener","}}\ndocument.addEventListener"),
    (r"ritmoOpenCouplePage(b.dataset.couplePage)});\n","ritmoOpenCouplePage(b.dataset.couplePage)});\n"),
]
changed=0
for old,new in markers:
    if old in a:
        a=a.replace(old,new,1);changed+=1
if changed<2:
    raise SystemExit(f'Quebras literais esperadas não foram corrigidas: {changed}/3')
app.write_text(a)
print('Ritmo V1: quebras de linha do fluxo casal corrigidas para JavaScript válido.')
