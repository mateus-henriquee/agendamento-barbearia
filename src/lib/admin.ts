import type { Db } from "./db";

const VIOLACAO_CHAVE_ESTRANGEIRA = "23503";

export type BarbeiroAdmin = {
  id: number;
  nome: string;
  status: "ATIVO" | "AUSENTE";
  servicoIds: number[];
  temLogin: boolean;
};
export type ServicoAdmin = { id: number; nome: string; duracaoMin: number; preco: number; ativo: boolean };

export async function listarBarbeirosAdmin(db: Db): Promise<BarbeiroAdmin[]> {
  const r = await db.query<{ id: number; nome: string; status: BarbeiroAdmin["status"]; servico_ids: number[]; tem_login: boolean }>(
    `SELECT b.id, b.nome, b.status,
            COALESCE((SELECT array_agg(bs.servico_id ORDER BY bs.servico_id)
                        FROM barbeiro_servicos bs WHERE bs.barbeiro_id = b.id), '{}') AS servico_ids,
            EXISTS (SELECT 1 FROM usuarios u WHERE u.barbeiro_id = b.id) AS tem_login
       FROM barbeiros b ORDER BY b.nome`,
  );
  return r.rows.map((b) => ({ id: b.id, nome: b.nome, status: b.status, servicoIds: b.servico_ids, temLogin: b.tem_login }));
}

export async function listarServicosAdmin(db: Db): Promise<ServicoAdmin[]> {
  const r = await db.query<{ id: number; nome: string; duracao_min: number; preco: number; ativo: boolean }>(
    "SELECT id, nome, duracao_min, preco::float8 AS preco, ativo FROM servicos ORDER BY ativo DESC, nome",
  );
  return r.rows.map((s) => ({ id: s.id, nome: s.nome, duracaoMin: s.duracao_min, preco: s.preco, ativo: s.ativo }));
}

/** Define exatamente quais serviços o barbeiro faz. false se o barbeiro ou algum serviço não existe. */
export async function definirServicosDoBarbeiro(db: Db, barbeiroId: number, servicoIds: number[]): Promise<boolean> {
  try {
    const existe = await db.query("SELECT 1 FROM barbeiros WHERE id = $1", [barbeiroId]);
    if (existe.rows.length === 0) return false;
    await db.query("DELETE FROM barbeiro_servicos WHERE barbeiro_id = $1 AND servico_id <> ALL($2::int[])", [barbeiroId, servicoIds]);
    await db.query(
      `INSERT INTO barbeiro_servicos (barbeiro_id, servico_id)
       SELECT $1::int, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [barbeiroId, servicoIds],
    );
    return true;
  } catch (erro) {
    if ((erro as { code?: string }).code === VIOLACAO_CHAVE_ESTRANGEIRA) return false; // serviço inexistente
    throw erro;
  }
}

/** Cria o barbeiro já com os serviços escolhidos. Devolve o id, ou null se algum serviço não existe. */
export async function criarBarbeiro(db: Db, n: { nome: string; servicoIds: number[] }): Promise<number | null> {
  const r = await db.query<{ id: number }>("INSERT INTO barbeiros (nome) VALUES ($1) RETURNING id", [n.nome]);
  const id = r.rows[0].id;
  if (!(await definirServicosDoBarbeiro(db, id, n.servicoIds))) {
    await db.query("DELETE FROM barbeiros WHERE id = $1", [id]); // desfaz: não deixa barbeiro pela metade
    return null;
  }
  return id;
}

export async function atualizarBarbeiro(
  db: Db,
  id: number,
  m: { nome?: string; status?: "ATIVO" | "AUSENTE"; servicoIds?: number[] },
): Promise<boolean> {
  const r = await db.query(
    `UPDATE barbeiros SET nome = COALESCE($2::text, nome), status = COALESCE($3::text, status)
      WHERE id = $1 RETURNING id`,
    [id, m.nome ?? null, m.status ?? null],
  );
  if (r.rows.length === 0) return false;
  if (m.servicoIds) return definirServicosDoBarbeiro(db, id, m.servicoIds);
  return true;
}

export async function criarServico(db: Db, s: { nome: string; duracaoMin: number; preco: number }): Promise<number> {
  const r = await db.query<{ id: number }>(
    "INSERT INTO servicos (nome, duracao_min, preco) VALUES ($1, $2, $3) RETURNING id",
    [s.nome, s.duracaoMin, s.preco],
  );
  return r.rows[0].id;
}

/** Preço novo vale para os próximos agendamentos; os antigos guardam o preço da época. */
export async function atualizarServico(
  db: Db,
  id: number,
  m: { nome?: string; duracaoMin?: number; preco?: number; ativo?: boolean },
): Promise<boolean> {
  const r = await db.query(
    `UPDATE servicos
        SET nome = COALESCE($2::text, nome),
            duracao_min = COALESCE($3::int, duracao_min),
            preco = COALESCE($4::numeric, preco),
            ativo = COALESCE($5::boolean, ativo)
      WHERE id = $1 RETURNING id`,
    [id, m.nome ?? null, m.duracaoMin ?? null, m.preco ?? null, m.ativo ?? null],
  );
  return r.rows.length > 0;
}
