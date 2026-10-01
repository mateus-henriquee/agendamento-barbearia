import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigracoes, listarMigracoes } from "./migracoes";

let db: PGlite;
beforeEach(() => {
  db = new PGlite({ extensions: { btree_gist } });
});
afterEach(async () => {
  await db.close();
});

const existe = async (tabela: string) =>
  (await db.query<{ ok: boolean }>("SELECT to_regclass($1) IS NOT NULL AS ok", [tabela])).rows[0].ok;

describe("migrações", () => {
  it("lista os arquivos do projeto em ordem", () => {
    const nomes = listarMigracoes("db/migrations").map((m) => m.nome);
    expect(nomes[0]).toBe("001_inicial.sql");
    expect([...nomes].sort()).toEqual(nomes);
  });

  it("aplica todas num banco vazio", async () => {
    const r = await aplicarMigracoes(db, "db/migrations");
    expect(r.aplicadas.length).toBe(listarMigracoes("db/migrations").length);
    expect(await existe("agendamentos")).toBe(true);
    expect(await existe("fila_espera")).toBe(true);
  }, 30_000);

  it("rodar de novo não faz nada", async () => {
    await aplicarMigracoes(db, "db/migrations");
    const r = await aplicarMigracoes(db, "db/migrations");
    expect(r.aplicadas).toEqual([]);
    expect(r.jaAplicadas.length).toBeGreaterThan(0);
  }, 30_000);

  it("só aplica as novas quando chega um arquivo novo", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "mig-"));
    writeFileSync(join(pasta, "001_a.sql"), "CREATE TABLE a (id INT);");
    await aplicarMigracoes(db, pasta);
    writeFileSync(join(pasta, "002_b.sql"), "CREATE TABLE b (id INT);");
    const r = await aplicarMigracoes(db, pasta);
    expect(r).toEqual({ aplicadas: ["002_b.sql"], jaAplicadas: ["001_a.sql"] });
  });

  it("migração com erro desfaz tudo dela e para", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "mig-"));
    writeFileSync(join(pasta, "001_ok.sql"), "CREATE TABLE ok (id INT);");
    writeFileSync(join(pasta, "002_quebrada.sql"), "CREATE TABLE metade (id INT); SELECT * FROM nao_existe;");
    writeFileSync(join(pasta, "003_depois.sql"), "CREATE TABLE depois (id INT);");
    await expect(aplicarMigracoes(db, pasta)).rejects.toThrow(/002_quebrada\.sql/);
    expect(await existe("ok")).toBe(true);
    expect(await existe("metade")).toBe(false); // desfeita
    expect(await existe("depois")).toBe(false); // nem chegou
    const { rows } = await db.query<{ nome: string }>("SELECT nome FROM migracoes");
    expect(rows.map((r) => r.nome)).toEqual(["001_ok.sql"]);
  });

  it("marcarSemRodar só anota, sem criar tabelas", async () => {
    const r = await aplicarMigracoes(db, "db/migrations", { marcarSemRodar: true });
    expect(r.aplicadas.length).toBeGreaterThan(0);
    expect(await existe("agendamentos")).toBe(false);
    expect((await aplicarMigracoes(db, "db/migrations")).aplicadas).toEqual([]);
  });
});
