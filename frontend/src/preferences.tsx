import { Languages } from "lucide-react"
import { Modal } from "./modal"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { ArrowUp, Cloud, Moon, Sun } from "lucide-react"
import { t } from "./locale"

export function usePreferences() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "light" ? "light" : "dark")
  const [language, setLanguage] = useState(() => document.documentElement.lang === "kk" ? "kk" : "ru")
  const [ambient, setAmbient] = useState(() => localStorage.getItem("profit-ambient") === "on")
  return { theme, language, ambient,
    toggleTheme() {
      const next = theme === "dark" ? "light" : "dark"
      document.documentElement.dataset.theme = next
      localStorage.setItem("profit-theme", next)
      setTheme(next)
    },
    changeLanguage(next: "ru" | "kk") {
      document.documentElement.lang = next
      localStorage.setItem("profit-language", next)
      setLanguage(next)
    },
    toggleAmbient() {
      localStorage.setItem("profit-ambient", ambient ? "off" : "on")
      setAmbient(!ambient)
    },
  }
}

export function Preferences({ theme, language, ambient, toggleTheme, changeLanguage, toggleAmbient }: ReturnType<typeof usePreferences>) {
  const [choosing, setChoosing] = useState(false)
  const themeLabel = t(theme === "dark" ? "Светлая тема" : "Тёмная тема")
  const ambientLabel = t("Атмосферные эффекты")
  return <div className="flex items-center gap-3 sm:gap-5">
    <button className="nav-control" type="button" onClick={() => setChoosing(true)} aria-label={t("Выбрать язык")}><Languages size={18} /></button>
    <Modal open={choosing} onClose={() => setChoosing(false)} title={t("Язык интерфейса")}>
      <div className="flex flex-wrap gap-2">
        <Button variant={language === "ru" ? "default" : "outline"} aria-pressed={language === "ru"}
          onClick={() => { changeLanguage("ru"); setChoosing(false) }}>Русский</Button>
        <Button variant={language === "kk" ? "default" : "outline"} aria-pressed={language === "kk"}
          onClick={() => { changeLanguage("kk"); setChoosing(false) }}>Қазақша</Button>
      </div>
    </Modal>
    <button className="nav-control" type="button" onClick={toggleAmbient} aria-label={ambientLabel} aria-pressed={ambient} title={ambientLabel}>
      <Cloud size={18} className={ambient ? "text-primary" : ""} />
    </button>
    <button className="nav-control" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  </div>
}

export function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > Math.min(640, (document.documentElement.scrollHeight - innerHeight) * 0.65))
    update()
    addEventListener("scroll", update, { passive: true })
    addEventListener("resize", update)
    return () => { removeEventListener("scroll", update); removeEventListener("resize", update) }
  }, [])
  return <button type="button" className="back-to-top fixed right-5 bottom-5 z-[3] grid size-11 cursor-pointer place-items-center rounded-full border border-border bg-card text-primary shadow-md focus-visible:outline-2"
    data-visible={visible} aria-hidden={!visible} tabIndex={visible ? 0 : -1}
    onClick={() => window.scrollTo({top: 0})} aria-label={t("Наверх")}><ArrowUp size={20} /></button>
}

