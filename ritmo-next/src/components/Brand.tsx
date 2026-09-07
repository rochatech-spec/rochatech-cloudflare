export function Brand({ variant='wordmark', className='' }: { variant?: 'wordmark'|'icon'; className?:string }) {
  if(variant==='icon') return <img className={`ritmo-brand-icon ${className}`.trim()} src="/brand-icon.png" alt="Ritmo" draggable={false}/>
  return <img className={`ritmo-brand-wordmark ${className}`.trim()} src="/brand-wordmark.png" alt="Ritmo" draggable={false}/>
}
