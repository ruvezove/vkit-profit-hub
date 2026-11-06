import { useEffect, useState } from "react"
import { api } from "@/lib/api"

type Direction = { name: string; branch: string }
type Catalog = { directions: Direction[]; students: number }
let cached: Catalog | undefined
let pending: Promise<Catalog> | undefined

export function useCatalog() {
  const [catalog, setCatalog] = useState(cached)
  useEffect(() => {
    let active = true
    pending ??= api<Catalog>("catalog").then(value => { cached = value; return value }).finally(() => { pending = undefined })
    void pending.then(value => { if (active) setCatalog(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  return catalog
}
