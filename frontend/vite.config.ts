import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import tailwind from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const frontend = fileURLToPath(new URL("./", import.meta.url))
const project = fileURLToPath(new URL("../", import.meta.url))
const faviconHead = fileURLToPath(new URL("./favicon-head.html", import.meta.url))

export default defineConfig({
  root: frontend,
  build: { outDir: "../dist/frontend", emptyOutDir: true, rollupOptions: { output: { manualChunks: { router: ["react-router"] } } } },
  plugins: [
    react(),
    tailwind(),
    {
      name: "profit-hub-head",
      transformIndexHtml(html) {
        const env = loadEnv("production", project, "APP_URI")
        const app = new URL(env.APP_URI ?? "https://profit.pbk.kz/")
        const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
        return html.replaceAll("%PROFIT_APP_URL%", escape(app.href))
          .replaceAll("%PROFIT_BANNER_URL%", escape(new URL("/favicon/banner.png", app).href))
          .replace("<!-- favicon head -->", () => existsSync(faviconHead) ? readFileSync(faviconHead, "utf8") : "")
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
})
