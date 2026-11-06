import { useNavigate } from "react-router"
import { useState } from "react"
import { browserSupportsWebAuthn, startAuthentication, startRegistration,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser"
import { Fingerprint, Laptop } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { t } from "./locale"

export type Device = { id: string; name: string; createdAt: number; current: boolean }

export function Passkey({ enroll = false }: { enroll?: boolean }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const available = window.isSecureContext && (location.protocol === "https:" || location.hostname === "localhost") && browserSupportsWebAuthn()
  async function useKey() {
    setBusy(true)
    setMessage("")
    try {
      if (enroll) {
        const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>("passkeys/register/options", "POST")
        await api("passkeys/register/verify", "POST", await startRegistration({ optionsJSON }))
        setMessage("Ключ доступа добавлен.")
      } else {
        const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>("passkeys/login/options", "POST")
        await api("passkeys/login/verify", "POST", await startAuthentication({ optionsJSON }))
        navigate("/student")
      }
    } catch (failure) {
      setMessage(failure instanceof Error && failure.name === "NotAllowedError"
        ? "Действие с ключом отменено." : "Не удалось использовать ключ доступа. Повторите попытку.")
    } finally { setBusy(false) }
  }
  return <div className="space-y-2">
    <Button type="button" variant="outline" className={enroll ? "" : "w-full"} disabled={!available || busy} onClick={useKey}>
      <Fingerprint /> {t(enroll ? "Добавить ключ доступа" : "Войти с ключом доступа")}
    </Button>
    {message && <p role="status" className="text-sm">{t(message)}</p>}
  </div>
}

export function Devices({ devices, refresh }: { devices: Device[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const date = new Intl.DateTimeFormat(document.documentElement.lang === "kk" ? "kk-KZ" : "ru-RU", { dateStyle: "medium", timeStyle: "short" })
  return <Card className="mt-6 max-w-2xl">
    <CardHeader><CardTitle>{t("Устройства и сессии")}</CardTitle><CardDescription>{t("Имена помогают отличать входы с разных устройств.")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="text-destructive">{t(error)}</p>}
      {!devices.length && <p className="text-sm text-muted-foreground">{t("Загрузка сессий…")}</p>}
      {devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
        <div className="flex min-w-0 items-center gap-3">
          <Laptop className="shrink-0 text-primary" size={19} />
          <div className="min-w-0 break-all">
            <p className="font-medium">{device.name}{device.current && <span className="ml-2 text-xs text-primary">{t("Текущая")}</span>}</p>
            <p className="text-xs text-muted-foreground">{date.format(device.createdAt)}</p>
          </div>
        </div>
        {editing === device.id ? <form className="flex w-full flex-wrap gap-2" onSubmit={async event => {
          event.preventDefault()
          const name = new FormData(event.currentTarget).get("name")
          setSaving(true); setError("")
          try {
            await api("sessions/rename", "POST", {id: device.id, name})
            await refresh()
            setEditing("")
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Попробуйте ещё раз.")
          } finally { setSaving(false) }
        }}>
          <Input placeholder={t("Имя сессии")} name="name" className="max-w-64" aria-label={t("Имя сессии")} defaultValue={device.name} maxLength={60} required />
          <Button disabled={saving}>{t("Сохранить")}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing("")}>{t("Отмена")}</Button>
        </form> : <Button type="button" size="sm" variant="ghost" onClick={() => { setError(""); setEditing(device.id) }}>{t("Переименовать")}</Button>}
      </div>)}
    </CardContent>
  </Card>
}
