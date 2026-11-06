import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"

const source = process.argv[2]
if (!source) throw new Error("Usage: bun scripts/import-favicon.ts <favicon directory>")
const names = await readdir(source)
const htmlFiles = names.filter(name => extname(name).toLowerCase() === ".html")
if (htmlFiles.length !== 1 || !names.includes("banner.png")) {
  throw new Error("Expected one .html file and banner.png in " + source)
}
const assets = names.filter(name => /\.(ico|png|svg|webmanifest|json|xml|webp)$/i.test(name))
const target = resolve("frontend/public/favicon")
function faviconUrl(value: string) {
  const url = new URL(value, "https://favicon.invalid/")
  const file = basename(decodeURIComponent(url.pathname))
  if (!assets.includes(file)) throw new Error("Favicon asset missing: " + file)
  return "/favicon/" + encodeURIComponent(file) + url.search
}
const original = await readFile(join(source, htmlFiles[0]), "utf8")
const head: string[] = []
for (const match of original.matchAll(/<(link|meta)\s+([^<>]+)>/gi)) {
  const attributes = Object.fromEntries(Array.from(match[2].matchAll(/([a-z][a-z\d:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/gi),
    ([, name, double, single, unquoted]) => [name.toLowerCase(), double ?? single ?? unquoted]))
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
  if (match[1].toLowerCase() === "link" && /^(?:icon|shortcut icon|apple-touch-icon(?:-precomposed)?|mask-icon|manifest)$/i.test(attributes.rel ?? "")) {
    const href = faviconUrl(attributes.href ?? "")
    const optional = ["sizes", "type", "color"].map(name => attributes[name] ? ` ${name}="${escape(attributes[name])}"` : "").join("")
    head.push(`<link rel="${escape(attributes.rel)}" href="${escape(href)}"${optional} />`)
  } else if (match[1].toLowerCase() === "meta" &&
    /^(?:theme-color|apple-mobile-web-app-title|msapplication-TileColor|msapplication-TileImage|msapplication-config|application-name)$/i.test(attributes.name ?? "")) {
    let content = attributes.name === "apple-mobile-web-app-title" ? "Profit Hub" : attributes.content ?? ""
    if (/^(?:msapplication-TileImage|msapplication-config)$/i.test(attributes.name) && content !== "none") {
      const file = basename(content)
      if (!assets.includes(file)) throw new Error("Favicon asset missing: " + file)
      content = "/favicon/" + encodeURIComponent(file)
    }
    head.push(`<meta name="${escape(attributes.name)}" content="${escape(content)}" />`)
  }
}
if (!head.some(tag => tag.startsWith("<link"))) throw new Error("No favicon links in the supplied HTML")
await mkdir(target, { recursive: true })
for (const file of assets) {
  const input = join(source, file)
  const output = join(target, file)
  if (file.endsWith(".webmanifest")) {
    const manifest = JSON.parse(await readFile(input, "utf8")) as { name?: string; short_name?: string; icons?: Array<{src: string}> }
    manifest.name = "Profit Hub"
    for (const icon of manifest.icons ?? []) icon.src = faviconUrl(icon.src)
    await writeFile(output, JSON.stringify(manifest, null, 2))
  } else {
    await copyFile(input, output)
  }
}
await writeFile(resolve("frontend/favicon-head.html"), head.join("\n") + "\n")



