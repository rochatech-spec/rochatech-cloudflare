import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'
export type ToastData={id:number;type:'ok'|'error';text:string}
export default function Toasts({items,onClose}:{items:ToastData[];onClose:(id:number)=>void}){
  return <div className="fixed right-3 top-[calc(12px+env(safe-area-inset-top))] z-[100] grid w-[min(92vw,390px)] gap-2">
    <AnimatePresence>{items.map(t=><motion.div key={t.id} initial={{opacity:0,y:-12,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,x:30}} className="surface flex items-center gap-3 p-3 shadow-xl">
      {t.type==='ok'?<CheckCircle2 className="text-emerald-500"/>:<CircleAlert className="text-red-500"/>}<p className="min-w-0 flex-1 text-sm font-semibold">{t.text}</p><button className="touch" onClick={()=>onClose(t.id)} aria-label="Fechar"><X size={18}/></button>
    </motion.div>)}</AnimatePresence>
  </div>
}
