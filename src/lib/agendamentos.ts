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

/** Quanto tempo o cliente tem para pagar o Pix antes de o horário ser liberado. */
export const PRAZO_PIX_MIN = 20;

/**
 * Cancela as reservas que não foram pagas a tempo, liberando o horário.
 * Roda antes de consultar horários e antes de reservar, então não precisa de agendador externo.
 */
export async function liberarExpirados(db: Db): Promise<number> {
  const r = await db.query(
    `UPDATE agendamentos SET status = 'CANCELADO'
      WHERE status = 'AGUARDANDO_PAGAMENTO' AND expira_em <= now()
      RETURNING id`,
  );
  return r.rows.length;
}

export type ResultadoAgendar =
  | { ok: true; id: number; preco: number; expiraEm: string | null }
  | {
      ok: false;
      motivo:
        | "CONFLITO"
        | "FORA_DO_EXPEDIENTE"
        | "SERVICO_NAO_ENCONTRADO"
        | "SERVICO_NAO_OFERECIDO"
        | "REFERENCIA_INVALIDA";
    };

/**
 * Cria um agendamento. A hora de fim é calculada aqui: início + duração do serviço.
 * Só insere se o horário estiver dentro do expediente de um barbeiro ATIVO.
 * Se outro agendamento ocupar o horário, o banco recusa (regra anti-conflito).
 */
export async function agendar(db: Db, n: NovoAgendamento): Promise<ResultadoAgendar> {
  await liberarExpirados(db); // horário de reserva vencida volta a ficar livre
  const servico = await db.query<{ duracao_min: number }>(
    "SELECT duracao_min FROM servicos WHERE id = $1 AND ativo",
    [n.servicoId],
  );
  if (servico.rows.length === 0) return { ok: false, motivo: "SERVICO_NAO_ENCONTRADO" };
  const duracao = servico.rows[0].duracao_min;
  if (!(await barbeiroFazServico(db, n.barbeiroId, n.servicoId))) {
    return { ok: false, motivo: "SERVICO_NAO_OFERECIDO" };
  }

  try {
    const r = await db.query<{ id: number; preco: number; expira_em: string | null }>(
      `INSERT INTO agendamentos
         (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento,
          status, expira_em)
       SELECT $1::int, $2::int, $3::int, $4::date, $5::time,
              $5::time + make_interval(mins => $6::int),
              (SELECT preco FROM servicos WHERE id = $2::int),
              $7::text,
              -- Pix de serviço com preço: o horário fica reservado até o prazo. Senão, já nasce confirmado.
              CASE WHEN $7::text = 'PIX' AND (SELECT preco FROM servicos WHERE id = $2::int) > 0
                   THEN 'AGUARDANDO_PAGAMENTO' ELSE 'CONFIRMADO' END,
              CASE WHEN $7::text = 'PIX' AND (SELECT preco FROM servicos WHERE id = $2::int) > 0
                   THEN now() + make_interval(mins => $8::int) END
       FROM horarios_funcionamento h
       JOIN barbeiros b ON b.id = h.barbeiro_id
       WHERE h.barbeiro_id = $1::int
         AND h.data = $4::date
         AND b.status = 'ATIVO'
         AND $5::time >= h.hora_inicio
         AND $5::time + make_interval(mins => $6::int) <= h.hora_fim
         AND $5::time + make_interval(mins => $6::int) > $5::time
       RETURNING id, preco_cobrado::float8 AS preco, expira_em::text AS expira_em`,
      [n.barbeiroId, n.servicoId, n.clienteId, n.data, n.horaInicio, duracao, n.formaPagamento ?? "NA_BARBEARIA", PRAZO_PIX_MIN],
    );
    if (r.rows.length === 0) return { ok: false, motivo: "FORA_DO_EXPEDIENTE" };
    return { ok: true, id: r.rows[0].id, preco: r.rows[0].preco, expiraEm: r.rows[0].expira_em };
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === VIOLACAO_EXCLUSAO) return { ok: false, motivo: "CONFLITO" };
    if (codigo === VIOLACAO_CHAVE_ESTRANGEIRA) return { ok: false, motivo: "REFERENCIA_INVALIDA" };
    throw erro; // erro inesperado: não escondemos
  }
}

/** Esse barbeiro faz esse serviço? */
export async function barbeiroFazServico(db: Db, barbeiroId: number, servicoId: number): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM barbeiro_servicos WHERE barbeiro_id = $1 AND servico_id = $2", [barbeiroId, servicoId]);
  return r.rows.length > 0;
}

/** Cancela um agendamento confirmado. Retorna false se não existir ou já estiver cancelado. */
export async function cancelar(db: Db, id: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE agendamentos SET status = 'CANCELADO'
     WHERE id = $1 AND status IN ('CONFIRMADO', 'AGUARDANDO_PAGAMENTO')
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
    "SELECT duracao_min FROM servicos WHERE id = $1 AND ativo",
    [p.servicoId],
  );
  if (servico.rows.length === 0) return [];
  if (!(await barbeiroFazServico(db, p.barbeiroId, p.servicoId))) return [];
  await liberarExpirados(db);

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
       AND status IN ('AGUARDANDO_PAGAMENTO', 'CONFIRMADO', 'CONCLUIDO')`,
    [p.barbeiroId, p.data],
  );

  return horariosLivres({
    expediente: expediente.rows[0],
    duracaoMin: servico.rows[0].duracao_min,
    ocupados: ocupados.rows,
    apartirDe: p.apartirDe,
  });
}
