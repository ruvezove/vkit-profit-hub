import { useContext, type ComponentProps } from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { cn } from "@/lib/utils"

export function InputOTP({ className, containerClassName, ...props }: ComponentProps<typeof OTPInput>) {
  return <OTPInput className={cn("disabled:cursor-not-allowed", className)}
    containerClassName={cn("flex items-center gap-2 has-disabled:opacity-50", containerClassName)} {...props} />
}

export function InputOTPGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center", className)} {...props} />
}

export function InputOTPSlot({ index, className, masked, ...props }: ComponentProps<"div"> & { index: number; masked?: boolean }) {
  const context = useContext(OTPInputContext)
  const { char, placeholderChar, hasFakeCaret, isActive } = context?.slots[index] ?? {}
  return (
    <div data-active={isActive} className={cn(
      "relative flex size-10 items-center justify-center border-y border-r border-input text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring/50",
      className,
    )} {...props}>
      {char ? masked ? "•" : char : <span className="text-muted-foreground/55">{placeholderChar}</span>}
      {hasFakeCaret && <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-4 w-px animate-caret-blink bg-foreground motion-reduce:animate-none" />
      </div>}
    </div>
  )
}

