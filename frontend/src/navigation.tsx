import { useNavigate } from "react-router"
import type { ComponentProps } from "react"

export function Go({ to, ...props }: ComponentProps<"button"> & { to: string }) {
  const navigate = useNavigate()
  return <button type="button" {...props} onClick={() => {
    if (/^(https:\/\/|\/auth\/oauth\/)/.test(to)) window.location.assign(to)
    else if (to.startsWith("#")) {
      navigate(to)
      document.getElementById(to.slice(1))?.scrollIntoView()
    } else navigate(to)
  }} />
}
