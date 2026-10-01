import type { Db } from "./db";

export type Servico = { id: number; nome: string; duracaoMin: number; preco: number };
export type BarbeiroPublico = { id: number; nome: string };

export async function listarServicos(db: Db): Promise<Servico[]> {
  const r = await db.query<{ id: number; nome: string; duracao_min: number; preco: number }>(
    "SELECT id, nome, duracao_min, preco::float8 AS preco FROM servicos ORDER BY nome",
  );
  return r.rows.map((s) => ({ id: s.id, nome: s.nome, duracaoMin: s.duracao_min, preco: s.preco }));
}

/** Só barbeiros ATIVOS aparecem para o cliente. */
export async function listarBarbeiros(db: Db): Promise<BarbeiroPublico[]> {
  const r = await db.query<BarbeiroPublico>(
    "SELECT id, nome FROM barbeiros WHERE status = 'ATIVO' ORDER BY nome",
  );
  return r.rows;
}