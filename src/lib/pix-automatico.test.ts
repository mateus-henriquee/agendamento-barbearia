import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { liberarExpirados } from "./agendamentos";
import type { ConfigMercadoPago } from "./mercadopago";
import { aprovarPagamentoPix, devolucoesPendentes, marcarDevolvido, registrarPix, statusDoPagamento, tratarAvisoMercadoPago } from "./pix-automatico";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao", "009_pix_automatico"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});

const cfg: ConfigMercadoPago = { accessToken: "T", segredoWebhook: null, emailPagador: "c@b.com", apiUrl: "https://mp.test" };

// Agendamento 1: Pix aguardando (Ana). Agendamento 2: pagar na barbearia (Bia). Preço do Corte: 40.
beforeEach(async () => {
  await db.exec(`
    TRUNCATE pagamentos_pix, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001'), ('Bia', '5511900000002');
    INSERT INTO horarios_funcionamento (barbeiro_id, data, hora_inicio, hora_fim) VALUES (1, '2099-01-05', '09:00', '18:00');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento, status, expira_em) VALUES
      (1, 1, 1, '2099-01-05', '10:00', '10:30', 40, 'PIX', 'AGUARDANDO_PAGAMENTO', now() + interval '20 minutes'),
      (1, 1, 2, '2099-01-05', '11:00', '11:30', 40, 'NA_BARBEARIA', 'CONFIRMADO', NULL);
  `);
});

const agendamento = async (id: number) =>
  (await db.query<{ status: string; pago: boolean; expira_em: string | null }>("SELECT status, (pago_em IS NOT NULL) AS pago, expira_em::text FROM agendamentos WHERE id = $1", [id])).rows[0];
const situacao = async (mpId: string) => (await db.query<{ situacao: string }>("SELECT situacao FROM pagamentos_pix WHERE mp_id = $1", [mpId])).rows[0]?.situacao;

describe("registrarPix e statusDoPagamento", () => {
  it("devolve um código aleatório e o status começa 'não pago'", async () => {
    const token = await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(await statusDoPagamento(db, token)).toEqual({ pago: false, expirou: false });
    expect(await situacao("9001")).toBe("PENDENTE");
  });

  it("registrar duas vezes o mesmo pagamento não duplica nem troca o código", async () => {
    const a = await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    const b = await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(b).toBe(a);
  });

  it("código desconhecido não revela nada", async () => {
    expect(await statusDoPagamento(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("reserva vencida aparece como expirada", async () => {
    const token = await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    await db.exec("UPDATE agendamentos SET expira_em = now() - interval '1 minute' WHERE id = 1");
    expect(await statusDoPagamento(db, token)).toEqual({ pago: false, expirou: true });
    await liberarExpirados(db);
    expect(await statusDoPagamento(db, token)).toEqual({ pago: false, expirou: true });
  });
});

describe("aprovarPagamentoPix", () => {
  it("confirma a reserva e marca como paga", async () => {
    const token = await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("CONFIRMADO");
    expect(await agendamento(1)).toEqual({ status: "CONFIRMADO", pago: true, expira_em: null });
    expect(await situacao("9001")).toBe("APROVADO");
    expect(await statusDoPagamento(db, token)).toEqual({ pago: true, expirou: false });
  });

  it("avisos repetidos só valem uma vez", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    const p = { mpId: "9001", agendamentoId: 1, valor: 40 };
    expect(await aprovarPagamentoPix(db, p)).toBe("CONFIRMADO");
    expect(await aprovarPagamentoPix(db, p)).toBe("JA_PROCESSADO");
    expect(await aprovarPagamentoPix(db, p)).toBe("JA_PROCESSADO");
  });

  it("avisos simultâneos: só um passa pela porta", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    const p = { mpId: "9001", agendamentoId: 1, valor: 40 };
    const r = await Promise.all(Array.from({ length: 8 }, () => aprovarPagamentoPix(db, p)));
    expect(r.filter((x) => x === "CONFIRMADO")).toHaveLength(1);
    expect(r.filter((x) => x === "JA_PROCESSADO")).toHaveLength(7);
  });

  it("funciona mesmo se o aviso chegar antes do registro do Pix (corrida)", async () => {
    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("CONFIRMADO");
    expect(await situacao("9001")).toBe("APROVADO");
    // o registro tardio não desfaz a aprovação
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await situacao("9001")).toBe("APROVADO");
  });

  it("barbeiro já confirmou na mão: só garante que está pago", async () => {
    await db.exec("UPDATE agendamentos SET status = 'CONFIRMADO', pago_em = now() - interval '1 minute', expira_em = NULL WHERE id = 1");
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("CONFIRMADO");
    expect(await agendamento(1)).toMatchObject({ status: "CONFIRMADO", pago: true });
  });

  it("pagou depois do prazo e o horário continua livre: reativa", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    await db.exec("UPDATE agendamentos SET expira_em = now() - interval '2 minutes' WHERE id = 1");
    await liberarExpirados(db);
    expect((await agendamento(1)).status).toBe("CANCELADO");

    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("REATIVADO");
    expect(await agendamento(1)).toEqual({ status: "CONFIRMADO", pago: true, expira_em: null });
  });

  it("pagou depois do prazo e outra pessoa pegou o horário: vai para devolução", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    await db.exec("UPDATE agendamentos SET expira_em = now() - interval '2 minutes' WHERE id = 1");
    await liberarExpirados(db);
    // Bia ocupa o horário das 10:00
    await db.exec(`INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento, status)
                   VALUES (1, 1, 2, '2099-01-05', '10:00', '10:30', 40, 'NA_BARBEARIA', 'CONFIRMADO')`);

    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("REEMBOLSO_PENDENTE");
    expect((await agendamento(1)).status).toBe("CANCELADO");
    expect(await situacao("9001")).toBe("REEMBOLSO_PENDENTE");

    const lista = await devolucoesPendentes(db);
    expect(lista).toEqual([
      { mpId: "9001", valor: 40, cliente: "Ana", telefone: "5511900000001", servico: "Corte", data: "2099-01-05", hora: "10:00", pagoEm: expect.any(String) },
    ]);
  });

  it("valor diferente do preço: não confirma, vai para devolução", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 1 })).toBe("REEMBOLSO_PENDENTE");
    expect((await agendamento(1)).status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("agendamento de pagar na barbearia ou inexistente é ignorado", async () => {
    expect(await aprovarPagamentoPix(db, { mpId: "9002", agendamentoId: 2, valor: 40 })).toBe("IGNORADO");
    expect(await aprovarPagamentoPix(db, { mpId: "9003", agendamentoId: 999, valor: 40 })).toBe("IGNORADO");
    expect((await db.query("SELECT 1 FROM pagamentos_pix")).rows).toHaveLength(0);
  });

  it("agendamento cancelado de propósito (sem prazo de Pix) vai para devolução", async () => {
    await db.exec("UPDATE agendamentos SET status = 'CANCELADO', expira_em = NULL WHERE id = 1");
    expect(await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 })).toBe("REEMBOLSO_PENDENTE");
  });
});

describe("devoluções", () => {
  it("o dono marca como devolvido e some da lista; só vale uma vez", async () => {
    await db.exec("UPDATE agendamentos SET status = 'CANCELADO', expira_em = NULL WHERE id = 1");
    await aprovarPagamentoPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await devolucoesPendentes(db)).toHaveLength(1);
    expect(await marcarDevolvido(db, "9001")).toBe(true);
    expect(await devolucoesPendentes(db)).toHaveLength(0);
    expect(await marcarDevolvido(db, "9001")).toBe(false);
    expect(await situacao("9001")).toBe("DEVOLVIDO");
  });
});

describe("tratarAvisoMercadoPago", () => {
  const resposta = (o: object) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 9001, ...o }), { status: 200 }));
  const aprovado = { status: "approved", transaction_amount: 40, external_reference: "AG1", payment_method_id: "pix" };

  it("consulta a API e confirma quando aprovado", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await tratarAvisoMercadoPago(db, cfg, "9001", resposta(aprovado))).toEqual({ resultado: "CONFIRMADO" });
    expect((await agendamento(1)).pago).toBe(true);
  });

  it("pendente não confirma", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    expect(await tratarAvisoMercadoPago(db, cfg, "9001", resposta({ ...aprovado, status: "pending" }))).toEqual({ resultado: "SEM_EFEITO", detalhe: "pending" });
    expect((await agendamento(1)).pago).toBe(false);
  });

  it("cancelado/expirado marca o registro, sem mexer no agendamento", async () => {
    await registrarPix(db, { mpId: "9001", agendamentoId: 1, valor: 40 });
    await tratarAvisoMercadoPago(db, cfg, "9001", resposta({ ...aprovado, status: "expired" }));
    expect(await situacao("9001")).toBe("CANCELADO");
    expect((await agendamento(1)).status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("pagamento que não é de agendamento (outra referência ou outro método) é ignorado", async () => {
    expect((await tratarAvisoMercadoPago(db, cfg, "9001", resposta({ ...aprovado, external_reference: "PEDIDO-7" }))).resultado).toBe("IGNORADO");
    expect((await tratarAvisoMercadoPago(db, cfg, "9001", resposta({ ...aprovado, external_reference: null }))).resultado).toBe("IGNORADO");
    expect((await tratarAvisoMercadoPago(db, cfg, "9001", resposta({ ...aprovado, payment_method_id: "visa" }))).resultado).toBe("IGNORADO");
    expect((await db.query("SELECT 1 FROM pagamentos_pix")).rows).toHaveLength(0);
  });

  it("erro ao consultar vira ERRO (o webhook pede nova tentativa); 404 é ignorado", async () => {
    const quebra = vi.fn().mockResolvedValue(new Response("x", { status: 500 }));
    expect((await tratarAvisoMercadoPago(db, cfg, "9001", quebra)).resultado).toBe("ERRO");
    const naoExiste = vi.fn().mockResolvedValue(new Response("x", { status: 404 }));
    expect((await tratarAvisoMercadoPago(db, cfg, "9001", naoExiste)).resultado).toBe("IGNORADO");
  });
});
