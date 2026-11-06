import { lazy, Suspense } from "react"

const Aurora = lazy(() => import("@/components/Aurora"))
const BlurText = lazy(() => import("@/components/BlurText"))

const colors = ["#49347c", "#9d78fa", "#c9b4ff"]
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function BrandMark({ className = "size-8" }: { className?: string }) {
  return <span aria-hidden="true" className={"brand-sharp inline-flex shrink-0 " + className}>
    <span className="brand-mark size-full" />
  </span>
}

export function BrandArt() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {!reducedMotion && <Suspense fallback={null}><Aurora colorStops={colors} speed={0.35} mouseInteraction={false} /></Suspense>}
    <div className="brand-grid absolute inset-0" />
    <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent" />
  </div>
}

export function Reveal({ text, className }: { text: string; className?: string }) {
  return reducedMotion ? <p className={className}>{text}</p>
    : <Suspense fallback={<p className={className}>{text}</p>}><BlurText text={text} className={className} delay={55} stepDuration={0.26} /></Suspense>
}
