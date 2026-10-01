import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarUsuario, entrar, sair, usuarioDaSessao } from "./auth";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
  `);
});

const dono = { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" as const };
const joao = { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO" as const, barbeiroId: 1 };

describe("criarUsuario", () => {
  it("guarda hash bcrypt, nunca a senha", async () => {
    await criarUsuario(db, dono);
    const r = await db.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios");
    expect(r.rows[0].senha_hash).not.toContain(dono.senha);
    expect(r.rows[0].senha_hash).toMatch(/^\$2[aby]\$/);
  });

  it("guarda o e-mail em minúsculas", async () => {
    await criarUsuario(db, { ...dono, email: "  DONO@X.com " });
    const r = await db.query<{ email: string }>("SELECT email FROM usuarios");
    expect(r.rows[0].email).toBe("dono@x.com");
  });

  it("recusa e-mail repetido", async () => {
    await criarUsuario(db, dono);
    expect(await criarUsuario(db, { ...dono, email: "DONO@x.com" })).toEqual({ ok: false, motivo: "EMAIL_JA_EXISTE" });
  });

  it("recusa senha curta, e-mail inválido e barbeiro sem barbeiroId", async () => {
    expect(await criarUsuario(db, { ...dono, senha: "curta" })).toEqual({ ok: false, motivo: "DADOS_INVALIDOS" });
    expect(await criarUsuario(db, { ...dono, email: "sem-arroba" })).toEqual({ ok: false, motivo: "DADOS_INVALIDOS" });
    expect(await criarUsuario(db, { ...joao, barbeiroId: undefined })).toEqual({ ok: false, motivo: "DADOS_INVALIDOS" });
  });

  it("recusa barbeiro inexistente e barbeiro que já tem login", async () => {
    expect(await criarUsuario(db, { ...joao, barbeiroId: 99 })).toEqual({ ok: false, motivo: "BARBEIRO_INVALIDO" });
    await criarUsuario(db, joao);
    expect(await criarUsuario(db, { ...joao, email: "outro@x.com" })).toEqual({ ok: false, motivo: "BARBEIRO_INVALIDO" });
  });
});

describe("entrar", () => {
  beforeEach(async () => {
    await criarUsuario(db, dono);
    await criarUsuario(db, joao);
  });

  it("entra com e-mail e senha corretos (e-mail sem diferenciar maiúsculas)", async () => {
    const r = await entrar(db, " Joao@X.com ", joao.senha);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usuario).toMatchObject({ nome: "João", papel: "BARBEIRO", barbeiroId: 1 });
      expect(r.expiraEm.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("recusa senha errada, e-mail desconhecido e usuário desativado", async () => {
    expect(await entrar(db, "joao@x.com", "errada-errada")).toEqual({ ok: false });
    expect(await entrar(db, "ninguem@x.com", "qualquer-coisa")).toEqual({ ok: false });
    await db.exec("UPDATE usuarios SET ativo = false WHERE email = 'joao@x.com'");
    expect(await entrar(db, "joao@x.com", joao.senha)).toEqual({ ok: false });
  });

  it("guarda no banco só o hash do token", async () => {
    const r = await entrar(db, "dono@x.com", dono.senha);
    if (!r.ok) throw new Error("login deveria funcionar");
    const s = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessoes");
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].token_hash).not.toBe(r.token);
    expect(s.rows[0].token_hash).toHaveLength(64);
  });

  it("gera um token diferente a cada login", async () => {
    const a = await entrar(db, "dono@x.com", dono.senha);
    const b = await entrar(db, "dono@x.com", dono.senha);
    if (!a.ok || !b.ok) throw new Error("login deveria funcionar");
    expect(a.token).not.toBe(b.token);
  });
});

describe("usuarioDaSessao e sair", () => {
  async function logar() {
    await criarUsuario(db, joao);
    const r = await entrar(db, "joao@x.com", joao.senha);
    if (!r.ok) throw new Error("login deveria funcionar");
    return r.token;
  }

  it("devolve o usuário do token válido", async () => {
    const token = await logar();
    expect(await usuarioDaSessao(db, token)).toMatchObject({ nome: "João", papel: "BARBEIRO", barbeiroId: 1 });
  });

  it("devolve null para token ausente, falso ou vencido", async () => {
    const token = await logar();
    expect(await usuarioDaSessao(db, undefined)).toBeNull();
    expect(await usuarioDaSessao(db, "token-falso")).toBeNull();
    await db.exec("UPDATE sessoes SET expira_em = now() - interval '1 minute'");
    expect(await usuarioDaSessao(db, token)).toBeNull();
  });

  it("derruba a sessão quando o usuário é desativado", async () => {
    const token = await logar();
    await db.exec("UPDATE usuarios SET ativo = false");
    expect(await usuarioDaSessao(db, token)).toBeNull();
  });

  it("sair apaga a sessão", async () => {
    const token = await logar();
    await sair(db, token);
    expect(await usuarioDaSessao(db, token)).toBeNull();
  });
});