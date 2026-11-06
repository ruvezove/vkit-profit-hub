import { useEffect, useState, type ReactNode } from "react"
import { BookOpen, ClipboardCheck, GraduationCap, LayoutDashboard, ScanLine, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar"
import { api, type Profile, type PublicCard, type User } from "@/lib/api"
import { ActionForm, ErrorMessage, QrLogin } from "./auth"
import { Modal } from "./modal"
import { StudentProfile } from "./profile"
import { Go } from "./navigation"
import { t } from "./locale"

const tabs = [["overview", "Обзор", LayoutDashboard], ["profile", "Профиль", UserRound], ["resume", "Резюме", ClipboardCheck]] as const

function Overview({ user }: { user: User }) {
  const results = user.progress ?? []
  const days = new Map<string, number>()
  const directions = new Map<string, { count: number; xp: number }>()
  for (const item of results) {
    days.set(item.day, (days.get(item.day) ?? 0) + item.xp)
    const group = directions.get(item.direction) ?? { count: 0, xp: 0 }
    directions.set(item.direction, { count: group.count + 1, xp: group.xp + item.xp })
  }
  const tests = results.filter(item => item.kind === "test")
  const scores = tests.flatMap(item => item.score == null ? [] : [item.score])
  const points = [...days].slice(-14)
  const max = Math.max(1, ...points.map(([, xp]) => xp))
  return <div className="space-y-5">
    <h2 className="text-2xl font-semibold">{t("Здравствуйте")}, {user.login}</h2>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        ["Опыт", results.reduce((sum, row) => sum + row.xp, 0)],
        ["Пройденные тесты", tests.length],
        ["Завершённые курсы", results.filter(row => row.kind === "course").length],
        ["Успеваемость", scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) + "%" : "—"],
      ].map(([label, value]) => <Card key={label} className="gap-2 py-4">
        <CardContent><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{t(String(label))}</p></CardContent>
      </Card>)}
    </div>
    <Card><CardHeader><CardTitle>{t("Опыт по дням")}</CardTitle></CardHeader><CardContent>
      {points.length ? <div className="flex items-end gap-2 overflow-auto">
        {points.map(([day, xp]) => <div key={day} className="min-w-12 flex-1 text-center" title={day}>
          <div className="flex h-32 items-end justify-center"><div className="w-full max-w-14 rounded-t-md bg-primary" style={{height: Math.max(2, xp/max*100)+"%"}} /></div>
          <p className="text-xs">{xp} XP</p><p className="text-xs text-muted-foreground">{day.slice(5)}</p>
        </div>)}
      </div> : <p className="text-sm text-muted-foreground">{t("У вас пока нет результатов обучения.")}</p>}
    </CardContent></Card>
    {directions.size > 0 && <Card><CardHeader><CardTitle>{t("Статистика по направлениям")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">{[...directions].map(([name, data]) => <div key={name} className="flex justify-between gap-3 border-b border-border py-2">
        <span>{t(name)}</span><span>{data.count} · {data.xp} XP</span>
      </div>)}</CardContent></Card>}
  </div>
}

function ProfileCard({ card, nickname, children }: { card?: PublicCard; nickname: string; children?: ReactNode }) {
  return <Card className="overflow-hidden pt-0">
    <div className="h-28 bg-accent sm:h-40">
      {card?.banner && <img src={card.banner} alt="" className="size-full object-cover" />}
    </div>
    <CardContent>
      <Avatar className="-mt-12 mb-3 size-16 border-4 border-card">
        <AvatarImage src={card?.avatar || undefined} alt="" /><AvatarFallback>{nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <h2 className="break-words text-xl font-semibold">{nickname}</h2>
      {card?.bio && <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{card.bio}</p>}
      {children}
    </CardContent>
  </Card>
}

async function encodePhoto(file: File, width: number, height: number) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) throw new Error("Выберите изображение JPEG, PNG или WebP до 12 МБ.")
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    const ratio = Math.min(1, width / bitmap.width, height / bitmap.height)
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext("2d")!
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.77).split(",")[1]
  } finally { bitmap.close() }
}

function ProfileEditor({ user, refresh, saveDemo }: { user: User; refresh: () => Promise<void>; saveDemo: (patch: Partial<PublicCard>) => void }) {
  const [qr, setQr] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return <div className="space-y-5">
    <ProfileCard card={user.card} nickname={user.login}>
      {!user.demo && <div className="mt-4 flex flex-wrap gap-2">
        {user.profile && user.card && <Button variant="outline" asChild><Go to={"/u/" + user.card.id}>{t("Открыть публичный профиль")}</Go></Button>}
        <Button variant="outline" onClick={() => setQr(true)}><ScanLine />{t("Войти по QR-коду")}</Button>
      </div>}
    </ProfileCard>
    <Card><CardHeader><CardTitle>{t("Оформление профиля")}</CardTitle></CardHeader><CardContent className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["avatar", "banner"] as const).map(kind => <label key={kind} className="space-y-2 text-sm">
          <span>{t(kind === "avatar" ? "Аватар" : "Баннер")}</span>
          <Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (!file) return
            setBusy(true); setError("")
            try {
              const image = await encodePhoto(file, kind === "avatar" ? 384 : 1200, kind === "avatar" ? 384 : 480)
              if (user.demo) saveDemo({[kind]: "data:image/jpeg;base64," + image})
              else { await api("student/card/" + kind, "POST", {image}); await refresh() }
            } catch (failure) { setError(failure instanceof Error ? failure.message : "Попробуйте ещё раз.") }
            finally { setBusy(false) }
          }} />
        </label>)}
      </div>
      <ActionForm label={t("Сохранить")} action={async data => {
        const bio = String(data.get("bio") ?? "").trim()
        if (user.demo) saveDemo({bio})
        else { await api("student/card", "POST", {bio}); await refresh() }
      }}>
        <label className="block space-y-2 text-sm"><span>{t("Публичное описание")}</span>
          <textarea name="bio" maxLength={500} defaultValue={user.card?.bio} placeholder={t("Расскажите о себе")} className="min-h-24 w-full rounded-md border border-input p-3" />
        </label>
      </ActionForm>
    </CardContent></Card>
    <Modal open={qr} onClose={() => setQr(false)} title={t("QR-код для входа")}><QrLogin /></Modal>
  </div>
}

export function StudentSpace({ user, refresh, tools }: { user: User; refresh: () => Promise<void>; tools: ReactNode }) {
  const [tab, setTab] = useState<typeof tabs[number][0]>("overview")
  const [demoResume, setDemoResume] = useState<Profile | undefined>(() => {
    if (!user.demo) return
    try { return JSON.parse(localStorage.getItem("profit-demo-resume") ?? "null") ?? undefined } catch { return }
  })
  const [demoCard, setDemoCard] = useState<PublicCard | undefined>(() => {
    if (!user.demo) return
    try { return JSON.parse(localStorage.getItem("profit-demo-card") ?? "null") ?? undefined } catch { return }
  })
  function saveDemo(patch: Partial<PublicCard>) {
    const previous = JSON.parse(localStorage.getItem("profit-demo-card") ?? "null") ?? { id: 0, bio: "", avatar: "", banner: "" }
    const card = { ...previous, ...patch }
    localStorage.setItem("profit-demo-card", JSON.stringify(card))
    setDemoCard(card)
  }
  const current = user.demo ? {...user, profile: demoResume, card: demoCard} : user
  return <SidebarProvider className="min-h-0 flex-col items-start gap-5 md:flex-row">
    <Sidebar className="!w-full rounded-xl border border-border bg-card md:!w-52">
      <SidebarHeader><div className="flex items-center gap-2 p-2">
        <Avatar><AvatarImage src={user.card?.avatar || undefined} alt="" /><AvatarFallback><GraduationCap size={17} /></AvatarFallback></Avatar>
        <span className="truncate text-sm font-semibold">{user.login}</span>
      </div></SidebarHeader>
      <SidebarContent><SidebarMenu className="grid grid-cols-3 px-2 pb-2 md:grid-cols-1">
        {tabs.map(([id,label,Icon]) => <SidebarMenuItem key={id}>
          <SidebarMenuButton isActive={tab===id} aria-current={tab===id ? "page" : undefined} onClick={() => setTab(id)}>
            <Icon /><span>{t(label)}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>)}
      </SidebarMenu></SidebarContent>
    </Sidebar>
    <section className="min-w-0 w-full flex-1" aria-label={t(tabs.find(([id]) => id===tab)![1])}>
      {tab === "overview" ? <Overview user={current} /> : tab === "profile" ? <>
        <ProfileEditor user={current} refresh={refresh} saveDemo={saveDemo} />{tools}
      </> : <StudentProfile user={current} refresh={user.demo ? async () => {
        setDemoResume(JSON.parse(localStorage.getItem("profit-demo-resume") ?? "null") ?? undefined)
      } : refresh} />}
    </section>
  </SidebarProvider>
}

export function PublicStudent({ id }: { id: string }) {
  const [card, setCard] = useState<(PublicCard & {nickname: string})>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void api<PublicCard & {nickname: string}>("student/public/" + encodeURIComponent(id))
      .then(value => { if(active) setCard(value) }).catch(() => { if(active) setFailed(true) })
    return () => { active = false }
  }, [id])
  return <main className="mx-auto w-full max-w-2xl px-5 py-10">
    {failed ? <ErrorMessage message="Профиль не найден." /> : card ? <ProfileCard card={card} nickname={card.nickname} />
      : <p role="status">{t("Загрузка профиля…")}</p>}
  </main>
}

