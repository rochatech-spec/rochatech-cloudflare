import { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
export default function Modal({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
  return <AnimatePresence>{open&&<motion.div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={onClose}>
    <motion.section onMouseDown={e=>e.stopPropagation()} initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:30,opacity:0}} className="surface max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl md:max-w-2xl md:rounded-2xl md:p-6">
      <header className="mb-4 flex items-center gap-3"><h2 className="text-xl font-black">{title}</h2><button className="touch ml-auto" onClick={onClose} aria-label="Fechar"><X/></button></header>{children}
    </motion.section>
  </motion.div>}</AnimatePresence>
}
