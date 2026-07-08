import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // 4. Split JS bundle into smaller chunks for faster loading
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core libraries
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/react-router")) {
            return "vendor-react";
          }
          // Charting (recharts + its dependencies)
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "vendor-charts";
          }
          // Icons
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          // State management
          if (id.includes("node_modules/zustand")) {
            return "vendor-state";
          }
          // Tauri bridge
          if (id.includes("node_modules/@tauri-apps")) {
            return "vendor-tauri";
          }
        },
      },
    },
    // Raise chunk size warning limit to avoid noisy warnings
    chunkSizeWarningLimit: 300,
  },
}));
