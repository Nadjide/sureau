import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Compass, Lightbulb, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { SessionUser } from '@/features/auth/auth-api'
import { guideSteps, rightsNote, roleSentence } from './guide-steps'
import './user-guide.css'

/** Mounted only while open, so that it always starts at the first step. */
export function UserGuide({ role, onClose }: { role: SessionUser['role']; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const title = useRef<HTMLHeadingElement | null>(null)
  const changed = useRef(false)
  const step = guideSteps[index]!
  const Icon = step.icon
  const last = index === guideSteps.length - 1
  const note = rightsNote(step, role)

  // Screen readers follow the new step: focus moves to its title once the person changes step.
  useEffect(() => {
    if (changed.current) title.current?.focus()
    changed.current = true
  }, [index])

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="guide-overlay" />
      <Dialog.Content className="guide-dialog">
        <nav className="guide-steps" aria-label="Étapes du guide">
          <p className="eyebrow">GUIDE DE SUREAU</p>
          <ol>{guideSteps.map((item, position) => <li key={item.id}>
            <button type="button" aria-current={position === index ? 'step' : undefined} onClick={() => setIndex(position)}>
              <span aria-hidden="true">{position + 1}</span>{item.title}
            </button>
          </li>)}</ol>
        </nav>
        <section className="guide-content">
          <Dialog.Close asChild><Button variant="ghost" size="icon-sm" className="guide-close" aria-label="Fermer le guide"><X aria-hidden="true" /></Button></Dialog.Close>
          <div className="guide-body">
            <span className="guide-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.5} /></span>
            <p className="eyebrow">ÉTAPE {index + 1} SUR {guideSteps.length}</p>
            <Dialog.Title ref={title} tabIndex={-1}>{step.title}</Dialog.Title>
            <Dialog.Description>{step.summary}</Dialog.Description>
            {index === 0 && <p className="guide-role">{roleSentence(role)}</p>}
            <ul className="guide-actions">{step.actions.map((action) => <li key={action.label}>
              <strong>{action.label}</strong><span>{action.text}</span>
            </li>)}</ul>
            {note && <p className="guide-note">{note}</p>}
            {step.tip && <p className="guide-tip"><Lightbulb size={15} aria-hidden="true" /><span>{step.tip}</span></p>}
          </div>
          <div className="guide-footer">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft aria-hidden="true" />Précédent</Button>
            <span className="guide-progress" aria-hidden="true">{guideSteps.map((item, position) => <i key={item.id} className={position === index ? 'is-current' : ''} />)}</span>
            {last
              ? <Button onClick={onClose}><Check aria-hidden="true" />Terminer</Button>
              : <Button onClick={() => setIndex(index + 1)}>Suivant<ArrowRight aria-hidden="true" /></Button>}
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function GuideIntroduction({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return <aside className="guide-introduction" aria-label="Découvrir Sureau">
    <span className="guide-icon" aria-hidden="true"><Compass size={18} strokeWidth={1.5} /></span>
    <div><strong>Première visite ?</strong><p>Le guide présente Sureau en sept étapes : espaces, matériel, affectation, équipe et données.</p></div>
    <Button size="sm" onClick={onOpen}>Suivre le guide</Button>
    <Button variant="ghost" size="icon-sm" aria-label="Masquer cette invitation" onClick={onDismiss}><X aria-hidden="true" /></Button>
  </aside>
}
