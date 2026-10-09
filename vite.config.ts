import { defineConfig, type Plugin } from "vite";

function offline(): Plugin {
  return {
    name: "strack-offline",
    apply: "build",
    generateBundle(_, bundle) {
      const assets = [
        "index.html",
        "manifest.webmanifest",
        "icon.svg",
        ...Object.keys(bundle).filter((file) => !file.endsWith(".map")),
      ];
      const version = `strack-${Date.now()}`;
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE=${JSON.stringify(version)};
const BASE=new URL('./',self.location.href);
const ASSETS=${JSON.stringify([...new Set(assets)])}.map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('strack-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==BASE.origin)return;
  if(event.request.mode==='navigate'&&new URL(event.request.url).pathname.startsWith(BASE.pathname)){
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(new URL('index.html',BASE).href)).then(hit=>hit||fetch(event.request)));return;
  }
  if(ASSETS.includes(event.request.url))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true})).then(hit=>hit||fetch(event.request)));
});`,
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH || "./",
  plugins: [offline()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
