import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** O mínimo que precisamos do banco: rodar SQL com vários comandos (exec) e consultar (query). */
export interface Conexao {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type Migracao = { nome: string; sql: string };

const TRAVA = 727_274; // número qualquer, igual para todo mundo que roda migrações neste banco

/** Arquivos NNN_nome.sql da pasta, na ordem do número. */
export function listarMigracoes(pasta: string): Migracao[] {
  return readdirSync(pasta)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((nome) => ({ nome, sql: readFileSync(join(pasta, nome), "utf8") }));
}

export type ResultadoMigracoes = { aplicadas: string[]; jaAplicadas: string[] };

/**
 * Aplica no banco as migrações que ainda não rodaram, uma por vez, cada uma dentro de uma transação.
 * Guarda o que já rodou na tabela `migracoes`, então rodar de novo não faz nada.
 *
 * `marcarSemRodar`: para um banco que já recebeu as migrações na mão. Só anota como feitas.
 */
export async function aplicarMigracoes(
  c: Conexao,
  pasta: string,
  opcoes: { marcarSemRodar?: boolean } = {},
): Promise<ResultadoMigracoes> {
  // Trava para dois deploys ao mesmo tempo não aplicarem a mesma migração duas vezes.
  await c.query("SELECT pg_advisory_lock($1)", [TRAVA]);
  try {
    await c.exec(
      `CREATE TABLE IF NOT EXISTS migracoes (
         nome        TEXT PRIMARY KEY,
         aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const feitas = new Set((await c.query<{ nome: string }>("SELECT nome FROM migracoes")).rows.map((r) => r.nome));
    const resultado: ResultadoMigracoes = { aplicadas: [], jaAplicadas: [] };

    for (const m of listarMigracoes(pasta)) {
      if (feitas.has(m.nome)) {
        resultado.jaAplicadas.push(m.nome);
        continue;
      }
      if (opcoes.marcarSemRodar) {
        await c.query("INSERT INTO migracoes (nome) VALUES ($1)", [m.nome]);
        resultado.aplicadas.push(m.nome);
        continue;
      }
      await c.exec("BEGIN");
      try {
        await c.exec(m.sql);
        await c.query("INSERT INTO migracoes (nome) VALUES ($1)", [m.nome]);
        await c.exec("COMMIT");
        resultado.aplicadas.push(m.nome);
      } catch (erro) {
        await c.exec("ROLLBACK");
        throw new Error(`Falhou em ${m.nome}: ${(erro as Error).message}`);
      }
    }
    return resultado;
  } finally {
    await c.query("SELECT pg_advisory_unlock($1)", [TRAVA]);
  }
}
