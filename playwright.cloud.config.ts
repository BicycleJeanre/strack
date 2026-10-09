import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "cloud.spec.ts",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5174/",
    viewport: { width: 900, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-strack.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-strack VITE_FIREBASE_APP_ID=demo-app VITE_USE_EMULATORS=true vite --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: false,
  },
});
