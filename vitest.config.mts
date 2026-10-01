import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Faz o "@/..." funcionar nos testes, igual ao Next.js.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});