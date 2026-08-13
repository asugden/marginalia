import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { themePlugin } from "./vite-theme-plugin";

export default defineConfig({
  plugins: [react(), themePlugin()],
  server: {
    // Proxy API + auth calls to the local Worker (`wrangler dev` defaults
    // to :8787), so the SPA and the API share an origin in development.
    // /auth/* must proxy too — those routes (login / callback / logout) live
    // on the worker, not in the SPA. Without this, navigating to
    // /auth/login falls through to the React Router and 404s.
    proxy: {
      "/api": "http://localhost:8787",
      "/auth": "http://localhost:8787",
    },
  },
});
