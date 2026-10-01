// Uso:  npm run migrar                      aplica as migrações que faltam
//       npm run migrar -- --marcar-aplicadas   só anota como feitas (banco que já recebeu os SQLs na mão)
import { Client } from "pg";
import { aplicarMigracoes } from "../src/lib/migracoes";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não está definida.");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const r = await aplicarMigracoes(
      {
        exec: (sql) => client.query(sql),
        query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as T[] }),
      },
      "db/migrations",
      { marcarSemRodar: process.argv.includes("--marcar-aplicadas") },
    );
    for (const nome of r.jaAplicadas) console.log(`  já estava: ${nome}`);
    for (const nome of r.aplicadas) console.log(`✓ aplicada: ${nome}`);
    if (r.aplicadas.length === 0) console.log("Banco já está atualizado.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
