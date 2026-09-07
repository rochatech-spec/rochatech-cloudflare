import { ProfileAvatar } from '../components/ProfileAvatar'
import type { BootstrapData, PageKey } from '../domain/types'
import { Icon, type IconName } from '../ui/Icon'

type MenuItem={page:PageKey;icon:IconName;title:string;copy:string;tone:string}

const resourceItems:MenuItem[]=[
  {page:'report',icon:'report',title:'Relatório',copy:'Período, visão Pessoal ou Casal e PDF.',tone:'report'},
  {page:'sharing',icon:'users',title:'Compartilhamento',copy:'Convites, contribuições e espaço do casal.',tone:'sharing'},
  {page:'calendar',icon:'calendar',title:'Calendário',copy:'Recebimentos, contas, dívidas e prazos.',tone:'calendar'},
  {page:'insights',icon:'spark',title:'Insights',copy:'Leituras e sugestões com base nos seus dados.',tone:'insights'},
]
const appItems:MenuItem[]=[
  {page:'settings',icon:'settings',title:'Configurações',copy:'Aparência, avisos, atalhos e segurança.',tone:'settings'},
  {page:'profile',icon:'user',title:'Meu perfil',copy:'Foto, nome, usuário, senha e conta.',tone:'profile'},
]

export function MenuPage({ data, onOpen }: { data:BootstrapData; onOpen:(page:PageKey)=>void }) {
  const couple=data.sharing.active
  const protectedDevice=Number(data.security?.webauthn_count||0)>0
  return <div className="page-stack ios-menu-page">
    <header className="page-header ios-page-header"><div><small>MENU</small><h1>Seu Ritmo</h1><p>Conta, recursos e preferências organizados como um app — sem cartões gigantes disputando espaço.</p></div></header>

    <button className="ios-account-card" type="button" onClick={()=>onOpen('profile')}>
      <ProfileAvatar profile={data.profile} className="ios-account-avatar"/>
      <span className="ios-account-copy"><strong>{data.profile.name}</strong><small>@{data.profile.username}</small><em>{couple?'Nosso Ritmo conectado':'Conta individual'} · {protectedDevice?'proteção do aparelho ativa':'acesso por senha'}</em></span>
      <Icon name="chevron"/>
    </button>

    <MenuGroup title="Recursos" items={resourceItems} onOpen={onOpen}/>
    <MenuGroup title="Aplicativo" items={appItems} onOpen={onOpen}/>

    <section className="ios-menu-section about-ritmo-section">
      <h2>Sobre</h2>
      <div className="ios-list-card about-ritmo-card">
        <div className="ios-list-row static"><span className="ios-list-icon info-tone"><Icon name="spark"/></span><span className="ios-list-copy"><strong>Ritmo</strong><small>Gestão financeira pessoal e do casal, no seu ritmo.</small></span><b>1.0</b></div>
        <div className="ios-list-row static"><span className="ios-list-icon shield-tone"><Icon name="shield"/></span><span className="ios-list-copy"><strong>Dados protegidos</strong><small>Seus perfis financeiros continuam separados e sincronizados com sua conta.</small></span></div>
      </div>
    </section>
  </div>
}

function MenuGroup({title,items,onOpen}:{title:string;items:MenuItem[];onOpen:(page:PageKey)=>void}){
  return <section className="ios-menu-section"><h2>{title}</h2><div className="ios-list-card">{items.map(item=><button className="ios-list-row" type="button" key={item.page} onClick={()=>onOpen(item.page)}><span className={`ios-list-icon ${item.tone}-tone`}><Icon name={item.icon}/></span><span className="ios-list-copy"><strong>{item.title}</strong><small>{item.copy}</small></span><Icon name="chevron" className="ios-row-chevron"/></button>)}</div></section>
}
