import { db, digest, tokenPattern } from "./state"
import type { FastifyRequest } from "fastify"

export const sessionAge = 30 * 24 * 60 * 60

function deviceName(agent: string) {
  const platform = /iPhone/.test(agent) ? "iPhone" : /iPad/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android"
    : /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : ""
  const browser = /Edg/.test(agent) ? "Edge" : /Firefox|FxiOS/.test(agent) ? "Firefox"
    : /Chrome|CriOS/.test(agent) ? "Chrome" : /Safari/.test(agent) ? "Safari" : ""
  return [browser, platform].filter(Boolean).join(" · ") || "Web"
}

export function touchDevice(request: FastifyRequest, token: string, student: number, version: number) {
  const now = Date.now()
  db.run(`INSERT INTO device_sessions (id,student_id,version,name,created_at,last_seen) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen WHERE device_sessions.last_seen < excluded.last_seen - 30000`,
    [digest(token), student, version, deviceName(request.headers["user-agent"] ?? ""), now, now])
}

export function forgetDevice(token: string) {
  if (tokenPattern.test(token)) db.run("DELETE FROM device_sessions WHERE id=?", [digest(token)])
}

export function devices(student: number, version: number, token: string) {
  const current = digest(token)
  return db.query<{ id: string; name: string; createdAt: number }, [number, number, number]>(
    "SELECT id,name,created_at AS createdAt FROM device_sessions WHERE student_id=? AND version=? AND last_seen>? ORDER BY created_at DESC, id"
  ).all(student, version, Date.now() - sessionAge * 1000).map(row => ({ ...row, current: row.id === current }))
}
