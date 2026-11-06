export type PublicCard = { id: number; bio: string; avatar: string; banner: string }
export type LearningResult = { day: string; direction: string; kind: "test" | "course"; xp: number; score: number | null }
export type Profile = { name: string; nickname: string; skills: string; directions: string; experience: string; github: string }
export type User = { role: "admin" | "student"; login: string; demo?: boolean; createdAt?: string; email?: string | null; profile?: Profile | null; card?: PublicCard; progress?: LearningResult[] }

export async function api<T = void>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : undefined
  if (!response.ok) throw Object.assign(new Error(data?.message ?? "Не удалось выполнить запрос."), { status: response.status })
  return data as T
}
