type Effect = "snow" | "rain" | "hail" | "leaves" | "drift"
type Weather = { effect: Effect; season: number; source: "test" | "weather" | "fallback"; sparse: boolean }
const fixtures: Effect[] = ["snow", "rain", "hail", "leaves"]
const forecast = "https://api.open-meteo.com/v1/forecast?latitude=52.287&longitude=76.967&current=weather_code,precipitation&timezone=Asia%2FAlmaty"
const pavlodarMonth = new Intl.DateTimeFormat("en", { month: "numeric", timeZone: "Asia/Almaty" })
let cache: { until: number; result: Weather } | undefined
let pending: Promise<Weather> | undefined

function weatherEffect(code: number, precipitation: number): Effect | undefined {
  if (code === 96 || code === 99) return "hail"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || precipitation > 0) return "rain"
}

export function ambientWeather(): Promise<Weather> {
  if (process.env.AMBIENT_TEST === "true") {
    const selection = process.env.AMBIENT_TEST_CURRENT ?? "0"
    const season = /^[0-3]$/.test(selection) ? Number(selection) : 0
    return Promise.resolve({ effect: fixtures[season], season, source: "test", sparse: false })
  }
  if (cache && cache.until > Date.now()) return Promise.resolve(cache.result)
  return pending ??= (async () => {
    const month = Number(pavlodarMonth.format())
    const season = Math.floor(month / 3) % 4
    const seasonal = season === 0 ? "snow" : season === 3 ? "leaves" : "drift"
    let result: Weather
    try {
      const response = await fetch(forecast, { signal: AbortSignal.timeout(4500) })
      if (!response.ok) throw new Error("Forecast unavailable")
      const data = await response.json() as { current?: { weather_code: number; precipitation: number } }
      if (!Number.isInteger(data.current?.weather_code) || !Number.isFinite(data.current?.precipitation)) {
        throw new Error("Invalid forecast")
      }
      const effect = weatherEffect(data.current!.weather_code, data.current!.precipitation)
      result = { effect: effect ?? seasonal, season, source: "weather", sparse: !effect }
    } catch {
      result = { effect: seasonal, season, source: "fallback", sparse: true }
    }
    cache = { result, until: Date.now() + (result.source === "weather" ? 600_000 : 60_000) }
    return result
  })().finally(() => { pending = undefined })
}
