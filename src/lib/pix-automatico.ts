import type { Db } from "./db";
import { buscarPagamento, type ConfigMercadoPago } from "./mercadopago";

const VIOLACAO_EXCLUSAO = "23P01"; // outro cliente já ocupa o horário

/** Guarda o Pix que acabamos de criar. Devolve o código que o navegador usa para consultar o status. */
export async function registrarPix(db: Db, p: { mpId: string; agendamentoId: number; valor: number }): Promise<string> {
  const r = await db.query<{ consulta_token: string }>(
    `INSERT INTO pagamentos_pix (mp_id, agendamento_id, valor) VALUES ($1, $2, $3)
     ON CONFLICT (mp_id) DO UPDATE SET valor = EXCLUDED.valor
     RETURNING consulta_token`,
    [p.mpId, p.agendamentoId, p.valor],
  );
  return r.rows[0].consulta_token;
}

export type ResultadoAprovacao =
  | "CONFIRMADO" // reserva estava aguardando e agora está paga
  | "REATIVADO" // pagou depois do prazo, mas o horário ainda estava livre
  | "REEMBOLSO_PENDENTE" // pagou, mas o horário já era de outra pessoa (ou o valor não bate): o dono precisa devolver
  | "JA_PROCESSADO"
  | "IGNORADO";

/**
 * O Mercado Pago aprovou um pagamento: marca o agendamento como pago.
 * Pode rodar várias vezes para o mesmo pagamento (o Mercado Pago repete avisos): só a primeira faz efeito.
 */
export async function aprovarPagamentoPix(db: Db, p: { mpId: string; agendamentoId: number; valor: number }): Promise<ResultadoAprovacao> {
  const ag = await db.query<{ status: string; preco: number; forma: string; expira_em: string | null }>(
    "SELECT status, preco_cobrado::float8 AS preco, forma_pagamento AS forma, expira_em::text AS expira_em FROM agendamentos WHERE id = $1",
    [p.agendamentoId],
  );
  const a = ag.rows[0];
  if (!a || a.forma !== "PIX") return "IGNORADO";

  const valorBate = Math.abs(a.preco - p.valor) < 0.005;

  // Porta de entrada: só o primeiro aviso de cada pagamento passa daqui.
  const porta = await db.query(
    `INSERT INTO pagamentos_pix (mp_id, agendamento_id, valor, situacao, aprovado_em)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (mp_id) DO UPDATE SET situacao = EXCLUDED.situacao, aprovado_em = now()
       WHERE pagamentos_pix.situacao IN ('PENDENTE', 'CANCELADO')
     RETURNING mp_id`,
    [p.mpId, p.agendamentoId, p.valor, valorBate ? "APROVADO" : "REEMBOLSO_PENDENTE"],
  );
  if (porta.rows.length === 0) return "JA_PROCESSADO";
  if (!valorBate) return "REEMBOLSO_PENDENTE";

  const marcarComoDevolver = async (): Promise<ResultadoAprovacao> => {
    await db.query("UPDATE pagamentos_pix SET situacao = 'REEMBOLSO_PENDENTE' WHERE mp_id = $1", [p.mpId]);
    return "REEMBOLSO_PENDENTE";
  };

  if (a.status === "CANCELADO") {
    // Reserva vencida (ou cancelada). Só reativamos se foi por falta de pagamento e o horário continua livre.
    if (a.expira_em === null) return marcarComoDevolver();
    try {
      await db.query(
        `UPDATE agendamentos SET status = 'CONFIRMADO', pago_em = COALESCE(pago_em, now()), expira_em = NULL WHERE id = $1`,
        [p.agendamentoId],
      );
      return "REATIVADO";
    } catch (erro) {
      if ((erro as { code?: string }).code === VIOLACAO_EXCLUSAO) return marcarComoDevolver();
      throw erro;
    }
  }

  await db.query(
    `UPDATE agendamentos
        SET pago_em = COALESCE(pago_em, now()),
            expira_em = NULL,
            status = CASE WHEN status = 'AGUARDANDO_PAGAMENTO' THEN 'CONFIRMADO' ELSE status END
      WHERE id = $1`,
    [p.agendamentoId],
  );
  return "CONFIRMADO";
}

export type ResultadoAviso = { resultado: "IGNORADO" | "ERRO" | ResultadoAprovacao | "SEM_EFEITO"; detalhe?: string };

/**
 * Trata um aviso do Mercado Pago. O aviso só diz "o pagamento X mudou": quem decide é a consulta feita na API.
 * `ERRO` = não conseguimos consultar; o webhook deve responder erro para o Mercado Pago tentar de novo.
 */
export async function tratarAvisoMercadoPago(
  db: Db,
  cfg: ConfigMercadoPago,
  mpId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoAviso> {
  const r = await buscarPagamento(cfg, mpId, fetchImpl);
  if (!r.ok) {
    // 404: o Mercado Pago não conhece esse pagamento (ex.: aviso de teste do painel deles). Tentar de novo não adianta.
    if (r.status === 404) return { resultado: "IGNORADO", detalhe: "pagamento não encontrado" };
    return { resultado: "ERRO", detalhe: `status ${r.status}: ${r.erro}` };
  }
  const pg = r.pagamento;

  const m = pg.referencia?.match(/^AG(\d+)$/);
  if (!m || pg.metodo !== "pix") return { resultado: "IGNORADO", detalhe: "pagamento que não é de agendamento" };
  const agendamentoId = Number(m[1]);

  if (pg.status === "approved") {
    return { resultado: await aprovarPagamentoPix(db, { mpId: pg.id, agendamentoId, valor: pg.valor }) };
  }
  if (["cancelled", "expired", "rejected"].includes(pg.status)) {
    await db.query("UPDATE pagamentos_pix SET situacao = 'CANCELADO' WHERE mp_id = $1 AND situacao = 'PENDENTE'", [pg.id]);
  }
  return { resultado: "SEM_EFEITO", detalhe: pg.status };
}

export type StatusPagamento = { pago: boolean; expirou: boolean };

/** O cliente pergunta "já caiu?". Só quem tem o código aleatório consegue consultar. */
export async function statusDoPagamento(db: Db, token: string): Promise<StatusPagamento | null> {
  const r = await db.query<{ pago: boolean; status: string; expirado: boolean }>(
    `SELECT (a.pago_em IS NOT NULL) AS pago,
            a.status,
            (a.status = 'AGUARDANDO_PAGAMENTO' AND a.expira_em <= now()) AS expirado
       FROM pagamentos_pix p
       JOIN agendamentos a ON a.id = p.agendamento_id
      WHERE p.consulta_token = $1`,
    [token],
  );
  const l = r.rows[0];
  if (!l) return null;
  return { pago: l.pago, expirou: !l.pago && (l.status === "CANCELADO" || l.expirado) };
}

export type Devolucao = { mpId: string; valor: number; cliente: string; telefone: string; servico: string; data: string; hora: string; pagoEm: string };

/** Pagamentos que o Mercado Pago recebeu mas que não geraram horário. O dono devolve o dinheiro no painel do Mercado Pago. */
export async function devolucoesPendentes(db: Db): Promise<Devolucao[]> {
  const r = await db.query<{ mp_id: string; valor: number; cliente: string; telefone: string; servico: string; data: string; hora: string; pago_em: string }>(
    `SELECT p.mp_id, p.valor::float8 AS valor, c.nome AS cliente, c.telefone, s.nome AS servico,
            a.data::text AS data, to_char(a.hora_inicio, 'HH24:MI') AS hora, p.aprovado_em::text AS pago_em
       FROM pagamentos_pix p
       JOIN agendamentos a ON a.id = p.agendamento_id
       JOIN clientes c ON c.id = a.cliente_id
       JOIN servicos s ON s.id = a.servico_id
      WHERE p.situacao = 'REEMBOLSO_PENDENTE'
      ORDER BY p.aprovado_em`,
  );
  return r.rows.map(({ mp_id, pago_em, ...l }) => ({ ...l, mpId: mp_id, pagoEm: pago_em }));
}

/** O dono avisa que já devolveu o dinheiro. */
export async function marcarDevolvido(db: Db, mpId: string): Promise<boolean> {
  const r = await db.query("UPDATE pagamentos_pix SET situacao = 'DEVOLVIDO' WHERE mp_id = $1 AND situacao = 'REEMBOLSO_PENDENTE' RETURNING mp_id", [mpId]);
  return r.rows.length > 0;
}
