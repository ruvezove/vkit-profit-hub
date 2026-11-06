import { useLocation, useNavigate } from "react-router"
import { Go } from "./navigation"
import { Modal } from "./modal"
import { Passkey } from "./access"
import { t } from "./locale"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ArrowRight, Eye, EyeOff, Globe, ScanLine, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { api, type User } from "@/lib/api"
import { BrandArt, BrandMark, Reveal } from "./brand"

export const mailNotice = "Если для этого адреса доступно действие, письмо придёт в течение нескольких минут."
const tokenOkay = /^[a-f0-9]{64}$/
export function ErrorMessage({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertDescription>{t(message)}</AlertDescription></Alert>
}

export function Panel({ title, description, children, split = false }: {
  title: string; description?: string; children: ReactNode; split?: boolean
}) {
  return <main className={split
    ? "mx-auto grid w-full max-w-6xl flex-1 content-center items-stretch gap-4 px-5 py-6 sm:px-8 sm:py-10 md:grid-cols-[0.9fr_1fr]"
    : "mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-10"}>
    {split && <aside className="hero-art relative isolate flex min-h-34 flex-col justify-end overflow-hidden rounded-2xl border border-border p-5 sm:p-8 md:min-h-120">
      <BrandArt />
      <div className="relative">
        <BrandMark className="size-10 sm:size-14" />
        <Reveal text="Profit Hub" className="mt-1 text-3xl font-semibold tracking-tight sm:text-5xl" />
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">{t("Кабинет ученика специальной группы ВКИТ")}</p>
      </div>
    </aside>}
    <Card className={split ? "w-full justify-center rounded-2xl border-border py-7 sm:py-10" : "w-full rounded-2xl"}>
      <CardHeader className={split ? "sm:px-8 lg:px-12" : undefined}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(title)}</h1>
        {description && <CardDescription>{t(description)}</CardDescription>}
      </CardHeader>
      <CardContent className={split ? "sm:px-8 lg:px-12" : undefined}>{children}</CardContent>
    </Card>
  </main>
}

export function ActionForm({ children, action, label = "Продолжить" }: {
  children: ReactNode; action: (data: FormData) => Promise<void>; label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError("")
    try { await action(data) }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Попробуйте ещё раз.") }
    finally { setBusy(false) }
  }
  return <form className="space-y-4" onSubmit={submit}>
    {error && <ErrorMessage message={error} />}
    {children}
    <Button size="lg" className="w-full" disabled={busy}>{busy ? t("Подождите…") : t(label)} <ArrowRight /></Button>
  </form>
}

function Password({ name = "password", label = "Пароль", existing = false }: { name?: string; label?: string; existing?: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="space-y-2">
    <Label htmlFor={name}>{t(label)}</Label>
    <div className="relative">
      <Input id={name} name={name} placeholder="••••••••" type={visible ? "text" : "password"} className="h-11 pr-12"
        autoComplete={existing ? "current-password" : "new-password"} minLength={existing ? 1 : 8} maxLength={128} required />
      <Button type="button" size="icon" variant="ghost" className="absolute inset-y-0 right-1 h-full"
        aria-label={visible ? t("Скрыть ") + t(label).toLowerCase() : t("Показать ") + t(label).toLowerCase()}
        aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  </div>
}

export function Email() {
  return <div className="space-y-2">
    <Label htmlFor="email">{t("Электронная почта")}</Label>
    <Input id="email" name="email" placeholder="name@example.com" type="email" className="h-11" autoComplete="email" maxLength={254} required />
  </div>
}

export function Auth({ register }: { register: boolean }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const admin = !register && new URLSearchParams(search).get("mode") === "admin"
  const [showQr, setShowQr] = useState(false)
  const [first, setFirst] = useState<{ email: string; password: string }>()
  const [sent, setSent] = useState(false)
  return <Panel split title={register ? t("Создать аккаунт") : admin ? t("Вход администратора") : t("Вход в Profit Hub")}
    description={first ? t("Шаг 2 из 2 · Повторите пароль. Ссылку для подтверждения мы отправим на вашу почту.")
      : register ? t("Шаг 1 из 2 · Укажите почту и придумайте пароль.") : t("Войдите, чтобы открыть свой кабинет.")}>
    {sent ? <div className="space-y-4">
      <p role="status" className="text-muted-foreground">{t(mailNotice)}</p>
      <p className="text-sm text-muted-foreground">{t("Для подтверждения откройте ссылку в этом браузере.")}</p>
      <Button variant="outline" onClick={() => setSent(false)}>{t("Назад")}</Button>
    </div> : <ActionForm key={String(Boolean(first))} label={register ? first ? t("Отправить письмо") : t("Продолжить") : t("Войти")} action={async data => {
        const email = String(data.get("email") ?? "")
        if (register) {
          if (!first) setFirst({ email, password: String(data.get("password")) })
          else {
            await api("register", "POST", { ...first, confirm: data.get("confirm") })
            setFirst(undefined)
            setSent(true)
          }
        } else {
          const { role } = await api<{role: User["role"]}>("login", "POST", { login: data.get("login"), password: data.get("password"), ...(admin ? { mode: "admin" } : {}) })
          const qr = sessionStorage.getItem("profit_qr_pending") ?? ""
          navigate(role === "admin" ? "/admin" : tokenOkay.test(qr) ? "/auth/qr#" + qr : "/student")
        }
      }}>
        {first ? <Password name="confirm" label={t("Повторите пароль")} />
          : register ? <Email /> : <div className="space-y-2">
            <Label htmlFor="login">{admin ? t("Логин администратора") : t("Электронная почта или логин")}</Label>
            <Input id="login" name="login" placeholder={admin ? "ProfitAdmin" : "name@example.com"} className="h-11" autoComplete="username" autoCapitalize="none" maxLength={254} required />
          </div>}
        {!first && <Password existing={!register} />}
        {register && !first && <p className="text-sm text-muted-foreground">{t("Пароль от 8 символов.")}</p>}
        {!register && !admin && <Go to="/forgot" className="inline-block text-sm text-primary underline underline-offset-4">{t("Забыли пароль?")}</Go>}
      </ActionForm>}
    {!register && !admin && <p className="mt-4 text-center text-sm text-muted-foreground">
      {t("Впервые здесь?")} <Go className="text-primary underline underline-offset-4" to="/register">{t("Зарегистрироваться")}</Go>
    </p>}
    {!sent && <div className="mt-5 space-y-4 border-t border-border pt-4">
      {first ? <Button variant="ghost" onClick={() => setFirst(undefined)}>{t("Изменить почту или пароль")}</Button> : <>
        {!admin && <>
          <p className="text-sm font-medium text-muted-foreground">{register ? t("Или зарегистрируйтесь через") : t("Другие способы входа")}</p>
          <div className="grid grid-cols-2 gap-2">
            {["google", "yandex"].map(provider => <Button key={provider} variant="outline" size="lg" asChild>
              <Go to={"/auth/oauth/" + provider + "?mode=" + (register ? "register" : "login")}>
                <Globe /> {provider === "google" ? "Google" : "Яндекс"}
              </Go>
            </Button>)}
          </div>
          {!register && <><Passkey />
            <Button variant="ghost" className="w-full" onClick={() => setShowQr(true)}><ScanLine /> {t("Войти по QR-коду")}</Button>
          </>}
        </>}
        {register ? <p className="text-center text-sm text-muted-foreground">{t("Уже есть аккаунт?")} <Go className="text-primary underline" to="/login">{t("Войти")}</Go></p>
          : <Go className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary" to={admin ? "/login" : "/login?mode=admin"}>
            <ShieldCheck size={15} /> {t(admin ? "Вход ученика" : "Вход администратора")}
          </Go>}
      </>}
    </div>}
    <Modal open={showQr} onClose={() => setShowQr(false)} title={t("QR-код для входа")}>
      {showQr && <QrLogin />}
    </Modal>
  </Panel>
}

export function Forgot() {
  const [id, setId] = useState("")
  const [grant, setGrant] = useState("")
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)
  return <Panel title={done ? t("Пароль изменён") : t("Сброс пароля")}
    description={done ? t("Войдите с новым паролем.") : grant ? t("Придумайте новый пароль.") : id ? mailNotice : t("Введите почту, которую подтвердили при регистрации.")}>
    {done ? <Button asChild><Go to="/login">{t("Войти")}</Go></Button> :
      <ActionForm key={grant ? "password" : id ? "code" : "email"} label={grant ? t("Сохранить пароль") : undefined}
        action={async data => {
          if (grant) {
            await api("reset/finish", "POST", { grant, password: data.get("password"), confirm: data.get("confirm") })
            setDone(true)
          } else if (id) {
            setGrant((await api<{grant: string}>("reset/verify", "POST", { id, code: data.get("code") })).grant)
          } else {
            setId((await api<{id: string}>("reset/start", "POST", { email: data.get("email") })).id)
          }
        }}>
        {grant ? <><Password /><Password name="confirm" label={t("Повторите пароль")} /></> : id ? <div className="space-y-2">
          <Label htmlFor="code">{t("Шестизначный код из письма")}</Label>
          <div className="flex items-center gap-2">
            <InputOTP id="code" name="code" placeholder="000000" maxLength={6} minLength={6} pattern="^[0-9]+$" inputMode="numeric" autoComplete="one-time-code" required>
              <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} masked={!visible} />)}</InputOTPGroup>
            </InputOTP>
            <Button type="button" size="icon" variant="ghost" aria-label={visible ? t("Скрыть код") : t("Показать код")}
              aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button>
          </div>
        </div> : <Email />}
      </ActionForm>}
    {id && !grant && <Button variant="ghost" className="mt-3" onClick={() => setId("")}>{t("Начать заново")}</Button>}
  </Panel>
}

const results: Record<string, { title: string; description: string }> = {
  confirmed: { title: "Аккаунт подтверждён", description: "Теперь можно войти в Profit Hub и заполнить профиль." },
  check_mail: { title: "Проверьте почту", description: "Чтобы завершить регистрацию, откройте ссылку из письма в этом браузере." },
  oauth_signup: { title: "Аккаунт не найден", description: "Зарегистрируйтесь через этого провайдера или войдите способом, который использовали раньше." },
  oauth_exists: { title: "Аккаунт уже существует", description: "Войдите способом, который использовали при регистрации." },
  mail_unavailable: { title: "Подтверждение пока недоступно", description: "Зарегистрируйтесь по почте и паролю на локальном адресе Profit Hub." },
  mail_domain: { title: "Почту нельзя подтвердить", description: "Для этого адреса отправка подтверждений недоступна." },
  oauth_error: { title: "Не удалось продолжить", description: "Откройте страницу входа и повторите попытку." },
}

export function Result({ mail = false }: { mail?: boolean }) {
  const { hash } = useLocation()
  const [fragment] = useState(() => hash.slice(1))
  const [status, setStatus] = useState(mail ? "loading" : new URLSearchParams(location.search).get("status") ?? "")
  const [error, setError] = useState("")
  useEffect(() => {
    if (!mail) return
    history.replaceState(history.state, "", location.pathname + location.search)
    void api("mail/confirm", "POST", { token: fragment }).then(() => {
      setStatus("confirmed")
    }).catch(failure => {
      setStatus("error")
      setError(failure.message)
    })
  }, [mail])
  const result = status === "loading" ? { title: "Проверяем ссылку", description: "Подождите…" }
    : status === "error" ? { title: "Не удалось открыть ссылку", description: error }
    : Object.hasOwn(results, status) ? results[status] : results.oauth_error
  return <Panel {...result}>
    {status !== "loading" && <Button asChild><Go to={status === "oauth_signup" ? "/register" : "/login"}>
      {status === "oauth_signup" ? t("Зарегистрироваться") : t("Перейти ко входу")}
    </Go></Button>}
  </Panel>
}

function QrLogin() {
  const navigate = useNavigate()
  const [attempt, retry] = useState(0)
  const [qr, setQr] = useState<{ image: string; code: string }>()
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    let poll: number | undefined
    let clock: number | undefined
    let deadline = 0
    async function claim(id: string) {
      if (Date.now() >= deadline) return
      try {
        const result = await api<{signedIn: boolean}>("qr/claim", "POST", { id })
        if (!active) return
        if (result.signedIn) navigate("/student", { replace: true })
        else poll = window.setTimeout(() => void claim(id), 3000)
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Запросите новый QR-код.")
      }
    }
    void api<{id: string; code: string; image: string; expiresIn: number}>("qr/start", "POST").then(data => {
      if (!active) return
      deadline = Date.now() + data.expiresIn * 1000
      setQr(data)
      setRemaining(data.expiresIn)
      poll = window.setTimeout(() => void claim(data.id), 3000)
      clock = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        setRemaining(left)
        if (!left) window.clearInterval(clock)
      }, 250)
    }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false; window.clearTimeout(poll); window.clearInterval(clock) }
  }, [attempt, navigate])
  return <div className="space-y-4">
    {error ? <ErrorMessage message={error} /> : qr && remaining ? <>
      <p className="text-sm text-muted-foreground">{t("Отсканируйте QR-код устройством, на котором вы вошли как ученик. Перед подтверждением сверьте код на обоих экранах.")}</p>
      <img src={qr.image} width={244} height={244} alt={t("QR-код для входа")} className="mx-auto rounded-lg" />
      <p className="text-center font-mono text-xl tracking-widest">{qr.code}</p>
      <p className="text-center text-sm text-muted-foreground">{t("Действует ещё")} {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
    </> : qr ? <ErrorMessage message={t("Этот QR-код больше не действует.")} /> : <p role="status">{t("Создаём QR-код…")}</p>}
    {(error || (qr && !remaining)) && <Button onClick={() => { setQr(undefined); setError(""); retry(attempt + 1) }}>
      {t("Получить новый QR-код")}
    </Button>}
  </div>
}

export function QrApprove() {
  const { hash } = useLocation()
  const [fragment] = useState(() => hash.slice(1))
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!tokenOkay.test(fragment)) { setError("Этот QR-код больше не действует."); return }
    sessionStorage.setItem("profit_qr_pending", fragment)
    void api<{code: string}>("qr/info", "POST", { id: fragment }).then(result => setCode(result.code))
      .catch(failure => setError(failure.message))
  }, [])
  return <Panel title={done ? t("Вход подтверждён") : t("Вход на другом устройстве")}
    description={done ? t("Вернитесь к устройству, на котором открыли QR-код.") : t("Подтвердите вход, только если этот код совпадает с кодом на другом устройстве.")}>
    {error && <div className="space-y-4">
      <ErrorMessage message={error} />
      <Button variant="outline" asChild><Go to="/login">{t("Перейти ко входу")}</Go></Button>
    </div>}
    {code && !done && <ActionForm label={t("Подтвердить вход")} action={async () => {
      await api("qr/approve", "POST", { id: fragment })
      sessionStorage.removeItem("profit_qr_pending")
      history.replaceState(history.state, "", location.pathname + location.search)
      setDone(true)
    }}><p className="font-mono text-2xl tracking-widest">{code}</p></ActionForm>}
    {!code && !error && <p role="status">{t("Проверяем QR-код…")}</p>}
  </Panel>
}

