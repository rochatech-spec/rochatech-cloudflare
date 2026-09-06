from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
a=app.read_text()
old_start=r"\nasync function ritmoOpenCouplePage"
old_end=r"ritmoOpenCouplePage(b.dataset.couplePage)});\n"
if old_start not in a or old_end not in a:
    raise SystemExit('Marcadores de quebra literal do fluxo casal não encontrados')
a=a.replace(old_start,"\nasync function ritmoOpenCouplePage",1)
a=a.replace(old_end,"ritmoOpenCouplePage(b.dataset.couplePage)});\n",1)
app.write_text(a)
print('Ritmo V1: quebra de linha do fluxo casal corrigida para JavaScript válido.')
