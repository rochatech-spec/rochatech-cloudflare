import type { SVGProps } from 'react'

export type IconName = 'home' | 'movements' | 'debt' | 'goal' | 'menu' | 'report' | 'users' | 'user' | 'plus' | 'arrowUp' | 'arrowDown' | 'calendar' | 'spark' | 'settings' | 'logout' | 'edit' | 'trash' | 'chevron' | 'transfer' | 'wallet' | 'bell' | 'check' | 'close' | 'shield' | 'faceId' | 'fingerprint'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  movements: <><path d="M7 3v15"/><path d="m3 7 4-4 4 4"/><path d="M17 21V6"/><path d="m13 17 4 4 4-4"/></>,
  debt: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18"/><path d="M7 15h4"/></>,
  goal: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  report: <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 13h8M8 17h6"/></>,
  users: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M17 10a3 3 0 0 0 0-6M19.5 20v-1.5a4 4 0 0 0-2.5-3.7"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  arrowUp: <><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></>,
  arrowDown: <><path d="M12 5v14"/><path d="m18 13-6 6-6-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  spark: <><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
  logout: <><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  transfer: <><path d="M5 8h13"/><path d="m15 5 3 3-3 3"/><path d="M19 16H6"/><path d="m9 13-3 3 3 3"/></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v16H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 8h14M14 12h7v5h-7a2.5 2.5 0 0 1 0-5z"/></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  shield: <><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  faceId: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M9 9h.01M15 9h.01M9 15c1.7 1.3 4.3 1.3 6 0M12 10.5v2"/></>,
  fingerprint: <><path d="M7.5 9.5A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 4.5 3M6.3 13c.1-3.2 2.2-5.2 5.7-5.2s5.6 2 5.7 5.2"/><path d="M8.2 13.3c.1-2.4 1.4-3.7 3.8-3.7s3.7 1.3 3.8 3.7c.1 2.6-.5 5-1.6 7M10.1 13.5c0-1.3.6-2 1.9-2s1.9.7 1.9 2c0 3-.5 5.3-1.5 7.5M6.2 16.2c.3 1.8.8 3.2 1.6 4.3"/></>,
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}
