import type { PageKey } from '../domain/types'
import { Icon, type IconName } from '../ui/Icon'

const items: Array<{page:PageKey;icon:IconName;title:string;copy:string}> = [
  {page:'report',icon:'report',title:'Relatório',copy:'Pessoal ou Casal, com período e PDF.'},
  {page:'sharing',icon:'users',title:'Compartilhamento',copy:'Perfil Casal, convites e contribuições.'},
  {page:'calendar',icon:'calendar',title:'Calendário',copy:'Vencimentos, entradas e compromissos.'},
  {page:'insights',icon:'spark',title:'Insights',copy:'Leituras simples dos dados já carregados.'},
  {page:'settings',icon:'settings',title:'Configurações',copy:'Tema, avisos e segurança do acesso.'},
  {page:'profile',icon:'user',title:'Meu perfil',copy:'Nome, usuário e dados da sua conta.'},
]

export function MenuPage({ onOpen }: { onOpen: (page: PageKey)=>void }) {
  return <div className="page-stack">
    <header className="page-header"><div><small>MENU</small><h1>Tudo no lugar certo</h1><p>Recursos complementares sem lotar a navegação principal.</p></div></header>
    <div className="menu-grid">{items.map((item)=><button className="menu-card" type="button" key={item.page} onClick={()=>onOpen(item.page)}><span className={`menu-icon ${item.page}`}><Icon name={item.icon}/></span><div><strong>{item.title}</strong><small>{item.copy}</small></div><Icon name="chevron" className="menu-chevron"/></button>)}</div>
  </div>
}
