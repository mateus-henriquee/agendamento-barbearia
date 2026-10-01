import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Faz o "@/..." funcionar nos testes, igual ao Next.js.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // O PGlite (Postgres dentro do Node) demora para iniciar quando vários arquivos
    // de teste rodam juntos. Damos mais tempo para não falhar à toa.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
