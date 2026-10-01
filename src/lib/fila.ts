import { barbeiroFazServico, horariosDisponiveis } from "./agendamentos";
import { agoraNaBarbearia } from "./agora";
import type { Db } from "./db";

const VIOLACAO_UNICA = "23505";
const VIOLACAO_CHAVE_ESTRANGEIRA = "23503";

export type EntradaFila = { clienteId: number; barbeiroId: number; servicoId: number; data: string };

export type ResultadoEntrar =
  | { ok: true; id: number; posicao: number }
  | { ok: false; motivo: "HA_HORARIO_LIVRE" | "JA_NA_FILA" | "REFERENCIA_INVALIDA" };

/**
 * Coloca o cliente na fila de um barbeiro em um dia.
 * Só aceita se o dia estiver cheio: havendo horário livre, o cliente deve agendar.
 */
export async function entrarNaFila(db: Db, e: EntradaFila): Promise<ResultadoEntrar> {
  if (!(await barbeiroFazServico(db, e.barbeiroId, e.servicoId))) return { ok: false, motivo: "REFERENCIA_INVALIDA" };
  const livres = await horariosDisponiveis(db, { barbeiroId: e.barbeiroId, servicoId: e.servicoId, data: e.data });
  if (livres.length > 0) return { ok: false, motivo: "HA_HORARIO_LIVRE" };

  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO fila_espera (cliente_id, barbeiro_id, servico_id, data)
       VALUES ($1, $2, $3, $4::date) RETURNING id`,
      [e.clienteId, e.barbeiroId, e.servicoId, e.data],
    );
    const id = r.rows[0].id;
    const p = await db.query<{ posicao: number }>(
      `SELECT COUNT(*)::int AS posicao FROM fila_espera
        WHERE barbeiro_id = $1 AND data = $2::date AND status = 'AGUARDANDO' AND id <= $3`,
      [e.barbeiroId, e.data, id],
    );
    return { ok: true, id, posicao: p.rows[0].posicao };
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === VIOLACAO_UNICA) return { ok: false, motivo: "JA_NA_FILA" };
    if (codigo === VIOLACAO_CHAVE_ESTRANGEIRA) return { ok: false, motivo: "REFERENCIA_INVALIDA" };
    throw erro;
  }
}

export type ItemFila = {
  id: number;
  cliente: string;
  telefone: string;
  servico: string;
  barbeiro: string;
  barbeiroId: number;
  status: "AGUARDANDO" | "AVISADO";
  posicao: number; // 1 = primeiro da fila daquele barbeiro naquele dia
  vagaLivre: boolean; // abriu horário que cabe no serviço desse cliente?
};

/** Fila de um dia (dentro do escopo do usuário), em ordem de chegada. */
export async function filaDoDia(db: Db, escopo: number | null, data: string): Promise<ItemFila[]> {
  const r = await db.query<{
    id: number;
    cliente: string;
    telefone: string;
    servico: string;
    servico_id: number;
    barbeiro: string;
    barbeiro_id: number;
    status: ItemFila["status"];
  }>(
    `SELECT f.id, c.nome AS cliente, c.telefone, s.nome AS servico, s.id AS servico_id,
            b.nome AS barbeiro, b.id AS barbeiro_id, f.status
       FROM fila_espera f
       JOIN clientes  c ON c.id = f.cliente_id
       JOIN servicos  s ON s.id = f.servico_id
       JOIN barbeiros b ON b.id = f.barbeiro_id
      WHERE f.data = $1::date AND f.status IN ('AGUARDANDO', 'AVISADO')
        AND ($2::int IS NULL OR f.barbeiro_id = $2::int)
      ORDER BY b.nome, f.id`,
    [data, escopo],
  );

  const agora = agoraNaBarbearia();
  const contador = new Map<number, number>();
  const livresCache = new Map<string, string[]>();
  const itens: ItemFila[] = [];
  for (const l of r.rows) {
    const posicao = (contador.get(l.barbeiro_id) ?? 0) + 1;
    contador.set(l.barbeiro_id, posicao);

    const chave = `${l.barbeiro_id}|${l.servico_id}`;
    if (!livresCache.has(chave)) {
      livresCache.set(
        chave,
        await horariosDisponiveis(db, {
          barbeiroId: l.barbeiro_id,
          servicoId: l.servico_id,
          data,
          apartirDe: data === agora.data ? agora.hora : undefined,
        }),
      );
    }
    itens.push({
      id: l.id,
      cliente: l.cliente,
      telefone: l.telefone,
      servico: l.servico,
      barbeiro: l.barbeiro,
      barbeiroId: l.barbeiro_id,
      status: l.status,
      posicao,
      vagaLivre: livresCache.get(chave)!.length > 0,
    });
  }
  return itens;
}

/** Barbeiro avisou o cliente (AVISADO) ou tirou da fila (REMOVIDO). Respeita o escopo do usuário. */
export async function atualizarFila(
  db: Db,
  escopo: number | null,
  id: number,
  status: "AVISADO" | "REMOVIDO",
): Promise<boolean> {
  const r = await db.query(
    `UPDATE fila_espera
        SET status = $2::text,
            avisado_em = CASE WHEN $2::text = 'AVISADO' THEN now() ELSE avisado_em END
      WHERE id = $1 AND status IN ('AGUARDANDO', 'AVISADO')
        AND ($3::int IS NULL OR barbeiro_id = $3::int)
      RETURNING id`,
    [id, status, escopo],
  );
  return r.rows.length > 0;
}
