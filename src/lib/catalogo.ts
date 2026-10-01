import type { Db } from "./db";

export type Servico = { id: number; nome: string; duracaoMin: number; preco: number };
export type BarbeiroPublico = { id: number; nome: string; servicoIds: number[] };

export async function listarServicos(db: Db): Promise<Servico[]> {
  const r = await db.query<{ id: number; nome: string; duracao_min: number; preco: number }>(
    "SELECT id, nome, duracao_min, preco::float8 AS preco FROM servicos WHERE ativo ORDER BY nome",
  );
  return r.rows.map((s) => ({ id: s.id, nome: s.nome, duracaoMin: s.duracao_min, preco: s.preco }));
}

/** Só barbeiros ATIVOS aparecem para o cliente, com os serviços (ativos) que cada um faz. */
export async function listarBarbeiros(db: Db): Promise<BarbeiroPublico[]> {
  const r = await db.query<{ id: number; nome: string; servico_ids: number[] }>(
    `SELECT b.id, b.nome,
            COALESCE((SELECT array_agg(bs.servico_id ORDER BY bs.servico_id)
                        FROM barbeiro_servicos bs JOIN servicos s ON s.id = bs.servico_id
                       WHERE bs.barbeiro_id = b.id AND s.ativo), '{}') AS servico_ids
       FROM barbeiros b WHERE b.status = 'ATIVO' ORDER BY b.nome`,
  );
  return r.rows.map((b) => ({ id: b.id, nome: b.nome, servicoIds: b.servico_ids }));
}
