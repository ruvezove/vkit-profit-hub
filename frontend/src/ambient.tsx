import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"

type Weather = { effect: "snow" | "rain" | "hail" | "leaves" | "drift"; sparse: boolean }
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
      void api<Weather>("ambient").then(value => { if (mounted) setWeather(previous => previous?.effect === value.effect && previous.sparse === value.sparse ? previous : value) }).catch(() => {})
    }
    update()
    const timer = window.setInterval(update, 600_000)
    document.addEventListener("visibilitychange", update)
    return () => { mounted = false; clearInterval(timer); document.removeEventListener("visibilitychange", update) }
  }, [active])
  return weather
}

type Particle = { x: number; y: number; vx: number; vy: number; r: number; angle: number; color: string }

export function Ambient({ weather, active }: { weather: Weather; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const element = canvas.current!
    const context = element.getContext("2d")
    if (!context) return
    const { effect, sparse } = weather
    const rain = effect === "rain"
    const hail = effect === "hail"
    const leaf = effect === "leaves" || effect === "drift"
    const palette = colors[effect]
    const particles: Particle[] = []
    const heap: Particle[] = []
    const heights = new Map<number, number>()
    let width = 0, height = 0, ground = 0, frame = 0, next = 0, time = 0
    const resize = () => {
      const bounds = element.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      ground = height - (element.parentElement?.querySelector("footer")?.getBoundingClientRect().height ?? 0)
      const ratio = Math.min(devicePixelRatio || 1, 1.4)
      element.width = Math.max(1, Math.floor(width * ratio))
      element.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      heap.length = 0
      heights.clear()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    function paint(p: Particle, opacity: number) {
      context!.save()
      context!.translate(p.x, p.y)
      context!.rotate(p.angle)
      context!.globalAlpha = opacity
      context!.fillStyle = p.color
      context!.beginPath()
      context!.ellipse(0, 0, p.r, rain ? p.r * 3 : leaf ? p.r * .48 : p.r, 0, 0, 2*Math.PI)
      context!.fill()
      context!.restore()
    }
    const tick = (now: number) => {
      const dt = Math.min(0.035, time ? (now-time)/1000 : 0.016)
      time = now
      const limit = sparse ? 28 : 85
      if (particles.length < limit && now >= next && width > 24) {
        const r = (rain || hail ? 1.8 : 3) + Math.random()*3
        particles.push({x: r+Math.random()*(width-2*r), y:-10, vx: (Math.random()-.5)*(leaf ? 90 : 38),
          vy: rain ? 450 : 52+Math.random()*40, r, angle: Math.random()*2,
          color: palette[leaf && effect === "leaves" && Math.random() > .94 ? 3 : Math.floor(Math.random()*(effect === "leaves" ? 3 : palette.length))]})
        next = now + (sparse ? 320 : rain ? 48 : 115)
      }
      context.clearRect(0,0,width,height)
      for (const p of heap) paint(p, .72)
      for (let i=particles.length-1; i>=0; i--) {
        const p = particles[i]
        p.vy = Math.min(rain ? 680 : hail ? 320 : leaf ? 160 : 135, p.vy+(rain ? 310 : hail ? 205 : 35)*dt)
        p.x += (p.vx + (leaf ? Math.sin(now/550+p.angle)*30 : 0))*dt
        p.y += p.vy*dt
        p.angle += leaf ? dt*.9 : 0
        if (p.x < p.r || p.x > width-p.r) {
          p.x = Math.min(width-p.r, Math.max(p.r,p.x))
          p.vx *= -.74
        }
        const bucket = Math.floor(p.x/12)
        const pile = heights.get(bucket) ?? 0
        const floor = ground - 2 - pile
        if (!rain && p.y >= floor-p.r) {
          particles.splice(i,1)
          if (heap.length < 210 && pile < 44) {
            p.y = floor-p.r
            heap.push(p)
            heights.set(bucket, pile+p.r*.85)
          }
        } else if (p.y > height+18) particles.splice(i,1)
        else {
          const fade = rain ? 1 : Math.max(0, Math.min(1,(floor-p.y)/(p.vy*.8)))
          paint(p, fade)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [active, weather])
  return <canvas ref={canvas} className="weather-physics pointer-events-none absolute inset-0 z-0 size-full motion-reduce:hidden"
    data-active={active} data-effect={weather.effect} aria-hidden="true" />
}

