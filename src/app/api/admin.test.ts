import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, entrar } from "@/lib/auth";
import { POST as agendar } from "./agendamentos/route";
import { GET as painelAdmin } from "./painel/admin/route";
import { PATCH as alterarBarbeiro } from "./painel/admin/barbeiros/[id]/route";
import { POST as criarBarbeiro } from "./painel/admin/barbeiros/route";
import { PATCH as alterarServico } from "./painel/admin/servicos/[id]/route";
import { POST as criarServico } from "./painel/admin/servicos/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown, jar: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (ctx.jar.has(nome) ? { name: nome, value: ctx.jar.get(nome) } : undefined),
    set: (nome: string, valor: string) => ctx.jar.set(nome, valor),
    delete: (nome: string) => ctx.jar.delete(nome),
  }),
}));

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao", "008_whatsapp"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  ctx.jar.clear();
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40), ('Barba', 30, 30);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
  `);
  await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
  await criarUsuario(db, { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO", barbeiroId: 1 });
});

async function logar(email: string, senha: string) {
  const r = await entrar(db, email, senha);
  if (!r.ok) throw new Error("login deveria funcionar");
  ctx.jar.set("sessao", r.token);
}
const req = (url: string, metodo: string, corpo?: unknown) =>
  new Request(`http://x${url}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
const ctxId = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("só o dono administra", () => {
  it("401 sem login e 403 para barbeiro, em todas as rotas", async () => {
    const chamadas = () => [
      painelAdmin(),
      criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [] })),
      alterarBarbeiro(req("/b/1", "PATCH", { nome: "X" }), ctxId(1)),
      criarServico(req("/s", "POST", { nome: "X", duracaoMin: 30, preco: 10 })),
      alterarServico(req("/s/1", "PATCH", { preco: 1 }), ctxId(1)),
    ];
    expect((await Promise.all(chamadas())).map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    await logar("joao@x.com", "senha-forte-2");
    expect((await Promise.all(chamadas())).map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM barbeiros")).rows[0].n)).toBe(1);
  });
});

describe("administração (dono)", () => {
  beforeEach(() => logar("dono@x.com", "senha-forte-1"));

  it("lista barbeiros e serviços", async () => {
    const corpo = await (await painelAdmin()).json();
    expect(corpo.barbeiros).toEqual([{ id: 1, nome: "João", status: "ATIVO", servicoIds: [1, 2], temLogin: true }]);
    expect(corpo.servicos.map((s: { nome: string }) => s.nome)).toEqual(["Barba", "Corte"]);
  });

  it("guarda o WhatsApp do barbeiro (normalizado) ao criar o login", async () => {
    const r = await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [1], login: { email: "lucas@x.com", senha: "senha-forte-3", telefone: "(11) 98888-7777" } }));
    expect(r.status).toBe(201);
    expect((await r.json()).whatsapp).toBe("OK");
    expect((await db.query<{ telefone: string }>("SELECT telefone FROM usuarios WHERE email = 'lucas@x.com'")).rows[0].telefone).toBe("5511988887777");
  });

  it("WhatsApp inválido: 400 e nada é criado", async () => {
    const r = await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [1], login: { email: "lucas@x.com", senha: "senha-forte-3", telefone: "123" } }));
    expect(r.status).toBe(400);
    expect(Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM barbeiros")).rows[0].n)).toBe(1);
  });

  it("cria barbeiro com serviços, expediente e login", async () => {
    const r = await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [2], login: { email: "lucas@x.com", senha: "senha-forte-3" } }));
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ id: 2, login: "CRIADO" });
    const { barbeiros } = await (await painelAdmin()).json();
    expect(barbeiros.find((b: { id: number }) => b.id === 2)).toMatchObject({ servicoIds: [2], temLogin: true });
    const dias = Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM horarios_funcionamento WHERE barbeiro_id = 2")).rows[0].n);
    expect(dias).toBeGreaterThan(40); // expediente dos próximos 60 dias (segunda a sábado)
  });

  it("e-mail repetido: cria o barbeiro e avisa que o login não foi criado", async () => {
    const r = await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [], login: { email: "joao@x.com", senha: "senha-forte-3" } }));
    expect(await r.json()).toMatchObject({ login: "EMAIL_JA_EXISTE" });
  });

  it("400 com dados inválidos e 422 com serviço inexistente", async () => {
    expect((await criarBarbeiro(req("/b", "POST", { nome: "L", servicoIds: [] }))).status).toBe(400);
    expect((await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [1], login: { email: "a@b.com", senha: "curta" } }))).status).toBe(400);
    expect((await criarBarbeiro(req("/b", "POST", { nome: "Lucas", servicoIds: [99] }))).status).toBe(422);
  });

  it("muda serviços do barbeiro, e o agendamento respeita", async () => {
    expect((await alterarBarbeiro(req("/b/1", "PATCH", { servicoIds: [2] }), ctxId(1))).status).toBe(204);
    await db.query("INSERT INTO horarios_funcionamento VALUES (1, '2099-10-05', '09:00', '18:00')");
    const tenta = (servicoId: number) =>
      agendar(req("/a", "POST", { barbeiroId: 1, servicoId, clienteId: 1, data: "2099-10-05", horaInicio: "10:00" }));
    const r = await tenta(1);
    expect(r.status).toBe(422);
    expect((await r.json()).motivo).toBe("SERVICO_NAO_OFERECIDO");
    expect((await tenta(2)).status).toBe(201);
  });

  it("reativar barbeiro gera o expediente; id inexistente dá 404", async () => {
    await alterarBarbeiro(req("/b/1", "PATCH", { status: "AUSENTE" }), ctxId(1));
    await alterarBarbeiro(req("/b/1", "PATCH", { status: "ATIVO" }), ctxId(1));
    expect(Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM horarios_funcionamento")).rows[0].n)).toBeGreaterThan(40);
    expect((await alterarBarbeiro(req("/b/99", "PATCH", { nome: "Xyz" }), ctxId(99))).status).toBe(404);
  });

  it("cria e altera serviço; recusa valores absurdos", async () => {
    const r = await criarServico(req("/s", "POST", { nome: "Degradê", duracaoMin: 40, preco: 45 }));
    expect(r.status).toBe(201);
    const { id } = await r.json();
    expect((await alterarServico(req(`/s/${id}`, "PATCH", { preco: 50, ativo: false }), ctxId(id))).status).toBe(204);
    const { servicos } = await (await painelAdmin()).json();
    expect(servicos.find((s: { id: number }) => s.id === id)).toMatchObject({ preco: 50, ativo: false });
    expect((await criarServico(req("/s", "POST", { nome: "X", duracaoMin: 2, preco: 10 }))).status).toBe(400);
    expect((await criarServico(req("/s", "POST", { nome: "Xx", duracaoMin: 30, preco: -5 }))).status).toBe(400);
    expect((await alterarServico(req("/s/99", "PATCH", { preco: 1 }), ctxId(99))).status).toBe(404);
  });
});
