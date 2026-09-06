from pathlib import Path
import sys

# Executa o patch principal com uma correção pequena no helper de substituição:
# algumas funções do app são async e o helper original procurava apenas function.
patch = Path(__file__).with_name('ritmo_v1_sharing_patch.py')
src = patch.read_text()
old = "    q=a.find('\\nfunction '+next_name+'(',p)\n    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')"
new = "    q=a.find('\\nfunction '+next_name+'(',p)\n    if q<0: q=a.find('\\nasync function '+next_name+'(',p)\n    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')"
if old not in src:
    raise SystemExit('Helper do patch de compartilhamento não encontrado.')
src = src.replace(old,new,1)
sys.argv = [str(patch), *sys.argv[1:]]
exec(compile(src, str(patch), 'exec'), {'__name__':'__main__','__file__':str(patch)})
