import { Pool } from "pg";

/**
 * Interface mínima de acesso ao banco.
 * Tanto o Pool do `pg` quanto o PGlite (usado nos testes) cumprem esse formato.
 */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

let pool: Pool | undefined;

/** Pool de conexões compartilhado. Criado na primeira chamada. */
export function getDb(): Db {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não está definida. Crie o arquivo .env");
  }
  // max baixo: em hospedagem serverless cada instância abre o seu pool.
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}
