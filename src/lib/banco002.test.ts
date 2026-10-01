import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agendar } from "./agendamentos";

const DIA = "2026-10-05";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte masculino', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '18:00');
  `);
});

const inserirUsuario = (email: string, papel: string, barbeiroId: number | null) =>
  db.query(
    "INSERT INTO usuarios (nome, email, senha_hash, papel, barbeiro_id) VALUES ('X', $1, 'hash', $2, $3)",
    [email, papel, barbeiroId],
  );

describe("preco_cobrado", () => {
  it("grava o preço do serviço no momento do agendamento", async () => {
    await agendar(db, { barbeiroId: 1, servicoId: 1, clienteId: 1, data: DIA, horaInicio: "10:00" });
    const r = await db.query<{ preco_cobrado: string }>("SELECT preco_cobrado FROM agendamentos");
    expect(Number(r.rows[0].preco_cobrado)).toBe(40);
  });

  it("não muda quando o preço do serviço muda depois", async () => {
    await agendar(db, { barbeiroId: 1, servicoId: 1, clienteId: 1, data: DIA, horaInicio: "10:00" });
    await db.exec("UPDATE servicos SET preco = 55 WHERE id = 1");
    const r = await db.query<{ preco_cobrado: string }>("SELECT preco_cobrado FROM agendamentos");
    expect(Number(r.rows[0].preco_cobrado)).toBe(40);
  });
});

describe("usuarios", () => {
  it("aceita dono sem barbeiro e barbeiro com barbeiro", async () => {
    await inserirUsuario("dono@x.com", "DONO", null);
    await inserirUsuario("joao@x.com", "BARBEIRO", 1);
    const r = await db.query("SELECT 1 FROM usuarios");
    expect(r.rows).toHaveLength(2);
  });

  it("recusa BARBEIRO sem barbeiro_id", async () => {
    await expect(inserirUsuario("a@x.com", "BARBEIRO", null)).rejects.toThrow();
  });

  it("recusa papel desconhecido", async () => {
    await expect(inserirUsuario("a@x.com", "ADMIN", null)).rejects.toThrow();
  });

  it("recusa e-mail repetido e e-mail com maiúscula", async () => {
    await inserirUsuario("a@x.com", "DONO", null);
    await expect(inserirUsuario("a@x.com", "DONO", null)).rejects.toThrow();
    await expect(inserirUsuario("B@x.com", "DONO", null)).rejects.toThrow();
  });

  it("recusa dois logins para o mesmo barbeiro", async () => {
    await inserirUsuario("a@x.com", "BARBEIRO", 1);
    await expect(inserirUsuario("b@x.com", "BARBEIRO", 1)).rejects.toThrow();
  });
});

describe("sessoes", () => {
  it("some junto quando o usuário é apagado", async () => {
    await inserirUsuario("a@x.com", "DONO", null);
    await db.exec("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ('h', 1, now() + interval '1 day')");
    await db.exec("DELETE FROM usuarios WHERE id = 1");
    const r = await db.query("SELECT 1 FROM sessoes");
    expect(r.rows).toHaveLength(0);
  });
});
