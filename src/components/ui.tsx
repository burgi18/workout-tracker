import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './icons'

/* ---------- Bestätigungsdialog + Toast ---------- */

interface ConfirmOpts {
  title: string
  text?: string
  ok?: string
  cancel?: string
  danger?: boolean
}

interface Ui {
  confirm: (o: ConfirmOpts) => Promise<boolean>
  toast: (msg: string) => void
}

const Ctx = createContext<Ui>(null as unknown as Ui)
export const useUi = () => useContext(Ctx)

export function UiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const ui = useMemo<Ui>(
    () => ({
      confirm: o => new Promise<boolean>(resolve => setDialog({ ...o, resolve })),
      toast: m => {
        setMsg(m)
        window.setTimeout(() => setMsg(cur => (cur === m ? null : cur)), 2800)
      },
    }),
    [],
  )

  const close = (v: boolean) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <Ctx.Provider value={ui}>
      {children}
      {dialog && (
        <div className="overlay center" onClick={() => close(false)}>
          <div className="dialog" role="alertdialog" aria-label={dialog.title} onClick={e => e.stopPropagation()}>
            <h3>{dialog.title}</h3>
            {dialog.text && <p>{dialog.text}</p>}
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => close(false)}>
                {dialog.cancel ?? 'Abbrechen'}
              </button>
              <button className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
                {dialog.ok ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </Ctx.Provider>
  )
}

/* ---------- Bottom Sheet ---------- */

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Schließen" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Schalter ---------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-label">{label}</span>
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </button>
  )
}
