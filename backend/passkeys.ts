import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { db, digest, findStudent, load, store, studentSession, token, type Session } from "./state"

type Challenge = { challenge: string; origin: string; student?: number; version?: number; session?: string }
type Credential = { id: string; student_id: number; public_key: Uint8Array; counter: number; rp: string }
type StartSession = (req: FastifyRequest, reply: FastifyReply, value: Session) => Promise<void>
const userID = (id: number) => Buffer.from("profit-hub:" + id)
const limit = { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }
const cookie = "profit_passkey"

export function passkeyRoutes(
  app: FastifyInstance, origins: URL[], session: (req: FastifyRequest) => Promise<Session | null>,
  startSession: StartSession, sessionCookie: string,
) {
  for (const mode of ["register", "login"] as const) {
    function originFor(req: FastifyRequest) {
      return origins.find(url => url.origin === req.headers.origin &&
        (url.protocol === "https:" || url.hostname === "localhost"))
    }
    app.post("/api/passkeys/" + mode + "/options", limit, async (request, reply) => {
      const origin = originFor(request)
      if (!origin) return reply.code(400).send({ message: "Ключи доступа доступны через HTTPS или localhost." })
      const id = token()
      const flow: Challenge = { challenge: "", origin: origin.origin }
      let options
      if (mode === "register") {
        const account = await session(request)
        const student = account?.role === "student" ? findStudent(account.id) : null
        if (!student?.email) return reply.code(403).send({ message: "Войдите как ученик с подтверждённой почтой." })
        const existing = db.query<{ id: string }, [number, string]>("SELECT id FROM passkeys WHERE student_id=? AND rp=?").all(student.id, origin.hostname)
        options = await generateRegistrationOptions({
          rpName: "Profit Hub", rpID: origin.hostname, userName: student.email, userID: userID(student.id),
          attestationType: "none", excludeCredentials: existing,
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        })
        flow.student = student.id
        flow.version = student.session_version
        flow.session = digest(request.cookies[sessionCookie] ?? "")
      } else {
        options = await generateAuthenticationOptions({ rpID: origin.hostname, userVerification: "required" })
      }
      flow.challenge = options.challenge
      await store("passkey-" + mode, id, flow, 180)
      reply.setCookie(cookie, id, { path: "/", httpOnly: true, sameSite: "strict", secure: origin.protocol === "https:", maxAge: 180 })
      return options
    })

    app.post<{ Body: RegistrationResponseJSON | AuthenticationResponseJSON }>("/api/passkeys/" + mode + "/verify",
      { ...limit, bodyLimit: 32_768 }, async (request, reply) => {
        const origin = originFor(request)
        const flow = await load<Challenge>("passkey-" + mode, request.cookies[cookie] ?? "", true)
        const invalid = () => reply.code(400).send({ message: "Не удалось проверить ключ доступа. Попробуйте ещё раз." })
        if (!origin || flow?.origin !== origin.origin || !request.body?.id) return invalid()
        const expected = { expectedOrigin: origin.origin, expectedRPID: origin.hostname,
          expectedChallenge: flow.challenge, requireUserVerification: true }
        if (mode === "register") {
          const account = await session(request)
          if (account?.role !== "student" || account.id !== flow.student || account.version !== flow.version ||
              flow.session !== digest(request.cookies[sessionCookie] ?? "")) return invalid()
          let result
          try { result = await verifyRegistrationResponse({ ...expected, response: request.body as RegistrationResponseJSON }) }
          catch { return invalid() }
          if (!result.verified) return invalid()
          const credential = result.registrationInfo.credential
          const added = db.run("INSERT INTO passkeys (id,student_id,public_key,counter,rp) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",
            [credential.id, account.id, credential.publicKey, credential.counter, origin.hostname])
          if (!added.changes) return invalid()
          return reply.code(204).send()
        }
        const response = request.body as AuthenticationResponseJSON
        const credential = db.query<Credential, [string, string]>("SELECT * FROM passkeys WHERE id=? AND rp=?").get(response.id, origin.hostname)
        if (!credential) return invalid()
        const student = findStudent(credential.student_id)
        if (!student?.email || (response.response?.userHandle && response.response.userHandle !== userID(student.id).toString("base64url"))) return invalid()
        let result
        try { result = await verifyAuthenticationResponse({ ...expected, response, credential: {
          id: credential.id, publicKey: new Uint8Array(credential.public_key), counter: credential.counter,
        } }) }
        catch { return invalid() }
        if (!result.verified) return invalid()
        const updated = db.run("UPDATE passkeys SET counter=? WHERE id=? AND counter=?",
          [result.authenticationInfo.newCounter, credential.id, credential.counter])
        if (!updated.changes || findStudent(student.id)?.session_version !== student.session_version) return invalid()
        await startSession(request, reply, studentSession(student))
        return { role: "student" }
      })
  }
}
