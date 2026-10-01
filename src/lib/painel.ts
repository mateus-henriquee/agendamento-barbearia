import type { Usuario } from "./auth";
import type { Db } from "./db";

/**
 * Quais barbeiros o usuário pode ver.
 * - BARBEIRO: sempre só ele mesmo (ignora qualquer filtro pedido).
 * - DONO: todos, ou um só se ele escolher.
 * `null` significa "todos".
 */
export function escopoDe(usuario: Usuario, barbeiroIdPedido?: number | null): number | null {
  if (usuario.papel === "BARBEIRO") return usuario.barbeiroId;
  return barbeiroIdPedido ?? null;
}

export type ItemAgenda = {
  id: number;
  inicio: string;
  fim: string;
  cliente: string;
  telefone: string;
  servico: string;
  barbeiro: string;
  barbeiroId: number;
  status: "CONFIRMADO" | "CANCELADO" | "FALTOU" | "CONCLUIDO";
  preco: number;
};

/** Agenda de um dia, em ordem de horário. */
export async function agendaDoDia(db: Db, escopo: number | null, data: string): Promise<ItemAgenda[]> {
  const r = await db.query<{
    id: number;
    inicio: string;
    fim: string;
    cliente: string;
    telefone: string;
    servico: string;
    barbeiro: string;
    barbeiro_id: number;
    status: ItemAgenda["status"];
    preco: number;
  }>(
    `SELECT a.id,
            to_char(a.hora_inicio, 'HH24:MI') AS inicio,
            to_char(a.hora_fim,    'HH24:MI') AS fim,
            c.nome AS cliente, c.telefone,
            s.nome AS servico,
            b.nome AS barbeiro, b.id AS barbeiro_id,
            a.status,
            a.preco_cobrado::float8 AS preco
       FROM agendamentos a
       JOIN clientes  c ON c.id = a.cliente_id
       JOIN servicos  s ON s.id = a.servico_id
       JOIN barbeiros b ON b.id = a.barbeiro_id
      WHERE a.data = $1::date
        AND ($2::int IS NULL OR a.barbeiro_id = $2::int)
      ORDER BY a.hora_inicio, b.nome`,
    [data, escopo],
  );
  return r.rows.map((l) => ({ ...l, barbeiroId: l.barbeiro_id }));
}

export type ResumoMes = {
  mes: string; // "2026-10"
  faturamento: number; // soma dos atendimentos CONCLUIDO
  previsto: number; // soma dos CONFIRMADO ainda não atendidos
  concluidos: number;
  confirmados: number;
  faltas: number;
  cancelados: number;
  servicoMaisPedido: string | null;
  ranking: { servico: string; quantidade: number }[];
  porBarbeiro: { barbeiro: string; concluidos: number; faturamento: number }[];
};

/** Números do mês. `mes` no formato "2026-10". */
export async function resumoDoMes(db: Db, escopo: number | null, mes: string): Promise<ResumoMes> {
  const inicio = `${mes}-01`;
  // Todo o mês: de inicio (inclusive) até inicio + 1 mês (exclusive).
  const periodo = `a.data >= $1::date AND a.data < ($1::date + interval '1 month')
                   AND ($2::int IS NULL OR a.barbeiro_id = $2::int)`;

  const totais = await db.query<{
    faturamento: number;
    previsto: number;
    concluidos: number;
    confirmados: number;
    faltas: number;
    cancelados: number;
  }>(
    `SELECT COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'CONCLUIDO'), 0)::float8  AS faturamento,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'CONFIRMADO'), 0)::float8 AS previsto,
            COUNT(*) FILTER (WHERE a.status = 'CONCLUIDO')::int  AS concluidos,
            COUNT(*) FILTER (WHERE a.status = 'CONFIRMADO')::int AS confirmados,
            COUNT(*) FILTER (WHERE a.status = 'FALTOU')::int     AS faltas,
            COUNT(*) FILTER (WHERE a.status = 'CANCELADO')::int  AS cancelados
       FROM agendamentos a
      WHERE ${periodo}`,
    [inicio, escopo],
  );

  // "Mais pedido": conta o que foi realmente marcado e não cancelado nem faltado.
  const ranking = await db.query<{ servico: string; quantidade: number }>(
    `SELECT s.nome AS servico, COUNT(*)::int AS quantidade
       FROM agendamentos a
       JOIN servicos s ON s.id = a.servico_id
      WHERE ${periodo} AND a.status IN ('CONFIRMADO', 'CONCLUIDO')
      GROUP BY s.id, s.nome
      ORDER BY quantidade DESC, s.nome
      LIMIT 5`,
    [inicio, escopo],
  );

  const porBarbeiro = await db.query<{ barbeiro: string; concluidos: number; faturamento: number }>(
    `SELECT b.nome AS barbeiro,
            COUNT(*)::int AS concluidos,
            COALESCE(SUM(a.preco_cobrado), 0)::float8 AS faturamento
       FROM agendamentos a
       JOIN barbeiros b ON b.id = a.barbeiro_id
      WHERE ${periodo} AND a.status = 'CONCLUIDO'
      GROUP BY b.id, b.nome
      ORDER BY faturamento DESC, b.nome`,
    [inicio, escopo],
  );

  return {
    mes,
    ...totais.rows[0],
    servicoMaisPedido: ranking.rows[0]?.servico ?? null,
    ranking: ranking.rows,
    porBarbeiro: porBarbeiro.rows,
  };
}

/**
 * Marca um atendimento como concluído ou como falta.
 * Só vale para agendamento CONFIRMADO, do dia de hoje ou anterior, dentro do escopo do usuário.
 * Retorna false em qualquer outro caso (não existe, de outro barbeiro, futuro, já marcado).
 */
export async function marcarAtendimento(
  db: Db,
  escopo: number | null,
  id: number,
  novoStatus: "CONCLUIDO" | "FALTOU",
  hoje: string,
): Promise<boolean> {
  const r = await db.query(
    `UPDATE agendamentos
        SET status = $2
      WHERE id = $1
        AND status = 'CONFIRMADO'
        AND data <= $3::date
        AND ($4::int IS NULL OR barbeiro_id = $4::int)
      RETURNING id`,
    [id, novoStatus, hoje, escopo],
  );
  return r.rows.length > 0;
}