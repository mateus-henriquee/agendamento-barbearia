import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, entrar } from "@/lib/auth";
import { POST as agendar } from "./agendamentos/route";
import { GET as statusPagamento } from "./pagamentos/[token]/route";
import { POST as webhook } from "./pagamentos/mercadopago/webhook/route";
import { GET as listarDevolucoes } from "./painel/devolucoes/route";
import { POST as devolvido } from "./painel/devolucoes/[mpId]/route";

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
const SEGREDO = "segredo-webhook";
let db: PGlite;
let mp: ReturnType<typeof vi.fn>;
let pagamentoNoMP: Record<string, unknown>;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao", "009_pix_automatico"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  ctx.jar.clear();
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "APP_USR-teste");
  vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("APP_URL", "https://barbearia.test");
  vi.stubEnv("PIX_CHAVE", "");
  vi.stubEnv("PIX_NOME", "");
  vi.stubEnv("PIX_CIDADE", "");
  pagamentoNoMP = { id: 5001, status: "approved", transaction_amount: 40, external_reference: "AG1", payment_method_id: "pix" };
  mp = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ id: 5001, point_of_interaction: { transaction_data: { qr_code: "CODIGO-MP-123" } } }), { status: 201 });
    }
    return new Response(JSON.stringify(pagamentoNoMP), { status: 200 });
  });
  vi.stubGlobal("fetch", mp);
  await db.exec(`
    TRUNCATE usuarios, sessoes, pagamentos_pix, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${FUTURO}', '09:00', '18:00');
  `);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reservar = (horaInicio = "10:00") =>
  agendar(
    new Request("http://x/api/agendamentos", {
      method: "POST",
      body: JSON.stringify({ barbeiroId: 1, servicoId: 1, clienteId: 1, data: FUTURO, horaInicio, formaPagamento: "PIX" }),
    }),
  );
const statusAg = async (id = 1) => (await db.query<{ status: string; pago: boolean }>("SELECT status, pago_em IS NOT NULL AS pago FROM agendamentos WHERE id=$1", [id])).rows[0];

function aviso(dataId: string, { assinar = true, tipo = "payment" } = {}) {
  const ts = "1700000000";
  const reqId = "req-1";
  const v1 = createHmac("sha256", SEGREDO).update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex");
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": reqId };
  if (assinar) headers["x-signature"] = `ts=${ts},v1=${v1}`;
  return new Request(`http://x/api/pagamentos/mercadopago/webhook?data.id=${dataId}&type=${tipo}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: tipo, data: { id: dataId } }),
  });
}

describe("POST /api/agendamentos com Mercado Pago", () => {
  it("devolve o código do Mercado Pago e o código de consulta", async () => {
    const r = await reservar();
    expect(r.status).toBe(201);
    const c = await r.json();
    expect(c.pix).toMatchObject({ copiaECola: "CODIGO-MP-123", valor: 40, automatico: true });
    expect(c.pix.consulta).toMatch(/^[0-9a-f-]{36}$/);
    const [url, init] = mp.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    expect(JSON.parse(init.body).notification_url).toBe("https://barbearia.test/api/pagamentos/mercadopago/webhook");
    expect(JSON.parse(init.body).external_reference).toBe("AG1");
  });

  it("Mercado Pago fora do ar e sem Pix estático: 502 e libera o horário", async () => {
    mp.mockResolvedValue(new Response("erro", { status: 500 }));
    const r = await reservar();
    expect(r.status).toBe(502);
    expect((await r.json()).motivo).toBe("PIX_INDISPONIVEL");
    expect((await statusAg()).status).toBe("CANCELADO");
    expect((await reservar()).status).toBe(502); // mesmo horário segue livre para tentar de novo
  });

  it("Mercado Pago fora do ar com Pix estático: cai no código manual", async () => {
    vi.stubEnv("PIX_CHAVE", "barbearia@espiral.com");
    vi.stubEnv("PIX_NOME", "Barbearia");
    vi.stubEnv("PIX_CIDADE", "Sao Paulo");
    mp.mockResolvedValue(new Response("erro", { status: 500 }));
    const r = await reservar();
    expect(r.status).toBe(201);
    const c = await r.json();
    expect(c.pix.automatico).toBeUndefined();
    expect(c.pix.copiaECola).toContain("br.gov.bcb.pix");
    expect((await statusAg()).status).toBe("AGUARDANDO_PAGAMENTO");
  });
});

describe("webhook do Mercado Pago", () => {
  it("assinatura inválida: 403 e nada acontece", async () => {
    await reservar();
    expect((await webhook(aviso("5001", { assinar: false }))).status).toBe(403);
    const falsa = aviso("5001");
    falsa.headers.set("x-signature", "ts=1,v1=00");
    expect((await webhook(falsa)).status).toBe(403);
    expect((await statusAg()).pago).toBe(false);
  });

  it("sem Mercado Pago configurado: 503", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    expect((await webhook(aviso("5001"))).status).toBe(503);
  });

  it("sem segredo configurado: aceita sem assinatura (sempre confere na API)", async () => {
    await reservar();
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    expect((await webhook(aviso("5001", { assinar: false }))).status).toBe(200);
    expect((await statusAg()).pago).toBe(true);
  });

  it("pagamento aprovado confirma a reserva e liga o status para o cliente", async () => {
    const token = (await (await reservar()).json()).pix.consulta;
    const antes = await statusPagamento(new Request("http://x"), { params: Promise.resolve({ token }) });
    expect(await antes.json()).toEqual({ pago: false, expirou: false });

    expect((await webhook(aviso("5001"))).status).toBe(200);
    expect(await statusAg()).toEqual({ status: "CONFIRMADO", pago: true });

    const depois = await statusPagamento(new Request("http://x"), { params: Promise.resolve({ token }) });
    expect(depois.headers.get("cache-control")).toBe("no-store");
    expect(await depois.json()).toEqual({ pago: true, expirou: false });
    expect((await webhook(aviso("5001"))).status).toBe(200); // repetido: inofensivo
  });

  it("eventos que não são de pagamento são ignorados com 200", async () => {
    await reservar();
    expect((await webhook(aviso("5001", { tipo: "plan" }))).status).toBe(200);
    expect(mp.mock.calls.filter(([, i]) => i?.method !== "POST")).toHaveLength(0);
    expect((await statusAg()).pago).toBe(false);
  });

  it("falha ao consultar o Mercado Pago: 500 para ele tentar de novo", async () => {
    await reservar();
    mp.mockResolvedValue(new Response("x", { status: 500 }));
    expect((await webhook(aviso("5001"))).status).toBe(500);
  });
});

describe("GET /api/pagamentos/:token", () => {
  it("400/404 para código torto ou desconhecido", async () => {
    const chamar = (token: string) => statusPagamento(new Request("http://x"), { params: Promise.resolve({ token }) });
    expect((await chamar("1")).status).toBe(404);
    expect((await chamar("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("devoluções (só o dono)", () => {
  async function logar(papel: "DONO" | "BARBEIRO") {
    await criarUsuario(db, { nome: papel, email: `${papel}@x.com`, senha: "senha-forte-2", papel, barbeiroId: papel === "BARBEIRO" ? 1 : undefined });
    const r = await entrar(db, `${papel}@x.com`, "senha-forte-2");
    if (!r.ok) throw new Error("login");
    ctx.jar.set("sessao", r.token);
  }
  const lista = () => listarDevolucoes();
  const marcar = (id: string) => devolvido(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ mpId: id }) });

  it("401 sem login e 403 para barbeiro", async () => {
    expect((await lista()).status).toBe(401);
    expect((await marcar("5001")).status).toBe(401);
    await logar("BARBEIRO");
    expect((await lista()).status).toBe(403);
    expect((await marcar("5001")).status).toBe(403);
  });

  it("dono vê o pagamento atrasado e marca como devolvido", async () => {
    await reservar();
    await db.exec("UPDATE agendamentos SET expira_em = now() - interval '2 minutes' WHERE id = 1");
    await db.exec("UPDATE agendamentos SET status = 'CANCELADO', expira_em = NULL WHERE id = 1"); // cancelado à mão
    await webhook(aviso("5001"));
    await logar("DONO");
    const { devolucoes: itens } = await (await lista()).json();
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ mpId: "5001", valor: 40, cliente: "Ana" });
    expect((await marcar("5001")).status).toBe(204);
    expect((await marcar("5001")).status).toBe(404);
    expect((await marcar("abc")).status).toBe(400);
    expect((await (await lista()).json()).devolucoes).toEqual([]);
  });
});
