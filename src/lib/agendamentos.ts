import type { Db } from "./db";
import { horariosLivres } from "./horarios";

// Códigos de erro do Postgres que sabemos tratar.
const VIOLACAO_EXCLUSAO = "23P01"; // regra anti-conflito
const VIOLACAO_CHAVE_ESTRANGEIRA = "23503"; // cliente/barbeiro inexistente

export type NovoAgendamento = {
  barbeiroId: number;
  servicoId: number;
  clienteId: number;
  data: string; // "2026-10-05"
  horaInicio: string; // "14:30"
  formaPagamento?: FormaPagamento; // padrão: pagar na barbearia
};

export type FormaPagamento = "PIX" | "NA_BARBEARIA";

export type ResultadoAgendar =
  | { ok: true; id: number; preco: number }
  | {
      ok: false;
      motivo:
        | "CONFLITO"
        | "FORA_DO_EXPEDIENTE"
        | "SERVICO_NAO_ENCONTRADO"
        | "REFERENCIA_INVALIDA";
    };

/**
 * Cria um agendamento. A hora de fim é calculada aqui: início + duração do serviço.
 * Só insere se o horário estiver dentro do expediente de um barbeiro ATIVO.
 * Se outro agendamento ocupar o horário, o banco recusa (regra anti-conflito).
 */
export async function agendar(db: Db, n: NovoAgendamento): Promise<ResultadoAgendar> {
  const servico = await db.query<{ duracao_min: number }>(
    "SELECT duracao_min FROM servicos WHERE id = $1",
    [n.servicoId],
  );
  if (servico.rows.length === 0) return { ok: false, motivo: "SERVICO_NAO_ENCONTRADO" };
  const duracao = servico.rows[0].duracao_min;

  try {
    const r = await db.query<{ id: number; preco: number }>(
      `INSERT INTO agendamentos
         (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento)
       SELECT $1::int, $2::int, $3::int, $4::date, $5::time,
              $5::time + make_interval(mins => $6::int),
              (SELECT preco FROM servicos WHERE id = $2::int),
              $7::text
       FROM horarios_funcionamento h
       JOIN barbeiros b ON b.id = h.barbeiro_id
       WHERE h.barbeiro_id = $1::int
         AND h.data = $4::date
         AND b.status = 'ATIVO'
         AND $5::time >= h.hora_inicio
         AND $5::time + make_interval(mins => $6::int) <= h.hora_fim
         AND $5::time + make_interval(mins => $6::int) > $5::time
       RETURNING id, preco_cobrado::float8 AS preco`,
      [n.barbeiroId, n.servicoId, n.clienteId, n.data, n.horaInicio, duracao, n.formaPagamento ?? "NA_BARBEARIA"],
    );
    if (r.rows.length === 0) return { ok: false, motivo: "FORA_DO_EXPEDIENTE" };
    return { ok: true, id: r.rows[0].id, preco: r.rows[0].preco };
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === VIOLACAO_EXCLUSAO) return { ok: false, motivo: "CONFLITO" };
    if (codigo === VIOLACAO_CHAVE_ESTRANGEIRA) return { ok: false, motivo: "REFERENCIA_INVALIDA" };
    throw erro; // erro inesperado: não escondemos
  }
}

/** Cancela um agendamento confirmado. Retorna false se não existir ou já estiver cancelado. */
export async function cancelar(db: Db, id: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE agendamentos SET status = 'CANCELADO'
     WHERE id = $1 AND status = 'CONFIRMADO'
     RETURNING id`,
    [id],
  );
  return r.rows.length > 0;
}

/** Horários de início livres de um barbeiro para um serviço em uma data. */
export async function horariosDisponiveis(
  db: Db,
  p: { barbeiroId: number; servicoId: number; data: string; apartirDe?: string },
): Promise<string[]> {
  const servico = await db.query<{ duracao_min: number }>(
    "SELECT duracao_min FROM servicos WHERE id = $1",
    [p.servicoId],
  );
  if (servico.rows.length === 0) return [];

  const expediente = await db.query<{ inicio: string; fim: string }>(
    `SELECT to_char(h.hora_inicio, 'HH24:MI') AS inicio,
            to_char(h.hora_fim,    'HH24:MI') AS fim
     FROM horarios_funcionamento h
     JOIN barbeiros b ON b.id = h.barbeiro_id
     WHERE h.barbeiro_id = $1 AND h.data = $2::date AND b.status = 'ATIVO'`,
    [p.barbeiroId, p.data],
  );
  if (expediente.rows.length === 0) return []; // folga ou barbeiro ausente

  const ocupados = await db.query<{ inicio: string; fim: string }>(
    `SELECT to_char(hora_inicio, 'HH24:MI') AS inicio,
            to_char(hora_fim,    'HH24:MI') AS fim
     FROM agendamentos
     WHERE barbeiro_id = $1 AND data = $2::date
       AND status IN ('CONFIRMADO', 'CONCLUIDO')`,
    [p.barbeiroId, p.data],
  );

  return horariosLivres({
    expediente: expediente.rows[0],
    duracaoMin: servico.rows[0].duracao_min,
    ocupados: ocupados.rows,
    apartirDe: p.apartirDe,
  });
}
