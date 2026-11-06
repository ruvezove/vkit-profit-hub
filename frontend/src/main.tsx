import { Toaster, toast } from "sonner"
import { StudentSpace, PublicStudent } from "./student"
import { BrowserRouter, useLocation, useNavigate } from "react-router"
import { Go } from "./navigation"
import { Devices, Passkey, type Device } from "./access"
import { BackToTop, Preferences, usePreferences } from "./preferences"
import { Ambient, useAmbientWeather } from "./ambient"
import { t } from "./locale"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { ArrowLeft, LogIn, GraduationCap, LogOut, ShieldCheck, Users } from "lucide-react"
import { BrandMark } from "./brand"
import { Home } from "./home"
import { Auth, ErrorMessage, Forgot, QrApprove, Result } from "./auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "./profile"
import { api, type User } from "@/lib/api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import "./styles.css"

type Student = { id: number; login: string; createdAt: string }
type Roster = { students: Student[]; total: number }


function Dashboard({ admin }: { admin: boolean }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User>()
  const [deviceList, setDeviceList] = useState<Device[]>([])
  const versions = useRef<Record<string, string>>({})
  const pending = useRef<Promise<void> | null>(null)
  const date = new Intl.DateTimeFormat(document.documentElement.lang === "kk" ? "kk-KZ" : "ru-RU", { dateStyle: "long" })
  const heartbeat = useCallback(async () => {
    if (pending.current) await pending.current
    const task = async () => {
      const reply = await api<{ versions: Record<string, string>; changes: { user?: User; devices?: Device[] } } | undefined>(
        "heartbeat", "POST", versions.current,
      )
      if (!reply) return
      versions.current = reply.versions
      if (reply.changes.user) {
        if ((reply.changes.user.role === "admin") !== admin) {
          navigate(reply.changes.user.role === "admin" ? "/admin" : "/student", { replace: true })
          return
        }
        setUser(reply.changes.user)
      }
      if (reply.changes.devices) setDeviceList(reply.changes.devices)
    }
    const flight = task()
    pending.current = flight
    try { await flight } finally { if (pending.current === flight) pending.current = null }
  }, [admin, navigate])
  const [roster, setRoster] = useState<Roster>()
  const [error, setError] = useState("")
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const account = await api<User>("me")
        if ((account.role === "admin") !== admin) {
          navigate(account.role === "admin" ? "/admin" : "/student", { replace: true })
          return
        }
        setUser(account)
        if (admin) setRoster(await api<Roster>("admin/students"))
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === 401) {
          navigate("/login", { replace: true })
          return
        }
        setError("Не удалось загрузить кабинет. Обновите страницу.")
      }
    }
    void load()
  }, [admin, navigate])

  useEffect(() => {
    if (!user) return
    const tick = () => {
      if (document.hidden) return
      void heartbeat().catch(failure => {
        if (failure?.status === 401) navigate("/login", { replace: true })
      })
    }
    tick()
    const timer = setInterval(tick, 45000)
    document.addEventListener("visibilitychange", tick)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick) }
  }, [Boolean(user), heartbeat, navigate])

  async function logout() {
    setLeaving(true)
    try {
      await api("logout", "POST")
      navigate("/")
    } catch {
      setError("Не удалось выйти. Попробуйте ещё раз.")
      setLeaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Badge variant="secondary">{admin ? <ShieldCheck /> : <GraduationCap />}{admin ? t("Администратор") : t("Ученик")}</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">{admin ? t("Панель администратора") : t("Кабинет ученика")}</h1>
        </div>
        {user && <Button variant="outline" onClick={logout} disabled={leaving}><LogOut /> {t("Выйти")}</Button>}
      </div>
      {error && <div className="mb-5"><ErrorMessage message={error} /></div>}
      {!user && !error && <p role="status" className="text-muted-foreground">{t("Загрузка кабинета…")}</p>}
      {admin && user && <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("Профиль")}</CardTitle>
          <CardDescription>{t("Вы вошли как")} <strong className="text-foreground">{user.login}</strong></CardDescription>
        </CardHeader>
        {(user.demo || user.createdAt) && <CardContent className="text-sm text-muted-foreground">
          {user.demo ? t("Демонстрационный аккаунт") : t("Дата регистрации · ") + date.format(new Date(user.createdAt!))}
        </CardContent>}
      </Card>}
      {user && !admin && <StudentSpace key={user.demo ? "demo" : user.card?.id} user={user} refresh={heartbeat} tools={!user.demo && <>
        {user.email && <Card className="mt-5">
          <CardHeader><CardTitle>{t("Ключ доступа")}</CardTitle><CardDescription>{t("Для следующего входа используйте отпечаток, Face ID или PIN устройства.")}</CardDescription></CardHeader>
          <CardContent><Passkey enroll /></CardContent>
        </Card>}
        <Devices devices={deviceList} refresh={heartbeat} />
      </>} />}
      {admin && roster && <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-4" /> {t("Зарегистрированные ученики")}</CardTitle>
          <CardDescription>{t("Всего:")} {roster.total}{roster.total > 20 && t(" · Показаны 20 последних регистраций")}</CardDescription>
        </CardHeader>
        <CardContent>
          {roster.students.length ? <Table>
            <TableHeader><TableRow><TableHead>{t("Логин")}</TableHead><TableHead>{t("Дата регистрации")}</TableHead></TableRow></TableHeader>
            <TableBody>{roster.students.map(student => <TableRow key={student.id}>
              <TableCell className="font-medium">{student.login}</TableCell>
              <TableCell>{date.format(new Date(student.createdAt))}</TableCell>
            </TableRow>)}</TableBody>
          </Table> : <p className="text-sm text-muted-foreground">{t("Пока никто не зарегистрировался.")}</p>}
        </CardContent>
      </Card>}
      {admin && user && <Settings />}
    </main>
  )
}

function App() {
  const preferences = usePreferences()
  const weather = useAmbientWeather(preferences.ambient)
  const { pathname: path, search, hash } = useLocation()
  useEffect(() => {
    if (new URLSearchParams(search).get("signedIn") === "1" && path === "/student") {
      toast.success(t("Вы вошли в аккаунт."))
      history.replaceState(history.state, "", path)
    }
  }, [path, search])
  useEffect(() => {
    if (hash.startsWith("#") && path === "/") document.getElementById(hash.slice(1))?.scrollIntoView()
    else if (!hash) window.scrollTo({ top: 0, behavior: "instant" })
  }, [path, search, hash])
  const dashboard = path === "/student" || path === "/admin"
  const back = path === "/login" || path === "/register" ? "/" : path === "/forgot" ? "/login" : null
  const pages: Record<string, ReactNode> = {
    "/login": <Auth register={false} />,
    "/register": <Auth register />,
    "/forgot": <Forgot />,
    "/auth/smtp/callback": <Result mail />,
    "/auth/result": <Result />,
    "/auth/qr": <QrApprove />,
  }
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      {weather && <Ambient weather={weather} active={preferences.ambient} />}
      <header className="relative z-[2] border-b border-border bg-background">
        <nav aria-label={t("Основная навигация")} className="mx-auto flex h-17 max-w-6xl items-center justify-between px-5 sm:px-8">
          {back ? <Button asChild variant="ghost" className="-ml-2">
            <Go to={back}><ArrowLeft /> {t("Назад")}</Go>
          </Button> : <>
            <Go to="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
              <BrandMark className="size-8" /> Profit Hub
            </Go>

          </>}
          <div className="flex items-center gap-3 sm:gap-5">
            <Preferences {...preferences} />
            {!back && !dashboard && <Go className="nav-control" to="/login" aria-label={t("Войти")} title={t("Войти")}><LogIn size={18} /></Go>}
          </div>
        </nav>
      </header>
      <div key={path + search} className="route-enter relative z-[1] flex flex-1 flex-col">
        {dashboard ? <Dashboard admin={path === "/admin"} /> : path.startsWith("/u/") ? <PublicStudent id={path.slice(3)} /> : pages[path] ?? <Home />}
      </div>
      <BackToTop />
      <Toaster theme={preferences.theme} position="bottom-right" />
      <footer className="relative z-[1] border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-5 text-sm text-muted-foreground sm:px-8">Profit Hub</div>
      </footer>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>)



