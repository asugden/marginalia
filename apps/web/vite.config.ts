import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { themePlugin } from "./vite-theme-plugin";

export default defineConfig({
  plugins: [react(), themePlugin()],
  server: {
    // Proxy API calls to the local Worker (`wrangler dev` defaults to :8787),
    // so the SPA and the API share an origin in development.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
