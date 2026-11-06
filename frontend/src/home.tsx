import { lazy, Suspense, useState } from "react"
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry"
import { ArrowDownRight, ArrowRight, BookOpen, ChartNoAxesCombined, ClipboardCheck, CodeXml, Fingerprint, LogIn, ScanLine, UserRound, Users, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal, reducedMotion } from "./brand"
import { useCatalog } from "./catalog"
import { Go } from "./navigation"
import { Modal } from "./modal"
import { t } from "./locale"

const ShinyText = lazy(() => import("@/components/ShinyText"))
const anchors = [["directions", "Направления"], ["practice", "Учёба на практике"], ["statistics", "Статистика обучения"]] as const
const timeline = [["Курсы", "Изучайте материал", BookOpen], ["Практика", "Применяйте знания", CodeXml],
  ["Тесты", "Проверяйте себя", ClipboardCheck]] as const
type Entry = readonly [string, string, LucideIcon]
const notes: Entry[] = [
  ["Профиль ученика", "Запишите, что уже умеете, и выберите направления, которые хотите изучить.", UserRound],
  ["Вход по QR-коду", "Подтвердите вход на новом устройстве с телефона, на котором уже открыли кабинет.", ScanLine],
  ["Самостоятельная работа", "Курсы дают материал для практики, а тесты помогают понять, что стоит повторить.", BookOpen],
  ["Ключ доступа", "На поддерживаемых устройствах можно войти с Face ID, отпечатком или PIN-кодом.", Fingerprint],
]

function LearningPreview() {
  return <div className="route-art relative isolate overflow-hidden rounded-3xl border border-border p-5 sm:p-8" aria-hidden="true">
    <div className="route-art-glow absolute inset-0" />
    <div className="relative">
      <p className="mb-4 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t("От темы к практике")}</p>
      <ol className="space-y-2.5">
        {timeline.map(([title, subtitle, Icon], index) => <li className="hero-step relative flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:gap-4 sm:p-4"
          style={{ animationDelay: (index * 170) + "ms" }} key={title}>
          <span className="text-xs font-bold text-muted-foreground">0{index + 1}</span>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon size={17} /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{t(title)}</p><p className="text-xs leading-5 text-muted-foreground">{t(subtitle)}</p></div>
        </li>)}
      </ol>
    </div>
  </div>
}

export function Home() {
  const catalog = useCatalog()
  const [choice, setChoice] = useState("")
  const light = document.documentElement.dataset.theme === "light"
  const stats = [
    { label: "Ученики", value: catalog?.students, icon: Users },
    { label: "Тесты", value: undefined, icon: ClipboardCheck },
    { label: "Пройденные тесты", value: undefined, icon: BookOpen },
    { label: "Успеваемость", value: undefined, icon: ChartNoAxesCombined },
  ]
  return <main className="relative mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
    <section className="grid items-center gap-9 py-12 sm:py-18 lg:grid-cols-[1fr_0.92fr] lg:gap-14">
      <div>
        <h1 className="text-[clamp(3.4rem,8vw,6.5rem)] leading-[0.98] font-semibold tracking-[-0.07em]">Profit <span className="text-primary">Hub</span></h1>
        <Reveal text={t("Ваш профиль в IT")} className="mt-4 text-[clamp(1.35rem,2.8vw,2rem)] font-semibold tracking-tight" />
        <p className="mt-3 max-w-lg leading-7 text-muted-foreground">{t("Проходите курсы, решайте тесты и выясняйте, какие задачи у вас получаются лучше.")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg"><Go to="/login"><LogIn /> {t("Войти")}</Go></Button>
          <Button asChild variant="outline" size="lg"><Go to="/register">{t("Создать аккаунт")} <ArrowRight /></Go></Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label={t("Разделы страницы")}>
          {anchors.map(([id, label]) => <Go key={id} to={"#" + id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2">
            {t(label)} <ArrowDownRight size={13} aria-hidden="true" />
          </Go>)}
        </div>
      </div>
      <LearningPreview />
    </section>

    <section id="directions" className="home-section">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Направления")}</h2>
      <p className="mt-3 text-muted-foreground">{t("В профиле можно отметить несколько направлений.")}</p>
      <ul className="direction-tree mt-6 flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-5">
        {catalog?.directions.map(({ name }, index) => <li key={name}><button type="button" className="direction-tag" data-branch={index % 3}
          onClick={() => setChoice(name)}>{t(name)}</button></li>)}
      </ul>
      {!catalog && <p className="text-sm text-muted-foreground">{t("Загружаем направления…")}</p>}
    </section>

    <section id="practice" className="home-section">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        <Suspense fallback={t("Учёба на практике")}>
          <ShinyText text={t("Учёба на практике")} color={light ? "#231a33" : "#f6f3fb"} shineColor={light ? "#7244b3" : "#c9b4ff"}
            trigger="view" speed={2.8} followPointer={false} pauseOnHover={false} disabled={reducedMotion} />
        </Suspense>
      </h2>
      <div className="mt-6">
        <ResponsiveMasonry columnsCountBreakPoints={{ 0: 1, 640: 2 }}>
          <Masonry gutter="0.8rem">
            {notes.map(([title, description, Icon], index) => <button type="button" key={title}
              className="masonry-entry group w-full rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/60 focus-visible:outline-2"
              style={{ minHeight: index % 3 === 0 ? "9rem" : "7rem", animationDelay: index * 85 + "ms" }}
              onClick={() => setChoice(title)}>
              <span className="flex items-center justify-between gap-2">
                <Icon className="size-5 text-primary" aria-hidden="true" /><ArrowRight className="size-4 text-primary" aria-hidden="true" />
              </span>
              <span className="mt-3 block font-semibold">{t(title)}</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">{t(description)}</span>
            </button>)}
          </Masonry>
        </ResponsiveMasonry>
      </div>
    </section>

    <section id="statistics" className="home-section">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Статистика обучения")}</h2>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => <button type="button" key={label}
          className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/60 focus-visible:outline-2 sm:p-5"
          onClick={() => setChoice(label)}>
          <Icon className="size-5 text-primary" aria-hidden="true" />
          <span className="mt-3 block text-2xl font-semibold">{value ?? "—"}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{t(label)}</span>
        </button>)}
      </div>
    </section>
    <div className="h-20" aria-hidden="true" />
    <Modal open={Boolean(choice)} onClose={() => setChoice("")} title={t(choice)}
      description={t("Войдите в свой кабинет или создайте аккаунт.")}>
      <div className="flex flex-wrap gap-2">
        <Button asChild><Go to="/login"><LogIn /> {t("Войти")}</Go></Button>
        <Button asChild variant="outline"><Go to="/register">{t("Создать аккаунт")}</Go></Button>
      </div>
    </Modal>
  </main>
}
