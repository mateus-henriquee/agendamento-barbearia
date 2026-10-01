import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, entrar } from "@/lib/auth";
import { POST as agendar } from "./agendamentos/route";
import { POST as entrarNaFila } from "./fila/route";
import { GET as filaDoPainel } from "./painel/fila/route";
import { PATCH as atualizarFila } from "./painel/fila/[id]/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown, jar: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (ctx.jar.has(nome) ? { name: nome, value: ctx.jar.get(nome) } : undefined),
    set: (nome: string, valor: string) => ctx.jar.set(nome, valor),
    delete: (nome: string) => ctx.jar.delete(nome),
  }),
}));

const DIA = "2099-10-05";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "006_fila_espera"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  ctx.jar.clear();
  await db.exec(`
    TRUNCATE usuarios, sessoes, fila_espera, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 60, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Dono do horário', '5511900000009');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '10:00'), (2, '${DIA}', '09:00', '10:00');
  `);
  await criarUsuario(db, { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO", barbeiroId: 1 });
});

const lotar = (barbeiroId = 1) =>
  agendar(
    new Request("http://x/api/agendamentos", {
      method: "POST",
      body: JSON.stringify({ barbeiroId, servicoId: 1, clienteId: 1, data: DIA, horaInicio: "09:00" }),
    }),
  );
const pedir = (extra: Record<string, unknown> = {}) =>
  entrarNaFila(
    new Request("http://x/api/fila", {
      method: "POST",
      body: JSON.stringify({ barbeiroId: 1, servicoId: 1, data: DIA, nome: "Ana Souza", telefone: "(11) 98888-7777", ...extra }),
    }),
  );
async function logar() {
  const r = await entrar(db, "joao@x.com", "senha-forte-2");
  if (!r.ok) throw new Error("login deveria funcionar");
  ctx.jar.set("sessao", r.token);
}

describe("POST /api/fila", () => {
  it("201 com a posição quando o dia está cheio", async () => {
    await lotar();
    const r = await pedir();
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ posicao: 1 });
  });

  it("409 se ainda há horário livre", async () => {
    const r = await pedir();
    expect(r.status).toBe(409);
    expect((await r.json()).motivo).toBe("HA_HORARIO_LIVRE");
  });

  it("409 se já está na fila (mesmo telefone digitado de outro jeito)", async () => {
    await lotar();
    await pedir();
    const r = await pedir({ telefone: "11988887777" });
    expect(r.status).toBe(409);
    expect((await r.json()).motivo).toBe("JA_NA_FILA");
  });

  it("400 com telefone inválido ou nome vazio", async () => {
    await lotar();
    expect((await pedir({ telefone: "123" })).status).toBe(400);
    expect((await pedir({ nome: " " })).status).toBe(400);
  });

  it("422 para data passada", async () => {
    expect((await pedir({ data: "2000-01-01" })).status).toBe(422);
  });

  it("404 para barbeiro inexistente", async () => {
    await lotar(); // só para o barbeiro 1 ficar cheio; o 99 não tem expediente
    expect((await pedir({ barbeiroId: 99 })).status).toBe(404);
  });
});

describe("painel da fila", () => {
  const ver = () => filaDoPainel(new Request(`http://x/api/painel/fila?data=${DIA}`));
  const mudar = (id: number, status: string) =>
    atualizarFila(new Request(`http://x/api/painel/fila/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), {
      params: Promise.resolve({ id: String(id) }),
    });

  it("401 sem login", async () => {
    expect((await ver()).status).toBe(401);
    expect((await mudar(1, "AVISADO")).status).toBe(401);
  });

  it("barbeiro vê só a própria fila", async () => {
    await lotar(1);
    await lotar(2);
    await pedir({ barbeiroId: 1 });
    await pedir({ barbeiroId: 2, nome: "Bia", telefone: "11977776666" });
    await logar();
    const { fila } = await (await ver()).json();
    expect(fila.map((i: { cliente: string }) => i.cliente)).toEqual(["Ana Souza"]);
  });

  it("avisa (204), remove (204) e recusa fila de outro barbeiro (404)", async () => {
    await lotar(1);
    await lotar(2);
    await pedir({ barbeiroId: 1 });
    await pedir({ barbeiroId: 2, nome: "Bia", telefone: "11977776666" });
    await logar();
    expect((await mudar(1, "AVISADO")).status).toBe(204);
    expect((await mudar(1, "REMOVIDO")).status).toBe(204);
    expect((await mudar(2, "REMOVIDO")).status).toBe(404); // fila do Pedro
    expect((await mudar(1, "OUTRA")).status).toBe(400);
  });
});
