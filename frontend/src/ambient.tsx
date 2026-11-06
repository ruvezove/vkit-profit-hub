import { useEffect, useState } from "react"
import { Circle, Droplet, Leaf, Snowflake, Wind } from "lucide-react"
import { api } from "@/lib/api"

type Weather = { effect: "snow" | "rain" | "hail" | "leaves" | "drift"; sparse: boolean }
const icons = { snow: Snowflake, rain: Droplet, hail: Circle, leaves: Leaf, drift: Wind }
const colors = {
  snow: ["#f4f6ff", "#a5bcf6"], rain: ["#6f9ee4", "#91b5ef"], hail: ["#d8e9ff", "#a5bcf6"],
  leaves: ["#da9a53", "#d17a66", "#e8ae69", "#f2edf5"], drift: ["#ad93d0", "#8d9fde"],
}

export function useAmbientWeather(active: boolean) {
  const [weather, setWeather] = useState<Weather>()
  useEffect(() => {
    if (!active) return
    let mounted = true
    const update = () => {
      if (document.hidden) return
      void api<Weather>("ambient").then(value => { if (mounted) setWeather(value) }).catch(() => {})
    }
    update()
    const timer = window.setInterval(update, 600_000)
    document.addEventListener("visibilitychange", update)
    return () => { mounted = false; clearInterval(timer); document.removeEventListener("visibilitychange", update) }
  }, [active])
  return weather
}

export function Ambient({ weather, active }: { weather: Weather; active: boolean }) {
  const { effect, sparse } = weather
  const Icon = icons[effect]
  const palette = colors[effect]
  const [generation, setGeneration] = useState(0)
  useEffect(() => { if (active) setGeneration(value => value + 1) }, [active])
  const fast = effect === "rain" || effect === "hail"
  return <div className="ambient pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:hidden" data-active={active}
    data-effect={effect} aria-hidden="true">
    {Array.from({ length: sparse ? 9 : fast ? 38 : 25 }, (_, i) => <Icon key={generation + ":" + i} className="ambient-particle"
      size={fast ? 7 + i % 4 * 2 : 11 + i % 4 * 4}
      style={{ left: (6 + i * 37 % 88) + "%", color: palette[effect === "leaves" && i % 13 === 0 ? 3 : i % (effect === "leaves" ? 3 : 2)],
        animationDelay: (i * 0.14) + "s", animationDuration: (fast ? 2.5 + i % 6 * 0.24 : 13 + i % 7) + "s" }} />)}
  </div>
}

export function AmbientGround({ weather, active }: { weather: Weather; active: boolean }) {
  const effect = weather.effect
  const Icon = effect === "drift" ? Leaf : icons[effect]
  const palette = colors[effect]
  return <div className="ambient-ground pointer-events-none absolute bottom-0 left-1/2 h-20 w-full max-w-xl -translate-x-1/2 overflow-hidden" data-active={active}
    data-effect={effect} aria-hidden="true">
    {effect === "rain" ? <div className="ambient-puddle absolute inset-x-8 bottom-0 h-11 rounded-[50%]" />
      : Array.from({ length: 38 }, (_, i) => <Icon key={i} className="absolute"
        size={effect === "hail" ? 8 + i % 6 : 14 + i % 5 * 4}
        style={{ left: (13 + i * 17 % 72) + "%", bottom: i * 13 % 42, color: palette[i % palette.length],
          transform: "rotate(" + (i * 31 % 170 - 85) + "deg)" }} />)}
  </div>
}
