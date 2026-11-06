import { Dialog } from "radix-ui"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { t } from "./locale"

export function Modal({ open, onClose, title, description, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay fixed inset-0 z-40 bg-black/55" />
      <Dialog.Content
        className="modal-content fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl"
        {...(!description ? {"aria-describedby": undefined} : {})}>
        <Dialog.Title className="pr-8 text-xl font-semibold">{title}</Dialog.Title>
        {description && <Dialog.Description className="mt-2 text-sm text-muted-foreground">{description}</Dialog.Description>}
        <Dialog.Close aria-label={t("Закрыть")} className="nav-control absolute top-3 right-3"><X size={18} /></Dialog.Close>
        <div className="mt-5">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
