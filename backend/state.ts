import { createHash, createHmac, randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { Database } from "bun:sqlite"
import { RedisClient } from "bun"
import nodemailer from "nodemailer"

export const env = process.env
export const local = new URL(env.APP_URL ?? "http://127.0.0.1:7700/")
export const publicApp = new URL(env.APP_URI ?? local)
const internalApi = env.API_URL && new URL(env.API_URL).href
if (internalApi && ![local, new URL(env.APP_LAN_URL || local)].some(app => internalApi === new URL("/api/", app).href)) {
  throw new Error("API_URL must match APP_URL or APP_LAN_URL and use /api/")
}
if (env.API_URI && new URL(env.API_URI).href !== new URL("/api/", publicApp).href) {
  throw new Error("API_URI must match APP_URI and use /api/")
}
export const adminLogin = env.ADMIN_LOGIN ?? "ProfitAdmin"
export const demoLogin = env.TIMELESS_USER_LOGIN ?? "ProfitStudent"
export const demoEnabled = env.TIMELESS_USER_ACTIVE === "true"
if (env.NODE_ENV !== "production" || !env.ADMIN_PWD_CY || !env.QR_SSO_SECRET_CY ||
    (demoEnabled && !env.TIMELESS_USER_PWD_CY) || adminLogin.toLowerCase() === demoLogin.toLowerCase()) {
  throw new Error("Проверьте настройки Production в .env")
}
export const adminHash = await Bun.password.hash(env.ADMIN_PWD_CY)
export const demoHash = demoEnabled ? await Bun.password.hash(env.TIMELESS_USER_PWD_CY!) : null

const database = resolve(env.DATABASE_PATH ?? "./database/profit-hub.sqlite")
mkdirSync(dirname(database), { recursive: true, mode: 0o700 })
export const db = new Database(database)
db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;")
db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `)
  const columns = new Set(db.query<{name: string}, []>("PRAGMA table_info(students)").all().map(column => column.name))
  for (const column of ["email", "oauth_provider", "oauth_subject", "profile"]) {
    if (!columns.has(column)) db.exec("ALTER TABLE students ADD COLUMN " + column + " TEXT")
  }
  if (!columns.has("session_version")) db.exec("ALTER TABLE students ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
  db.exec(`
    CREATE TABLE IF NOT EXISTS directions (
      name TEXT PRIMARY KEY, branch TEXT NOT NULL, sort_order INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO directions (name, branch, sort_order) VALUES
      ('Frontend', 'Разработка', 10), ('Backend', 'Разработка', 20),
      ('Дизайн', 'Продукт и качество', 30), ('Аналитика', 'Продукт и качество', 40),
      ('Тестирование', 'Продукт и качество', 50), ('Другое', 'Другие направления', 60);
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY, student_id INTEGER NOT NULL, public_key BLOB NOT NULL, counter INTEGER NOT NULL, rp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_sessions (
      id TEXT PRIMARY KEY, student_id INTEGER NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL,
      created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS device_student ON device_sessions(student_id, version);
    CREATE UNIQUE INDEX IF NOT EXISTS students_email ON students(email);
    CREATE UNIQUE INDEX IF NOT EXISTS students_oauth ON students(oauth_provider, oauth_subject);
  `)
}).immediate()

const redisUrl = (env.REDIS_URL ?? "valkey://127.0.0.1:6379").replace(/^valkey:/, "redis:")
export const redis = new RedisClient(redisUrl)
await redis.connect()
export const token = () => randomBytes(32).toString("hex")
export const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export const secretDigest = (value: string) => createHmac("sha256", env.QR_SSO_SECRET_CY!).update(value).digest("hex")
export const key = (kind: string, id: string) => "profit-hub:v2:" + kind + ":" + digest(id)
export const tokenPattern = /^[a-f0-9]{64}$/
export async function store(kind: string, id: string, value: unknown, seconds: number) {
  await redis.send("SET", [key(kind, id), JSON.stringify(value), "EX", String(seconds)])
}
export async function load<T>(kind: string, id: string, consume = false): Promise<T | null> {
  if (!tokenPattern.test(id)) return null
  const value = await redis.send(consume ? "GETDEL" : "GET", [key(kind, id)])
  return value === null ? null : JSON.parse(value) as T
}

export const smtpDomains = new Set((env.SMTP_ALLOWED_TO_SEND ?? "").toLowerCase().split(",").map(value => value.trim()))
export const validEmail = (value: string) => value.length <= 254 && /^[^\s<>@,;]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)
export const acceptsMail = (email: string) => validEmail(email) && smtpDomains.has(email.split("@")[1])
const mail = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT ?? 465),
  secure: env.SMTP_SECURE === "true",
  auth: env.SMTP_MAIL ? {
    user: env.SMTP_MAIL,
    pass: env.SMTP_HOST === "smtp.gmail.com" ? env.SMTP_PWD_CY?.replace(/\s+/g, "") : env.SMTP_PWD_CY,
  } : undefined,
  connectionTimeout: 8_000,
  greetingTimeout: 8_000,
  socketTimeout: 12_000,
})
export async function sendMail(email: string, subject: string, text: string) {
  if (!acceptsMail(email)) throw new Error("Недопустимый адрес получателя")
  // Use the full SMTP mailbox even if the configured display address is abbreviated.
  const name = env.SMTP_FROM?.split("<")[0].trim() || "Profit Hub"
  await mail.sendMail({ from: { name, address: env.SMTP_MAIL ?? "" }, to: email, subject, text })
}

export type Profile = { name: string; nickname: string; skills: string; directions: string; experience: string; github: string }
export type Student = {
  id: number; login: string; email: string | null; password_hash: string; profile: string | null;
  session_version: number; created_at: string;
}
export type Session = { role: "admin" | "demo" } | { role: "student"; id: number; version: number }
export const findStudent = (id: number) => db.query<Student, [number]>("SELECT * FROM students WHERE id=?").get(id)
export const byEmail = (email: string) => db.query<Student, [string]>("SELECT * FROM students WHERE email=?").get(email)
export const studentSession = (student: Student): Session => ({ role: "student", id: student.id, version: student.session_version })



