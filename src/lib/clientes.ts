import type { Db } from "./db";

/**
 * Devolve o id do cliente com esse telefone, criando se ainda não existir.
 * Se já existir, mantém o nome original (quem digita o telefone de outra pessoa
 * não consegue alterar o cadastro dela).
 */
export async function obterOuCriarCliente(
  db: Db,
  c: { nome: string; telefone: string },
): Promise<number> {
  const r = await db.query<{ id: number }>(
    `INSERT INTO clientes (nome, telefone) VALUES ($1, $2)
     ON CONFLICT (telefone) DO UPDATE SET telefone = EXCLUDED.telefone
     RETURNING id`,
    [c.nome, c.telefone],
  );
  return r.rows[0].id;
}