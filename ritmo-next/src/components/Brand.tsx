export function Brand({ variant='wordmark', className='' }: { variant?: 'wordmark'|'icon'; className?:string }) {
  if(variant==='icon') return <img className={`ritmo-brand-icon ${className}`.trim()} src="/icon.svg" alt="Ritmo" draggable={false}/>
  return <img className={`ritmo-brand-wordmark ${className}`.trim()} src="/brand-wordmark.svg" alt="Ritmo" draggable={false}/>
}
