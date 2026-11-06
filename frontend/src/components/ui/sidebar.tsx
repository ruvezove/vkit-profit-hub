import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function SidebarProvider({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-wrapper" className={cn("flex w-full", className)} {...props} />
}

export function Sidebar({ className, ...props }: ComponentProps<"aside">) {
  return <aside data-slot="sidebar" data-sidebar="sidebar"
    className={cn("flex w-(--sidebar-width) shrink-0 flex-col bg-sidebar text-sidebar-foreground", className)} {...props} />
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />
}

export function SidebarContent({ className, ...props }: ComponentProps<"nav">) {
  return <nav data-slot="sidebar-content" data-sidebar="content" className={cn("flex min-h-0 flex-1 flex-col gap-2", className)} {...props} />
}

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn("relative min-w-0", className)} {...props} />
}

export function SidebarMenuButton({ className, isActive, ...props }: ComponentProps<"button"> & { isActive?: boolean }) {
  return <button type="button" data-slot="sidebar-menu-button" data-sidebar="menu-button" data-active={isActive}
    className={cn("flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-hidden transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0 md:justify-start", className)}
    {...props} />
}
