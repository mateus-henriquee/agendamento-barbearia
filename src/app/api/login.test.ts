import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario } from "@/lib/auth";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown, jar: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
// Cookies falsos: guardam num Map para o teste conferir o que a rota gravou.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (ctx.jar.has(nome) ? { name: nome, value: ctx.jar.get(nome) } : undefined),
    set: (nome: string, valor: string, opcoes: Record<string, unknown>) => {
      ctx.jar.set(nome, valor);
      ctx.jar.set(`${nome}:opcoes`, JSON.stringify(opcoes));
    },
    delete: (nome: string) => ctx.jar.delete(nome),
  }),
}));

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/004_reserva_com_prazo.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/005_limite_login.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  ctx.jar.clear();
  await db.exec("TRUNCATE usuarios, sessoes, tentativas_login, barbeiros RESTART IDENTITY CASCADE");
  await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
});

const entrar = (corpo: unknown, ip?: string) =>
  login(
    new Request("http://x/api/login", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: ip ? { "x-forwarded-for": ip } : {},
    }),
  );
const errar = async (email: string, vezes: number, ip?: string) => {
  for (let i = 0; i < vezes; i++) await entrar({ email, senha: "senha-errada-1" }, ip);
};

describe("POST /api/login", () => {
  it("200 e cookie httpOnly com credenciais corretas", async () => {
    const r = await entrar({ email: "dono@x.com", senha: "senha-forte-1" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ usuario: { nome: "Dono", papel: "DONO" } });
    expect(ctx.jar.get("sessao")).toBeTruthy();
    const opcoes = JSON.parse(ctx.jar.get("sessao:opcoes")!);
    expect(opcoes).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("401 com a mesma mensagem para senha errada e e-mail inexistente", async () => {
    const a = await entrar({ email: "dono@x.com", senha: "errada-errada" });
    const b = await entrar({ email: "ninguem@x.com", senha: "errada-errada" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    expect(ctx.jar.has("sessao")).toBe(false);
  });

  it("400 com corpo inválido", async () => {
    expect((await entrar({})).status).toBe(400);
    expect((await entrar({ email: "dono@x.com" })).status).toBe(400);
  });
});

describe("POST /api/logout", () => {
  it("204, apaga o cookie e a sessão", async () => {
    await entrar({ email: "dono@x.com", senha: "senha-forte-1" });
    const r = await logout();
    expect(r.status).toBe(204);
    expect(ctx.jar.has("sessao")).toBe(false);
    const s = await db.query("SELECT 1 FROM sessoes");
    expect(s.rows).toHaveLength(0);
  });
});

describe("proteção contra tentativas em massa", () => {
  it("5 erros bloqueiam o e-mail: a 6ª tentativa recebe 429, até com a senha certa", async () => {
    await errar("dono@x.com", 5);
    const r = await entrar({ email: "dono@x.com", senha: "senha-forte-1" });
    expect(r.status).toBe(429);
    expect((await r.json()).erro).toMatch(/Muitas tentativas/);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(ctx.jar.get("sessao")).toBeUndefined();
  });

  it("4 erros ainda deixam entrar, e o login certo zera o contador", async () => {
    await errar("dono@x.com", 4);
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" })).status).toBe(200);
    await errar("dono@x.com", 4);
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" })).status).toBe(200);
  });

  it("e-mail inexistente também é bloqueado (não revela quem tem conta)", async () => {
    await errar("ninguem@x.com", 5);
    expect((await entrar({ email: "ninguem@x.com", senha: "qualquer-uma" })).status).toBe(429);
  });

  it("bloqueio de um e-mail não afeta os outros", async () => {
    await criarUsuario(db, { nome: "Outro", email: "outro@x.com", senha: "senha-forte-2", papel: "DONO" });
    await errar("dono@x.com", 5);
    expect((await entrar({ email: "outro@x.com", senha: "senha-forte-2" })).status).toBe(200);
  });

  it("maiúsculas no e-mail não burlam o bloqueio", async () => {
    await errar("DONO@x.com", 3);
    await errar("Dono@X.com", 2);
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" })).status).toBe(429);
  });

  it("20 erros do mesmo IP bloqueiam esse IP, mesmo trocando de e-mail", async () => {
    for (let i = 0; i < 20; i++) await entrar({ email: `x${i}@x.com`, senha: "senha-errada-1" }, "9.9.9.9");
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" }, "9.9.9.9")).status).toBe(429);
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" }, "8.8.8.8")).status).toBe(200);
  });

  it("falhas antigas (fora da janela) não contam", async () => {
    await errar("dono@x.com", 5);
    await db.exec("UPDATE tentativas_login SET criado_em = now() - interval '16 minutes'");
    expect((await entrar({ email: "dono@x.com", senha: "senha-forte-1" })).status).toBe(200);
  });
});
