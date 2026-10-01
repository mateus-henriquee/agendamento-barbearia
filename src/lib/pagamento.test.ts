import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agendar } from "./agendamentos";
import { agendaDoDia, confirmarPagamento, marcarAtendimento } from "./painel";

const DIA = "2026-10-05";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/004_reserva_com_prazo.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '18:00'), (2, '${DIA}', '09:00', '18:00');
  `);
});

const marcar = (horaInicio: string, formaPagamento?: "PIX" | "NA_BARBEARIA", barbeiroId = 1) =>
  agendar(db, { barbeiroId, servicoId: 1, clienteId: 1, data: DIA, horaInicio, formaPagamento });

const linha = async (id: number) =>
  (await db.query<{ forma_pagamento: string; pago_em: string | null; status: string }>(
    "SELECT forma_pagamento, pago_em, status FROM agendamentos WHERE id = $1",
    [id],
  )).rows[0];

describe("agendar com forma de pagamento", () => {
  it("padrão é pagar na barbearia", async () => {
    const r = await marcar("10:00");
    if (!r.ok) throw new Error("deveria agendar");
    expect((await linha(r.id)).forma_pagamento).toBe("NA_BARBEARIA");
  });

  it("grava Pix e devolve o preço do serviço", async () => {
    const r = await marcar("10:00", "PIX");
    if (!r.ok) throw new Error("deveria agendar");
    expect(r.preco).toBe(40);
    expect(await linha(r.id)).toMatchObject({ forma_pagamento: "PIX", pago_em: null });
  });

  it("o banco recusa forma de pagamento desconhecida", async () => {
    // @ts-expect-error: valor inválido de propósito
    await expect(marcar("10:00", "CHEQUE")).rejects.toThrow();
  });
});

describe("concluir atendimento", () => {
  it("pago na barbearia: concluir já registra o pagamento", async () => {
    const r = await marcar("10:00");
    if (!r.ok) throw new Error();
    await marcarAtendimento(db, null, r.id, "CONCLUIDO", DIA);
    expect((await linha(r.id)).pago_em).not.toBeNull();
  });

  it("Pix: concluir NÃO registra pagamento (só quando o barbeiro confirma o Pix)", async () => {
    const r = await marcar("10:00", "PIX");
    if (!r.ok) throw new Error();
    await db.query("UPDATE agendamentos SET status = 'CONFIRMADO' WHERE id = $1", [r.id]); // como se o prazo não valesse
    await marcarAtendimento(db, null, r.id, "CONCLUIDO", DIA);
    expect(await linha(r.id)).toMatchObject({ status: "CONCLUIDO", pago_em: null });
  });

  it("falta não registra pagamento", async () => {
    const r = await marcar("10:00");
    if (!r.ok) throw new Error();
    await marcarAtendimento(db, null, r.id, "FALTOU", DIA);
    expect((await linha(r.id)).pago_em).toBeNull();
  });
});

describe("confirmarPagamento", () => {
  it("confirma o Pix de um agendamento", async () => {
    const r = await marcar("10:00", "PIX");
    if (!r.ok) throw new Error();
    expect(await confirmarPagamento(db, 1, r.id)).toBe(true);
    expect((await linha(r.id)).pago_em).not.toBeNull();
  });

  it("não confirma duas vezes", async () => {
    const r = await marcar("10:00", "PIX");
    if (!r.ok) throw new Error();
    await confirmarPagamento(db, 1, r.id);
    expect(await confirmarPagamento(db, 1, r.id)).toBe(false);
  });

  it("não vale para pagamento na barbearia", async () => {
    const r = await marcar("10:00");
    if (!r.ok) throw new Error();
    expect(await confirmarPagamento(db, null, r.id)).toBe(false);
  });

  it("barbeiro não confirma Pix de outro barbeiro; dono confirma", async () => {
    const r = await marcar("10:00", "PIX", 2);
    if (!r.ok) throw new Error();
    expect(await confirmarPagamento(db, 1, r.id)).toBe(false);
    expect(await confirmarPagamento(db, null, r.id)).toBe(true);
  });

  it("não vale para agendamento cancelado ou inexistente", async () => {
    const r = await marcar("10:00", "PIX");
    if (!r.ok) throw new Error();
    await db.exec("UPDATE agendamentos SET status = 'CANCELADO'");
    expect(await confirmarPagamento(db, null, r.id)).toBe(false);
    expect(await confirmarPagamento(db, null, 999)).toBe(false);
  });
});

describe("agenda do dia mostra o pagamento", () => {
  it("traz forma de pagamento e se já foi pago", async () => {
    const a = await marcar("09:00", "PIX");
    const b = await marcar("10:00");
    if (!a.ok || !b.ok) throw new Error();
    await confirmarPagamento(db, null, a.id);
    const agenda = await agendaDoDia(db, null, DIA);
    expect(agenda.map((i) => [i.formaPagamento, i.pago])).toEqual([
      ["PIX", true],
      ["NA_BARBEARIA", false],
    ]);
  });
});
