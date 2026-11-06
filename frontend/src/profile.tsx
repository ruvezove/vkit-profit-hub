import { Go } from "./navigation"
import { useCatalog } from "./catalog"
import { t } from "./locale"
import { useEffect, useState } from "react"
import { ActionForm, Email, ErrorMessage, mailNotice } from "./auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Profile, type User } from "@/lib/api"

const fields = [
  { key: "name", label: "ФИО", max: 120 },
  { key: "nickname", label: "Никнейм", max: 40 },
  { key: "experience", label: "Опыт", max: 500 },
  { key: "skills", label: "Что вы умеете", max: 2000 },
  { key: "github", label: "Ссылка на GitHub (необязательно)", max: 240 },
] as const

export function StudentProfile({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const [sent, setSent] = useState(false)
  const profile = user.profile
  const catalog = useCatalog()
  const directions = [...new Set([...(catalog?.directions.map(item => item.name) ?? []), ...(profile?.directions.split(", ").filter(Boolean) ?? [])])]
  const [editing, setEditing] = useState(!user.profile)
  const qr = sessionStorage.getItem("profit_qr_pending")
  return <Card className="mt-6 max-w-2xl">
    <CardHeader>
      <CardTitle>{!user.email ? t("Подтвердите почту") : editing ? t("Заполните профиль") : t("О себе")}</CardTitle>
      <CardDescription>{user.email ?? t("Подтвердите адрес, чтобы заполнить профиль. Откройте ссылку из письма в этом браузере.")}</CardDescription>
    </CardHeader>
    <CardContent>
      {!user.email ? sent ? <p role="status">{t(mailNotice)}</p> : <ActionForm action={async data => {
        await api("mail/legacy", "POST", { email: data.get("email") })
        setSent(true)
      }}><Email /></ActionForm> : editing ? <ActionForm label={t("Сохранить профиль")} action={async data => {
        const selected = data.getAll("direction").join(", ")
        data.delete("direction")
        const next = Object.fromEntries(Array.from(data, ([name, value]) => [name, String(value).trim()])) as Profile
        next.directions = selected
        await api("profile", "POST", next)
        await refresh()
        setEditing(false)
      }}>
        {fields.map(field => <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{t(field.label)}</Label>
          {field.key === "experience" || field.key === "skills" ? <textarea id={field.key} name={field.key} placeholder={t(field.label)}
            defaultValue={profile?.[field.key]} className="min-h-20 w-full rounded-md border border-input px-3 py-2 focus-visible:outline-ring"
            required maxLength={field.max} /> : <Input id={field.key} name={field.key} placeholder={field.key === "github" ? "https://github.com/username" : t(field.label)} defaultValue={profile?.[field.key]}
            type={field.key === "github" ? "url" : "text"} required={field.key !== "github"} maxLength={field.max} />}
        </div>)}
        <fieldset className="space-y-3 rounded-md border border-border px-3 pb-3">
          <legend className="px-1 text-sm font-medium">{t("Направления")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {directions.map(direction => <label key={direction} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="direction" value={direction} className="size-4 accent-primary"
                defaultChecked={profile?.directions.split(", ").includes(direction)} /> {t(direction)}
            </label>)}
          </div>
        </fieldset>
      </ActionForm> : <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">{t("Направления")}</dt><dd>{profile?.directions.split(", ").map(t).join(", ")}</dd></div>
          {fields.filter(field => profile?.[field.key]).map(field => <div key={field.key} className="min-w-0">
            <dt className="text-sm text-muted-foreground">{t(field.label)}</dt>
            <dd className="whitespace-pre-wrap break-words">{field.key === "github"
              ? <Go className="text-primary underline" to={profile?.github ?? ""}>{profile?.github}</Go> : profile?.[field.key]}</dd>
          </div>)}

        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>{t("Изменить профиль")}</Button>
          {qr && /^[a-f0-9]{64}$/.test(qr) && <Button variant="outline" asChild><Go to={"/auth/qr#" + qr}>{t("Вернуться к QR-коду")}</Go></Button>}
        </div>
      </div>}
    </CardContent>
  </Card>
}

export function Settings() {
  const [values, setValues] = useState<Record<string, string>>()
  const [error, setError] = useState("")
  useEffect(() => {
    void api<Record<string, string>>("admin/settings").then(setValues).catch(failure => setError(failure.message))
  }, [])
  return <Card className="mt-6">
    <CardHeader>
      <CardTitle>{t("Настройки приложения")}</CardTitle>
      <CardDescription>{t("Конфиденциальные значения скрыты.")}</CardDescription>
    </CardHeader>
    <CardContent>
      {error ? <ErrorMessage message={error} /> : values ? <Table>
        <TableHeader><TableRow><TableHead>{t("Переменная")}</TableHead><TableHead>{t("Значение")}</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(values).map(([name, value]) => <TableRow key={name}>
          <TableCell className="font-mono text-xs">{name}</TableCell>
          <TableCell className="whitespace-normal break-all font-mono text-xs">{value || "—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p role="status">{t("Загрузка настроек…")}</p>}
    </CardContent>
  </Card>
}


