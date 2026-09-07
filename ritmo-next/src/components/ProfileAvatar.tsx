import type { Profile } from '../domain/types'
import { initials } from '../lib/format'

export function ProfileAvatar({ profile, className='' }: { profile:Profile; className?:string }) {
  if(profile.avatar_key){
    return <img className={className} src={`/api/avatar?v=${encodeURIComponent(String(profile.data_version||0))}`} alt={`Foto de ${profile.name}`}/>
  }
  return <span className={className}>{initials(profile.name)}</span>
}
