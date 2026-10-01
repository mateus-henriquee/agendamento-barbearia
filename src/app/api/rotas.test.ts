import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./agendamentos/[id]/route";
import { POST } from "./agendamentos/route";
import { GET } from "./horarios/route";

// Troca o banco real pelo PGlite: as rotas rodam de verdade, só o banco é de teste.
const ctx = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));

// Um dia futuro (daqui a 7 dias), para o teste não quebrar com o passar do tempo.
const FUTURO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/004_reserva_com_prazo.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/007_administracao.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${FUTURO}', '09:00', '18:00');
  `);
});

const get = (qs: string) => GET(new Request(`http://x/api/horarios?${qs}`));
const post = (corpo: unknown) =>
  POST(new Request("http://x/api/agendamentos", { method: "POST", body: JSON.stringify(corpo) }));
const apagar = (id: string) =>
  DELETE(new Request(`http://x/api/agendamentos/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

const pedido = { barbeiroId: 1, servicoId: 1, clienteId: 1, data: FUTURO, horaInicio: "10:00" };

describe("GET /api/horarios", () => {
  it("200 com a lista de horários livres", async () => {
    const r = await get(`barbeiroId=1&servicoId=1&data=${FUTURO}`);
    expect(r.status).toBe(200);
    const { horarios } = await r.json();
    expect(horarios[0]).toBe("09:00");
    expect(horarios).toContain("17:30");
  });

  it("400 quando faltam parâmetros", async () => {
    expect((await get("")).status).toBe(400);
  });

  it("400 para data inexistente", async () => {
    expect((await get("barbeiroId=1&servicoId=1&data=2026-02-31")).status).toBe(400);
  });

  it("lista vazia para dia que já passou", async () => {
    const r = await get("barbeiroId=1&servicoId=1&data=2020-01-01");
    expect(await r.json()).toEqual({ horarios: [] });
  });

  it("horário agendado some da lista", async () => {
    await post(pedido);
    const { horarios } = await (await get(`barbeiroId=1&servicoId=1&data=${FUTURO}`)).json();
    expect(horarios).not.toContain("10:00");
  });
});

describe("POST /api/agendamentos", () => {
  it("201 com o id", async () => {
    const r = await post(pedido);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: 1 });
  });

  it("409 quando o horário já foi reservado", async () => {
    await post(pedido);
    const r = await post(pedido);
    expect(r.status).toBe(409);
    expect((await r.json()).motivo).toBe("CONFLITO");
  });

  it("400 para JSON inválido ou campos errados", async () => {
    const semCorpo = await POST(new Request("http://x/api/agendamentos", { method: "POST", body: "isso não é json" }));
    expect(semCorpo.status).toBe(400);
    expect((await post({ ...pedido, horaInicio: "25:00" })).status).toBe(400);
  });

  it("400 para horário no passado", async () => {
    const r = await post({ ...pedido, data: "2020-01-01" });
    expect(r.status).toBe(400);
  });

  it("422 fora do expediente", async () => {
    const r = await post({ ...pedido, horaInicio: "20:00" });
    expect(r.status).toBe(422);
  });

  it("404 para serviço ou cliente inexistente", async () => {
    expect((await post({ ...pedido, servicoId: 99 })).status).toBe(404);
    expect((await post({ ...pedido, clienteId: 99 })).status).toBe(404);
  });
});

describe("DELETE /api/agendamentos/:id", () => {
  it("204 ao cancelar e o horário volta a ficar livre", async () => {
    const { id } = await (await post(pedido)).json();
    expect((await apagar(String(id))).status).toBe(204);
    expect((await post(pedido)).status).toBe(201);
  });

  it("404 se não existe ou já foi cancelado", async () => {
    expect((await apagar("999")).status).toBe(404);
    const { id } = await (await post(pedido)).json();
    await apagar(String(id));
    expect((await apagar(String(id))).status).toBe(404);
  });

  it("400 para id inválido", async () => {
    expect((await apagar("abc")).status).toBe(400);
    expect((await apagar("-5")).status).toBe(400);
  });
});
