import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarUsuario } from "./auth";
import { definirTelefone, normalizarTelefone } from "./telefone";

describe("normalizarTelefone", () => {
  it("tira máscara e acrescenta o DDI do Brasil", () => {
    expect(normalizarTelefone("(11) 99999-1234")).toBe("5511999991234");
    expect(normalizarTelefone("+55 11 99999-1234")).toBe("5511999991234");
    expect(normalizarTelefone("5511999991234")).toBe("5511999991234");
  });

  it("celular que a Meta entrega sem o 9 ganha o 9", () => {
    expect(normalizarTelefone("551199991234")).toBe("5511999991234");
    expect(normalizarTelefone("1199991234")).toBe("5511999991234");
  });

  it("fixo (começa com 2 a 5) não ganha o 9", () => {
    expect(normalizarTelefone("551133334444")).toBe("551133334444");
  });

  it("recusa o que não parece telefone", () => {
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("abc")).toBeNull();
    expect(normalizarTelefone("1".repeat(20))).toBeNull();
  });
});

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao", "008_whatsapp"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("TRUNCATE usuarios, sessoes, barbeiros RESTART IDENTITY CASCADE");
  await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
  await criarUsuario(db, { nome: "Outro", email: "outro@x.com", senha: "senha-forte-2", papel: "DONO" });
});

describe("definirTelefone", () => {
  it("salva normalizado, por e-mail ou por id", async () => {
    expect(await definirTelefone(db, { email: "DONO@x.com" }, "(11) 99999-1234")).toBe("OK");
    expect((await db.query<{ telefone: string }>("SELECT telefone FROM usuarios WHERE id = 1")).rows[0].telefone).toBe("5511999991234");
    expect(await definirTelefone(db, { id: 2 }, "21 98888-7777")).toBe("OK");
  });

  it("limpa com null", async () => {
    await definirTelefone(db, { id: 1 }, "11999991234");
    expect(await definirTelefone(db, { id: 1 }, null)).toBe("OK");
    expect((await db.query<{ telefone: string | null }>("SELECT telefone FROM usuarios WHERE id = 1")).rows[0].telefone).toBeNull();
  });

  it("recusa número inválido, usuário inexistente e número repetido", async () => {
    expect(await definirTelefone(db, { id: 1 }, "123")).toBe("TELEFONE_INVALIDO");
    expect(await definirTelefone(db, { email: "nao@x.com" }, "11999991234")).toBe("USUARIO_NAO_ENCONTRADO");
    await definirTelefone(db, { id: 1 }, "11999991234");
    expect(await definirTelefone(db, { id: 2 }, "(11) 99999-1234")).toBe("TELEFONE_EM_USO");
  });
});
