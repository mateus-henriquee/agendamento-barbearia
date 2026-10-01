import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as barbeiros } from "./barbeiros/route";
import { POST as clientes } from "./clientes/route";
import { GET as servicos } from "./servicos/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO barbeiros (nome, status) VALUES ('Carlos', 'AUSENTE');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Pintura', 60, 120.50), ('Corte', 30, 40);
  `);
});

const postCliente = (corpo: unknown) =>
  clientes(new Request("http://x/api/clientes", { method: "POST", body: JSON.stringify(corpo) }));

describe("GET /api/servicos", () => {
  it("lista serviços com preço numérico, em ordem alfabética", async () => {
    const { servicos: lista } = await (await servicos()).json();
    expect(lista).toEqual([
      { id: 2, nome: "Corte", duracaoMin: 30, preco: 40 },
      { id: 1, nome: "Pintura", duracaoMin: 60, preco: 120.5 },
    ]);
  });
});

describe("GET /api/barbeiros", () => {
  it("lista só os ativos", async () => {
    const { barbeiros: lista } = await (await barbeiros()).json();
    expect(lista).toEqual([
      { id: 1, nome: "João" },
      { id: 2, nome: "Pedro" },
    ]);
  });
});

describe("POST /api/clientes", () => {
  it("cria o cliente com o telefone normalizado", async () => {
    const r = await postCliente({ nome: "Ana", telefone: "(11) 99999-0001" });
    expect(r.status).toBe(200);
    const { id } = await r.json();
    const { rows } = await db.query<{ telefone: string }>("SELECT telefone FROM clientes WHERE id = $1", [id]);
    expect(rows[0].telefone).toBe("5511999990001");
  });

  it("mesmo telefone devolve o mesmo cliente e não troca o nome", async () => {
    const a = await (await postCliente({ nome: "Ana", telefone: "(11) 99999-0001" })).json();
    const b = await (await postCliente({ nome: "Outra Pessoa", telefone: "+55 11 99999 0001" })).json();
    expect(b.id).toBe(a.id);
    const { rows } = await db.query<{ nome: string }>("SELECT nome FROM clientes");
    expect(rows).toEqual([{ nome: "Ana" }]);
  });

  it("400 para dados inválidos", async () => {
    expect((await postCliente({ nome: "Ana", telefone: "123" })).status).toBe(400);
    expect((await postCliente({ nome: "", telefone: "(11) 99999-0001" })).status).toBe(400);
  });
});