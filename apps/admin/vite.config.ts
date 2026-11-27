import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In ontwikkeling gaan /api-verzoeken naar de MEP-API (zelfde origin, dus cookies werken).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.MEP_API_URL ?? "http://localhost:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
