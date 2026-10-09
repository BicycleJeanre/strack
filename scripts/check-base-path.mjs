import { readFile } from "node:fs/promises";

const html = await readFile("dist/index.html", "utf8");
const worker = await readFile("dist/sw.js", "utf8");
for (const required of ["/strack/assets/", "/strack/manifest.webmanifest", "/strack/icon.svg"]) {
  if (!html.includes(required)) throw new Error(`Production HTML is missing ${required}`);
}
if (!worker.includes("index.html") || !worker.includes("manifest.webmanifest")) throw new Error("Service worker precache is incomplete");
console.log("GitHub Pages base path OK: /strack/ assets and offline shell are present");
