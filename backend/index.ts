import { ambientWeather } from "./weather"
import { passkeyRoutes } from "./passkeys"
import { devices, forgetDevice, sessionAge, touchDevice } from "./devices"
import { randomInt } from "node:crypto"
import { resolve } from "node:path"
import Fastify, { LogController, type FastifyError, type FastifyReply, type FastifyRequest } from "fastify"
import cookie from "@fastify/cookie"
import rateLimit from "@fastify/rate-limit"
import staticFiles from "@fastify/static"
import QRCode from "qrcode"
import {
  env, local, publicApp, db, redis, token, tokenPattern, digest, secretDigest, key, store, load,
  adminLogin, demoLogin, adminHash, demoHash, demoEnabled, acceptsMail, validEmail, sendMail,
  findStudent, byEmail, studentSession, type Session, type Student, type Profile,
} from "./state"

const app = Fastify({ logger: true, trustProxy: "loopback", logController: new LogController({ disableRequestLogging: true }), bodyLimit: 8192 })
await app.register(cookie)
await app.register(rateLimit, { global: false })
const frontend = resolve("dist/frontend")
await app.register(staticFiles, { root: frontend, index: false, wildcard: false })

const lan = env.APP_LAN_URL ? new URL(env.APP_LAN_URL) : null
const origins = lan ? [local, publicApp, lan] : [local, publicApp]
const cookieOptions = (request: FastifyRequest) => ({
  path: "/", httpOnly: true, sameSite: "lax" as const,
  secure: publicApp.protocol === "https:" && request.headers.host === publicApp.host,
})
app.addHook("onRequest", async (request, reply) => {
  reply.header("x-content-type-options", "nosniff")
  reply.header("x-frame-options", "DENY")
  reply.header("referrer-policy", "no-referrer")
  if (request.url.startsWith("/api/") || request.url.startsWith("/auth/")) reply.header("cache-control", "no-store")
  if (request.method === "POST" && !origins.some(url =>
    url.origin === request.headers.origin && url.host === request.headers.host
  )) {
    return reply.code(403).send({ message: "Обновите страницу и повторите действие." })
  }
})
function error(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ message })
}
app.setErrorHandler<FastifyError>((failure, request, reply) => {
  if (failure.validation) return error(reply, 400, "Проверьте данные формы.")
  if (failure.statusCode === 429) return error(reply, 429, "Слишком много попыток. Попробуйте позже.")
  if (failure.statusCode && failure.statusCode < 500) return error(reply, failure.statusCode, "Не удалось обработать запрос.")
  request.log.error({ code: failure.code, type: failure.name }, "Request failed")
  return error(reply, 500, "Не удалось выполнить действие. Попробуйте ещё раз.")
})

const sessionCookie = "profit_session_v2"
async function session(request: FastifyRequest) {
  const current = await load<Session>("session", request.cookies[sessionCookie] ?? "")
  if (current?.role === "demo" && !demoEnabled) return null
  if (current?.role === "student" && findStudent(current.id)?.session_version !== current.version) return null
  return current
}
async function startSession(request: FastifyRequest, reply: FastifyReply, account: Session) {
  const previous = request.cookies[sessionCookie] ?? ""
  await load("session", previous, true)
  forgetDevice(previous)
  const id = token()
  await store("session", id, account, sessionAge)
  if (account.role === "student") touchDevice(request, id, account.id, account.version)
  reply.setCookie(sessionCookie, id, { ...cookieOptions(request), maxAge: sessionAge })
}

passkeyRoutes(app, origins, session, startSession, sessionCookie)

type TextBody = Record<string, string>
function form(fields: Record<string, number>, max = 8, optional: string[] = []) {
  return {
    schema: { body: {
      type: "object", additionalProperties: false,
      required: Object.keys(fields).filter(field => !optional.includes(field)),
      properties: Object.fromEntries(Object.entries(fields).map(([name, maxLength]) => [
        name, { type: "string", maxLength },
      ])),
    } },
    config: { rateLimit: { max, timeWindow: "1 minute" } },
  }
}
const passwordOkay = (password: string) => [...password].length >= 8 && [...password].length <= 128
const normalize = (value: string) => value.trim().toLowerCase()
const badLink = "Ссылка недействительна или срок её действия истёк."

app.post<{Body: TextBody}>("/api/login", form({ login: 254, password: 256, mode: 8 }, 8, ["mode"]), async (request, reply) => {
  const login = normalize(request.body.login)
  const isAdmin = login === normalize(adminLogin)
  const isDemo = login === normalize(demoLogin)
  const student = login.includes("@") ? byEmail(login) : db.query<Student, [string]>(
    "SELECT * FROM students WHERE email IS NULL AND login=?"
  ).get(login)
  const hash = isAdmin ? adminHash : isDemo ? demoHash : student?.password_hash
  const valid = await Bun.password.verify(request.body.password, hash || adminHash)
  if (!hash || !valid || (request.body.mode === "admin" && !isAdmin)) return error(reply, 401, "Неверные данные для входа.")
  const current: Session = isAdmin ? { role: "admin" } : isDemo ? { role: "demo" } : studentSession(student!)
  await startSession(request, reply, current)
  return { role: current.role === "admin" ? "admin" : "student" }
})

app.post("/api/logout", async (request, reply) => {
  const id = request.cookies[sessionCookie] ?? ""
  await load("session", id, true)
  forgetDevice(id)
  return reply.clearCookie(sessionCookie, cookieOptions(request)).code(204).send()
})

function userView(current: Session) {
  if (current.role === "admin") return { role: "admin", login: adminLogin }
  if (current.role === "demo") return { role: "student", login: demoLogin, demo: true }
  if (current.role !== "student") return null
  const student = findStudent(current.id)!
  const profile: Profile | null = student.profile ? JSON.parse(student.profile) : null
  return { role: "student", login: profile?.nickname ?? student.email ?? student.login,
    email: student.email, createdAt: student.created_at, profile }
}

app.get("/api/me", async (request, reply) => {
  const current = await session(request)
  if (!current) return error(reply, 401, "Войдите в аккаунт.")
  return userView(current)
})

app.post<{Body: TextBody}>("/api/heartbeat", form({ user: 64, devices: 64 }, 20, ["user", "devices"]), async (request, reply) => {
  const id = request.cookies[sessionCookie] ?? ""
  const current = await session(request)
  if (!current || !await redis.send("GETEX", [key("session", id), "EX", String(sessionAge)])) {
    return error(reply, 401, "Войдите в аккаунт.")
  }
  reply.setCookie(sessionCookie, id, { ...cookieOptions(request), maxAge: sessionAge })
  const user = userView(current)
  if (current.role === "student") touchDevice(request, id, current.id, current.version)
  const list = current.role === "student" ? devices(current.id, current.version, id) : []
  const versions = { user: digest(JSON.stringify(user)), devices: digest(JSON.stringify(list)) }
  const changes = {
    ...(versions.user !== request.body.user ? { user } : {}),
    ...(versions.devices !== request.body.devices ? { devices: list } : {}),
  }
  if (!Object.keys(changes).length) return reply.code(204).send()
  return { versions, changes }
})

app.post<{Body: TextBody}>("/api/sessions/rename", form({ id: 64, name: 60 }), async (request, reply) => {
  const current = await session(request)
  const { id, name } = request.body
  if (current?.role !== "student") return error(reply, 403, "Доступно только ученику.")
  if (!name.trim()) return error(reply, 400, "Введите имя сессии.")
  const changed = db.run("UPDATE device_sessions SET name=? WHERE id=? AND student_id=? AND version=? AND last_seen>?",
    [name.trim(), id, current.id, current.version, Date.now() - sessionAge * 1000])
  if (!changed.changes) return error(reply, 404, "Сессия не найдена.")
  return reply.code(204).send()
})

app.post<{Body: TextBody}>("/api/profile", form({
  name: 120, nickname: 40, skills: 2000, directions: 240, experience: 500, github: 240,
}), async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "student" || !findStudent(current.id)?.email) return error(reply, 403, "Подтвердите почту.")
  const profile = Object.fromEntries(Object.entries(request.body).map(([name, value]) => [name, value.trim()])) as Profile
  if (!profile.name || !profile.nickname || !profile.skills || !profile.directions || !profile.experience) {
    return error(reply, 400, "Заполните обязательные поля.")
  }
  if (profile.github && !/^https:\/\/github\.com\/[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/?$/i.test(profile.github)) {
    return error(reply, 400, "Укажите ссылку на профиль GitHub.")
  }
  db.run("UPDATE students SET profile=? WHERE id=?", [JSON.stringify(profile), current.id])
  return reply.code(204).send()
})

app.get("/api/admin/students", async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "admin") return error(reply, current ? 403 : 401, "Доступ только для администратора.")
  const students = db.query("SELECT id, coalesce(email, login) AS login, created_at AS createdAt FROM students ORDER BY id DESC LIMIT 20").all()
  const total = db.query<{ count: number }, []>("SELECT count(*) AS count FROM students").get()!.count
  return { students, total }
})

app.get("/api/ambient", () => ambientWeather())
app.get("/api/catalog", () => ({
  directions: db.query("SELECT name, branch FROM directions ORDER BY sort_order, name").all(),
  students: db.query<{ count: number }, []>("SELECT count(*) AS count FROM students").get()!.count,
}))

const configNames = `AMBIENT_TEST AMBIENT_TEST_CURRENT NODE_ENV APP_URL API_URL APP_URI API_URI TIMELESS_USER_LOGIN TIMELESS_USER_PWD_CY TIMELESS_USER_ACTIVE
ADMIN_LOGIN ADMIN_PWD_CY REDIS_URL DATABASE_PATH QR_SSO_SECRET_CY SMTP_ALLOWED_TO_SEND SMTP_HOST SMTP_PORT SMTP_SECURE
SMTP_MAIL SMTP_PWD_CY SMTP_FROM SMTP_REDIRECT_URI MAGIC_LINK_API_URI GOOGLE_ID GOOGLE_SECRET_CY GOOGLE_REDIRECT_URI YANDEX_ID
YANDEX_SECRET_CY YANDEX_REDIRECT_URI`.split(/\s+/)
app.get("/api/admin/settings", async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "admin") return error(reply, current ? 403 : 401, "Доступ только для администратора.")
  return Object.fromEntries(configNames.map(name => {
    const value = env[name] ?? ""
    if (name.endsWith("_CY")) {
      const chars = Array.from(value)
      const visible = Math.min(3, Math.max(0, chars.length - 1)); return [name, chars.slice(0, visible).join("") + "*".repeat(chars.length - visible)]
    }
    if (name === "REDIS_URL" && value) {
      const url = new URL(value)
      url.username = ""
      url.password = ""
      return [name, url.protocol + "//" + url.host + url.pathname]
    }
    return [name, value]
  }))
})

type Identity = { provider: "google" | "yandex"; subject: string }
type MailAction = {
  email: string; kind: "register" | "legacy"; hash?: string;
  identity?: Identity; id?: number; browser?: string;
}
function createStudent(email: string, hash = "", identity?: Identity) {
  return db.run(`INSERT INTO students (login,email,password_hash,oauth_provider,oauth_subject)
    VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING`,
    ["email:" + token(), email, hash, identity?.provider ?? null, identity?.subject ?? null]).changes > 0
}
const magicSetting = env.MAGIC_LINK_API_URI
const magicBase = magicSetting === "API_URL" || magicSetting === "API_URI" ? env[magicSetting] : magicSetting
const magicApi = new URL(magicBase || env.API_URL || env.API_URI || new URL("/api/", publicApp))
if (magicApi.pathname !== "/api/" || !origins.some(url => url.origin === magicApi.origin)) {
  throw new Error("MAGIC_LINK_API_URI must point to a configured /api/ address")
}
function mailOnAnotherHost(request: FastifyRequest) {
  return request.headers.host !== magicApi.host
}

async function sendLink(action: MailAction) {
  // Keep mail links reusable after a failed delivery, while bounding repeated sends per mailbox.
  const reserved = await redis.send("SET", [key("mail-limit", action.email), "1", "NX", "EX", "60"])
  if (!reserved) return
  const id = token()
  const url = new URL("mail/callback", magicApi)
  url.hash = id
  await store("mail", id, action, 900)
  try {
    await sendMail(action.email, "Подтвердите почту для Profit Hub",
      "Откройте ссылку в течение 15 минут:\n" + url.href)
  } catch (failure) {
    await redis.del(key("mail-limit", action.email), key("mail", id))
    throw failure
  }
}

app.post<{Body: TextBody}>("/api/register", form({ email: 254, password: 256, confirm: 256 }, 5), async (request, reply) => {
  const email = normalize(request.body.email)
  const { password, confirm } = request.body
  if (!acceptsMail(email)) return error(reply, 400, "Для этой почты отправка подтверждений недоступна.")
  if (!passwordOkay(password) || password !== confirm) {
    return error(reply, 400, "Пароли должны совпадать. Минимум 8 символов.")
  }
  if (mailOnAnotherHost(request)) return error(reply, 400, "Откройте " + magicApi.origin + " и повторите регистрацию.")
  if (!byEmail(email)) {
    const browser = request.cookies.profit_mail_browser ?? token()
    reply.setCookie("profit_mail_browser", browser, { ...cookieOptions(request), maxAge: 900 })
    await sendLink({ kind: "register", email, hash: await Bun.password.hash(password), browser: digest(browser) })
  }
  return reply.code(202).send()
})

app.post<{Body: TextBody}>("/api/mail/legacy", form({ email: 254 }, 5), async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "student" || findStudent(current.id)?.email) return error(reply, 403, "Привязка почты недоступна.")
  const email = normalize(request.body.email)
  if (!acceptsMail(email)) return error(reply, 400, "Для этой почты отправка подтверждений недоступна.")
  const browser = request.cookies.profit_mail_browser ?? token()
  reply.setCookie("profit_mail_browser", browser, { ...cookieOptions(request), maxAge: 900 })
  if (mailOnAnotherHost(request)) return error(reply, 400, "Откройте " + magicApi.origin + " и повторите привязку почты.")
  if (!byEmail(email)) await sendLink({ kind: "legacy", id: current.id, email, browser: digest(browser) })
  return reply.code(202).send()
})

app.post<{Body: TextBody}>("/api/mail/confirm", form({ token: 64 }), async (request, reply) => {
  const id = request.body.token
  const preview = await load<MailAction>("mail", id)
  if (!preview || (preview.kind !== "register" && preview.kind !== "legacy")) return error(reply, 400, badLink)
  if (preview.browser && preview.browser !== digest(request.cookies.profit_mail_browser ?? "")) {
    return error(reply, 403, "Откройте ссылку в браузере, в котором запросили подтверждение.")
  }
  const action = await load<MailAction>("mail", id, true)
  if (!action) return error(reply, 400, badLink)
  const created = action.kind === "legacy"
    ? db.run("UPDATE OR IGNORE students SET email=? WHERE id=? AND email IS NULL", [action.email, action.id!]).changes > 0
    : createStudent(action.email, action.hash, action.identity)
  if (!created) return error(reply, 409, "Этот адрес уже связан с аккаунтом.")
  return reply.code(204).send()
})

app.get("/api/mail/callback", (_, reply) => reply.redirect(new URL("/auth/smtp/callback", magicApi).href))

type Reset = { email: string; version: number; code: string; attempts: number }
app.post<{Body: TextBody}>("/api/reset/start", form({ email: 254 }, 5), async (request, reply) => {
  const email = normalize(request.body.email)
  if (!acceptsMail(email)) return error(reply, 400, "Для этой почты отправка кодов недоступна.")
  const id = token()
  const student = byEmail(email)
  const cooldown = key("reset-limit", email)
  if (student && await redis.send("SET", [cooldown, "1", "EX", "60", "NX"])) {
    const code = String(randomInt(1_000_000)).padStart(6, "0")
    await store("reset", id, { email, version: student.session_version, code: secretDigest(id + code), attempts: 0 }, 600)
    try {
      await sendMail(email, "Код сброса пароля Profit Hub", "Код действует 10 минут: " + code)
    } catch (failure) {
      await redis.del(cooldown, key("reset", id))
      throw failure
    }
  }
  return { id }
})

app.post<{Body: TextBody}>("/api/reset/verify", form({ id: 64, code: 6 }, 10), async (request, reply) => {
  const { id, code } = request.body
  if (!tokenPattern.test(id) || !/^\d{6}$/.test(code)) return error(reply, 400, "Введите код из шести цифр.")
  const raw = await redis.send("EVAL", [`
    local raw = redis.call("GET", KEYS[1])
    if not raw then return false end
    local reset = cjson.decode(raw)
    if reset.code == ARGV[1] then
      redis.call("DEL", KEYS[1])
      return raw
    end
    reset.attempts = reset.attempts + 1
    if reset.attempts >= 5 then redis.call("DEL", KEYS[1])
    else redis.call("SET", KEYS[1], cjson.encode(reset), "KEEPTTL") end
    return false
  `, "1", key("reset", id), secretDigest(id + code)])
  if (!raw) return error(reply, 400, "Код неверен или срок его действия истёк.")
  const { email, version } = JSON.parse(raw) as Reset
  const grant = token()
  await store("reset-grant", grant, { email, version }, 600)
  return { grant }
})

app.post<{Body: TextBody}>("/api/reset/finish", form({ grant: 64, password: 256, confirm: 256 }), async (request, reply) => {
  const { grant, password, confirm } = request.body
  if (!passwordOkay(password) || password !== confirm) return error(reply, 400, "Пароли должны совпадать. Минимум 8 символов.")
  const data = await load<Pick<Reset, "email" | "version">>("reset-grant", grant, true)
  if (!data) return error(reply, 400, "Запросите новый код сброса.")
  const updated = db.run("UPDATE students SET password_hash=?, session_version=session_version+1 WHERE email=? AND session_version=?",
    [await Bun.password.hash(password), data.email, data.version])
  if (!updated.changes) return error(reply, 400, "Запросите новый код сброса.")
  return reply.code(204).send()
})


const providers = {
  google: {
    id: env.GOOGLE_ID, secret: env.GOOGLE_SECRET_CY, redirect: env.GOOGLE_REDIRECT_URI,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", exchange: "https://oauth2.googleapis.com/token",
    info: "https://openidconnect.googleapis.com/v1/userinfo", auth: "Bearer", scope: "openid email",
  },
  yandex: {
    id: env.YANDEX_ID, secret: env.YANDEX_SECRET_CY, redirect: env.YANDEX_REDIRECT_URI,
    authorize: "https://oauth.yandex.ru/authorize", exchange: "https://oauth.yandex.ru/token",
    info: "https://login.yandex.ru/info?format=json", auth: "OAuth", scope: "login:email",
  },
}
for (const provider of ["google", "yandex"] as const) {
  const options = providers[provider]
  const callback = "/auth/oauth/" + provider + "/callback"
  if (options.redirect && new URL(options.redirect).href !== new URL(callback, publicApp).href) {
    throw new Error("OAuth callback must match APP_URI: " + provider)
  }
  app.get<{Querystring: {mode?: string}}>("/auth/oauth/" + provider, {
    config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.id || !options.secret || !options.redirect) return reply.redirect("/auth/result?status=oauth_error")
    const mode = request.query.mode === "register" ? "register" : "login"
    if (request.headers.host !== publicApp.host) {
      return reply.redirect(new URL("/auth/oauth/" + provider + "?mode=" + mode, publicApp).href)
    }
    const state = token()
    const verifier = token()
    await store("oauth", state, { verifier, mode, provider }, 600)
    reply.setCookie("profit_oauth", state, { ...cookieOptions(request), maxAge: 600 })
    const url = new URL(options.authorize)
    url.search = new URLSearchParams({
      client_id: options.id, redirect_uri: options.redirect, response_type: "code", scope: options.scope,
      state, code_challenge: Buffer.from(digest(verifier), "hex").toString("base64url"), code_challenge_method: "S256",
    }).toString()
    return reply.redirect(url.href)
  })

  app.get<{Querystring: {state?: string; code?: string}}>(callback, async (request, reply) => {
    const { state, code } = request.query
    const fail = () => reply.redirect("/auth/result?status=oauth_error")
    if (!options.id || !options.secret || !options.redirect || request.headers.host !== publicApp.host ||
        typeof state !== "string" || state !== request.cookies.profit_oauth) return fail()
    reply.clearCookie("profit_oauth", cookieOptions(request))
    const flow = await load<{ verifier: string; mode: string; provider: string }>("oauth", state, true)
    if (!flow || flow.provider !== provider || typeof code !== "string" || code.length > 2048) return fail()
    try {
      const response = await fetch(options.exchange, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, client_id: options.id, client_secret: options.secret,
          redirect_uri: options.redirect, code_verifier: flow.verifier,
        }),
      })
      if (!response.ok) return fail()
      const { access_token } = await response.json() as { access_token?: string }
      if (!access_token) return fail()
      const info = await fetch(options.info, {
        headers: { Authorization: options.auth + " " + access_token }, signal: AbortSignal.timeout(10_000),
      })
      if (!info.ok) return fail()
      const data = await info.json() as {
        sub?: string; id?: string; email?: string; default_email?: string; email_verified?: boolean; hd?: string; client_id?: string;
      }
      const subject = provider === "google" ? data.sub : data.id
      const email = normalize((provider === "google" ? data.email : data.default_email) ?? "")
      if (!subject || !validEmail(email) || (provider === "google" && !data.email_verified) ||
          (provider === "yandex" && data.client_id !== options.id)) return fail()
      const identity = { provider, subject }
      const existing = db.query<Student, [string, string]>(
        "SELECT * FROM students WHERE oauth_provider=? AND oauth_subject=?"
      ).get(provider, subject)
      if (flow.mode === "login") {
        if (!existing) return reply.redirect("/auth/result?status=oauth_signup")
        await startSession(request, reply, studentSession(existing))
        return reply.redirect("/student")
      }
      if (existing || byEmail(email)) return reply.redirect("/auth/result?status=oauth_exists")
      if (provider === "google" && (email.endsWith("@gmail.com") || data.hd)) {
        if (!createStudent(email, "", identity)) return reply.redirect("/auth/result?status=oauth_exists")
        return reply.redirect("/auth/result?status=confirmed")
      }
      if (!acceptsMail(email)) return reply.redirect("/auth/result?status=mail_domain")
      if (mailOnAnotherHost(request)) return reply.redirect("/auth/result?status=mail_unavailable")
      const browser = request.cookies.profit_mail_browser ?? token()
      reply.setCookie("profit_mail_browser", browser, { ...cookieOptions(request), maxAge: 900 })
      await sendLink({ kind: "register", email, identity, browser: digest(browser) })
      return reply.redirect("/auth/result?status=check_mail")
    } catch {
      return fail()
    }
  })
}

app.post("/api/qr/start", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (request, reply) => {
  const id = token()
  const owner = token()
  const code = String(randomInt(1_000_000)).padStart(6, "0")
  const expiresIn = 120
  await store("qr", id, { owner: secretDigest(owner), code }, expiresIn)
  reply.setCookie("profit_qr", owner, { ...cookieOptions(request), maxAge: expiresIn })
  const origin = origins.find(url => url.origin === request.headers.origin) ?? publicApp
  const url = new URL("/auth/qr", origin)
  url.hash = id
  return { id, code, expiresIn, image: await QRCode.toDataURL(url.href, { width: 244, margin: 2 }) }
})

app.post<{Body: TextBody}>("/api/qr/info", form({ id: 64 }, 15), async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "student" || !findStudent(current.id)?.profile) return error(reply, 403, "Войдите как ученик и заполните профиль.")
  const qr = await load<{code: string; account?: Session}>("qr", request.body.id)
  if (!qr || qr.account) return error(reply, 400, "Этот QR-код больше не действует.")
  return { code: qr.code }
})

app.post<{Body: TextBody}>("/api/qr/approve", form({ id: 64 }, 10), async (request, reply) => {
  const current = await session(request)
  if (current?.role !== "student" || !findStudent(current.id)?.profile) return error(reply, 403, "Войдите как ученик и заполните профиль.")
  if (!tokenPattern.test(request.body.id)) return error(reply, 400, "Этот QR-код больше не действует.")
  const approved = await redis.send("EVAL", [`
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local qr = cjson.decode(raw)
    if qr.account then return 0 end
    qr.account = cjson.decode(ARGV[1])
    redis.call("SET", KEYS[1], cjson.encode(qr), "KEEPTTL")
    return 1
  `, "1", key("qr", request.body.id), JSON.stringify(current)])
  if (!approved) return error(reply, 400, "Этот QR-код больше не действует.")
  return reply.code(204).send()
})

app.post<{Body: TextBody}>("/api/qr/claim", form({ id: 64 }, 40), async (request, reply) => {
  const owner = request.cookies.profit_qr
  if (!owner || !tokenPattern.test(request.body.id)) return error(reply, 400, "Этот QR-код больше не действует.")
  const raw = await redis.send("EVAL", [`
    local raw = redis.call("GET", KEYS[1])
    if not raw then return "" end
    local qr = cjson.decode(raw)
    if qr.owner ~= ARGV[1] then return "" end
    if not qr.account then return false end
    redis.call("DEL", KEYS[1])
    return cjson.encode(qr.account)
  `, "1", key("qr", request.body.id), secretDigest(owner)])
  if (raw === "") return error(reply, 400, "Этот QR-код больше не действует.")
  if (!raw) return { signedIn: false }
  const account = JSON.parse(raw) as Session
  if (account.role !== "student" || findStudent(account.id)?.session_version !== account.version) {
    return error(reply, 403, "Запросите новый QR-код.")
  }
  await startSession(request, reply, account)
  reply.clearCookie("profit_qr", cookieOptions(request))
  return { signedIn: true }
})

for (const path of ["/", "/login", "/register", "/student", "/admin", "/forgot", "/auth/smtp/callback", "/auth/result", "/auth/qr"]) {
  app.get(path, (_, reply) => reply.sendFile("index.html"))
}
await app.listen({ port: Number(local.port || (local.protocol === "https:" ? 443 : 80)), host: lan ? "0.0.0.0" : local.hostname })


