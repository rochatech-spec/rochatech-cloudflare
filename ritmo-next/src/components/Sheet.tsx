import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'

export function Sheet({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber" />
        <header className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  )
}
