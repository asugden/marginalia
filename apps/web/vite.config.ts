import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { themePlugin } from "./vite-theme-plugin";

export default defineConfig({
  plugins: [react(), themePlugin()],
  build: {
    // Emit production sourcemaps. Without them a runtime error from a
    // deployed build reports only a minified position — an identifier like
    // `Ot.content` at some column of a 25k-character line — which does not
    // resolve back to a file, and diagnosing one means comparing bundle
    // hashes and grepping for the pattern that could have thrown.
    //
    // The cost is that the `.map` files are served publicly alongside the
    // bundles, exposing original sources. That is not a concern here: this
    // is an Apache-2.0 repo whose source is already public. A fork deploying
    // this from a closed tree should weigh that before keeping it on — the
    // maps reveal exactly as much as the repository does.
    sourcemap: true,
  },
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
