import type { BootstrapData, FinancialScope } from '../domain/types'
import { firstName, initials } from '../lib/format'
import { Icon } from '../ui/Icon'

export function ProfileSwitcher({ scope, data, onChange, busy }: { scope: FinancialScope; data: BootstrapData; onChange: (scope: FinancialScope) => void; busy?: boolean }) {
  const partner = data.sharing?.partner
  return (
    <section className="profile-dock" aria-label="Perfil financeiro">
      <button type="button" className={scope === 'personal' ? 'profile-choice active' : 'profile-choice'} onClick={() => onChange('personal')} disabled={busy}>
        <span className="avatar-badge personal">{initials(data.profile.name)}</span>
        <span><small>PESSOAL</small><strong>{firstName(data.profile.name)}</strong></span>
        {scope === 'personal' && <span className="choice-check"><Icon name="check" /></span>}
      </button>
      {data.sharing?.active && (
        <button type="button" className={scope === 'shared' ? 'profile-choice active shared' : 'profile-choice shared'} onClick={() => onChange('shared')} disabled={busy}>
          <span className="avatar-pair"><i>{initials(data.profile.name).slice(0, 1)}</i><i>{initials(partner?.name).slice(0, 1)}</i></span>
          <span><small>CASAL</small><strong>{firstName(data.profile.name)} & {firstName(partner?.name)}</strong></span>
          {scope === 'shared' && <span className="choice-check"><Icon name="check" /></span>}
        </button>
      )}
    </section>
  )
}
