import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  server: {
    host: host || "::",
    port: 8080,
    strictPort: true,
    hmr: {
      host: host || undefined,
      overlay: false,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  plugins: [react()],
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
