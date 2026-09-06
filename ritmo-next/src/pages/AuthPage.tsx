import { useState } from 'react'

export function AuthPage({ onLogin, onRegister }: { onLogin:(username:string,password:string)=>Promise<void>; onRegister:(name:string,username:string,password:string)=>Promise<void> }) {
  const [mode,setMode]=useState<'login'|'register'>('login')
  const [name,setName]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{if(mode==='login')await onLogin(username,password);else await onRegister(name,username,password)}catch(err){setError(err instanceof Error?err.message:'Não foi possível entrar.')}finally{setBusy(false)}}
  return <main className="auth-shell"><section className="auth-brand"><span className="auth-logo">R</span><strong>Ritmo</strong><p>Gestão pessoal, no seu ritmo.</p></section><section className="auth-card"><div className="auth-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Entrar</button><button type="button" className={mode==='register'?'active':''} onClick={()=>setMode('register')}>Primeiro acesso</button></div><form onSubmit={submit}>{mode==='register'&&<label className="field"><span>Nome</span><input value={name} onChange={(e)=>setName(e.target.value)} autoComplete="name" minLength={2} required/></label>}<label className="field"><span>Usuário</span><input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" minLength={3} required/></label><label className="field"><span>Senha</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} required/></label>{error&&<div className="inline-alert">{error}</div>}<button className="primary-button wide auth-submit" disabled={busy} type="submit">{busy?'Aguarde…':mode==='login'?'Entrar':'Criar minha conta'}</button></form><small className="auth-note">Sua senha não fica salva neste aparelho.</small></section></main>
}
