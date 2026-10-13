import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/app": "http://localhost:4111" } },
  build: { outDir: "dist", emptyOutDir: true },
});
