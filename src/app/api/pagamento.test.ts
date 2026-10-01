import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, entrar } from "@/lib/auth";
import { crc16 } from "@/lib/pix";
import { POST as agendar } from "./agendamentos/route";
import { POST as confirmarPix } from "./painel/agendamentos/[id]/pago/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown, jar: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (ctx.jar.has(nome) ? { name: nome, value: ctx.jar.get(nome) } : undefined),
    set: (nome: string, valor: string) => ctx.jar.set(nome, valor),
    delete: (nome: string) => ctx.jar.delete(nome),
  }),
}));

const FUTURO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/004_reserva_com_prazo.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  ctx.jar.clear();
  vi.stubEnv("PIX_CHAVE", "barbearia@espiral.com");
  vi.stubEnv("PIX_NOME", "Barbearia Espiral");
  vi.stubEnv("PIX_CIDADE", "Sao Paulo");
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${FUTURO}', '09:00', '18:00'), (2, '${FUTURO}', '09:00', '18:00');
  `);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const reservar = (extra: Record<string, unknown> = {}, horaInicio = "10:00", barbeiroId = 1) =>
  agendar(
    new Request("http://x/api/agendamentos", {
      method: "POST",
      body: JSON.stringify({ barbeiroId, servicoId: 1, clienteId: 1, data: FUTURO, horaInicio, ...extra }),
    }),
  );
const total = async () => Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM agendamentos")).rows[0].n);

describe("POST /api/agendamentos com forma de pagamento", () => {
  it("Pix: 201 com o código copia e cola do valor do serviço", async () => {
    const r = await reservar({ formaPagamento: "PIX" });
    expect(r.status).toBe(201);
    const corpo = await r.json();
    expect(corpo.id).toBe(1);
    expect(corpo.pix.valor).toBe(40);
    expect(new Date(corpo.pix.expiraEm).getTime()).toBeGreaterThan(Date.now());
    expect(corpo.pix.copiaECola).toContain("br.gov.bcb.pix0121barbearia@espiral.com");
    expect(corpo.pix.copiaECola).toContain("540540.00");
    expect(corpo.pix.copiaECola).toContain("0503AG1"); // txid = AG + id do agendamento
    expect(corpo.pix.copiaECola.slice(-4)).toBe(crc16(corpo.pix.copiaECola.slice(0, -4)));
  });

  it("pagar após o corte (padrão): 201 sem Pix", async () => {
    const r = await reservar();
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: 1 });
  });

  it("Pix sem configuração: 422 e NÃO reserva o horário", async () => {
    vi.stubEnv("PIX_CHAVE", "");
    const r = await reservar({ formaPagamento: "PIX" });
    expect(r.status).toBe(422);
    expect((await r.json()).motivo).toBe("PIX_INDISPONIVEL");
    expect(await total()).toBe(0);
  });

  it("400 com forma de pagamento desconhecida", async () => {
    expect((await reservar({ formaPagamento: "CHEQUE" })).status).toBe(400);
  });
});

describe("POST /api/painel/agendamentos/:id/pago", () => {
  beforeEach(async () => {
    await criarUsuario(db, { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO", barbeiroId: 1 });
  });

  async function logar() {
    const r = await entrar(db, "joao@x.com", "senha-forte-2");
    if (!r.ok) throw new Error("login deveria funcionar");
    ctx.jar.set("sessao", r.token);
  }
  const pago = (id: number) =>
    confirmarPix(new Request(`http://x/api/painel/agendamentos/${id}/pago`, { method: "POST" }), {
      params: Promise.resolve({ id: String(id) }),
    });

  it("401 sem login", async () => {
    await reservar({ formaPagamento: "PIX" });
    expect((await pago(1)).status).toBe(401);
  });

  it("barbeiro confirma o Pix do próprio cliente (204) e não confirma de novo (404)", async () => {
    await reservar({ formaPagamento: "PIX" });
    await logar();
    expect((await pago(1)).status).toBe(204);
    expect((await pago(1)).status).toBe(404);
  });

  it("404 para Pix de outro barbeiro e para pagamento na barbearia", async () => {
    await reservar({ formaPagamento: "PIX" }, "10:00", 2); // do Pedro
    await reservar({}, "11:00", 1); // do João, mas pago na barbearia
    await logar();
    expect((await pago(1)).status).toBe(404);
    expect((await pago(2)).status).toBe(404);
  });
});
