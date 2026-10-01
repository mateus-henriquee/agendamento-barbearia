import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agoraNaBarbearia } from "@/lib/agora";
import { criarUsuario, entrar } from "@/lib/auth";
import { GET as agenda } from "./painel/agenda/route";
import { PATCH as marcar } from "./painel/agendamentos/[id]/route";
import { GET as resumo } from "./painel/resumo/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown, jar: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (ctx.jar.has(nome) ? { name: nome, value: ctx.jar.get(nome) } : undefined),
    set: (nome: string, valor: string) => ctx.jar.set(nome, valor),
    delete: (nome: string) => ctx.jar.delete(nome),
  }),
}));

const HOJE = agoraNaBarbearia().data;
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
  ctx.jar.clear();
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, status, preco_cobrado) VALUES
      (1, 1, 1, '2026-10-05', '09:00', '09:30', 'CONCLUIDO', 40),
      (2, 1, 1, '2026-10-05', '09:00', '09:30', 'CONCLUIDO', 40),
      (2, 1, 1, '2026-10-06', '09:00', '09:30', 'CONCLUIDO', 40),
      (1, 1, 1, '${HOJE}', '16:00', '16:30', 'CONFIRMADO', 40),
      (2, 1, 1, '${HOJE}', '16:00', '16:30', 'CONFIRMADO', 40);
  `);
  await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
  await criarUsuario(db, { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO", barbeiroId: 1 });
});

async function logarComo(email: string, senha: string) {
  const r = await entrar(db, email, senha);
  if (!r.ok) throw new Error("login deveria funcionar");
  ctx.jar.set("sessao", r.token);
}

const get = (rota: (req: Request) => Promise<Response>, qs = "") => rota(new Request(`http://x/api/painel?${qs}`));
const patch = (id: number, corpo: unknown) =>
  marcar(new Request(`http://x/api/painel/agendamentos/${id}`, { method: "PATCH", body: JSON.stringify(corpo) }), {
    params: Promise.resolve({ id: String(id) }),
  });
const statusDe = async (id: number) =>
  (await db.query<{ status: string }>("SELECT status FROM agendamentos WHERE id = $1", [id])).rows[0].status;

describe("sem login", () => {
  it("401 em todas as rotas do painel", async () => {
    expect((await get(agenda)).status).toBe(401);
    expect((await get(resumo)).status).toBe(401);
    expect((await patch(4, { status: "CONCLUIDO" })).status).toBe(401);
  });
});

describe("GET /api/painel/agenda", () => {
  it("dono vê a agenda de todos", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    const r = await get(agenda, "data=2026-10-05");
    const { agenda: itens } = await r.json();
    expect(itens).toHaveLength(2);
  });

  it("dono pode filtrar por barbeiro", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    const { agenda: itens } = await (await get(agenda, "data=2026-10-05&barbeiroId=2")).json();
    expect(itens.map((i: { barbeiro: string }) => i.barbeiro)).toEqual(["Pedro"]);
  });

  it("barbeiro só vê a própria agenda, mesmo pedindo outro barbeiro", async () => {
    await logarComo("joao@x.com", "senha-forte-2");
    const { agenda: itens } = await (await get(agenda, "data=2026-10-05&barbeiroId=2")).json();
    expect(itens.map((i: { barbeiro: string }) => i.barbeiro)).toEqual(["João"]);
  });

  it("sem data usa hoje", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    const corpo = await (await get(agenda)).json();
    expect(corpo.data).toBe(HOJE);
    expect(corpo.agenda).toHaveLength(2);
  });

  it("400 com data inválida", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    expect((await get(agenda, "data=2026-02-31")).status).toBe(400);
  });
});

describe("GET /api/painel/resumo", () => {
  it("dono vê o total, barbeiro só o dele", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    expect((await (await get(resumo, "mes=2026-10")).json()).faturamento).toBe(120);
    expect((await (await get(resumo, "mes=2026-10&barbeiroId=2")).json()).faturamento).toBe(80);

    await logarComo("joao@x.com", "senha-forte-2");
    expect((await (await get(resumo, "mes=2026-10&barbeiroId=2")).json()).faturamento).toBe(40);
  });

  it("400 com mês inválido", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    expect((await get(resumo, "mes=2026-13")).status).toBe(400);
  });
});

describe("PATCH /api/painel/agendamentos/:id", () => {
  it("barbeiro conclui o próprio atendimento de hoje", async () => {
    await logarComo("joao@x.com", "senha-forte-2");
    expect((await patch(4, { status: "CONCLUIDO" })).status).toBe(204);
    expect(await statusDe(4)).toBe("CONCLUIDO");
  });

  it("barbeiro não mexe no atendimento de outro (404), dono mexe", async () => {
    await logarComo("joao@x.com", "senha-forte-2");
    expect((await patch(5, { status: "FALTOU" })).status).toBe(404);
    expect(await statusDe(5)).toBe("CONFIRMADO");

    await logarComo("dono@x.com", "senha-forte-1");
    expect((await patch(5, { status: "FALTOU" })).status).toBe(204);
    expect(await statusDe(5)).toBe("FALTOU");
  });

  it("400 com status que não pode ser escolhido aqui", async () => {
    await logarComo("dono@x.com", "senha-forte-1");
    expect((await patch(4, { status: "CANCELADO" })).status).toBe(400);
    expect((await patch(4, {})).status).toBe(400);
  });
});
