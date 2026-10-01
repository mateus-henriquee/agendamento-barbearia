import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { atualizarBarbeiro, atualizarServico, criarBarbeiro, criarServico, definirServicosDoBarbeiro, listarBarbeirosAdmin, listarServicosAdmin } from "./admin";
import { agendar, horariosDisponiveis } from "./agendamentos";
import { listarBarbeiros, listarServicos } from "./catalogo";
import { entrarNaFila } from "./fila";

const DIA = "2099-10-05";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "006_fila_espera", "007_administracao"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`
    TRUNCATE fila_espera, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40), ('Barba', 30, 30);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '18:00'), (2, '${DIA}', '09:00', '18:00');
  `);
});

const marcar = (barbeiroId: number, servicoId: number) =>
  agendar(db, { barbeiroId, servicoId, clienteId: 1, data: DIA, horaInicio: "10:00" });

describe("serviços de cada barbeiro", () => {
  it("quem já existe faz tudo; barbeiro e serviço novos começam ligados a tudo", async () => {
    const id = await criarServico(db, { nome: "Degradê", duracaoMin: 40, preco: 45 });
    const novo = (await db.query<{ id: number }>("INSERT INTO barbeiros (nome) VALUES ('Lucas') RETURNING id")).rows[0].id;
    const lista = await listarBarbeirosAdmin(db);
    expect(lista.find((b) => b.id === 1)?.servicoIds).toEqual([1, 2, id]);
    expect(lista.find((b) => b.id === novo)?.servicoIds).toEqual([1, 2, id]);
  });

  it("definir deixa exatamente os serviços escolhidos", async () => {
    expect(await definirServicosDoBarbeiro(db, 1, [2])).toBe(true);
    expect((await listarBarbeirosAdmin(db))[0].servicoIds).toEqual([2]);
    expect(await definirServicosDoBarbeiro(db, 1, [])).toBe(true);
    expect((await listarBarbeirosAdmin(db))[0].servicoIds).toEqual([]);
  });

  it("recusa serviço ou barbeiro inexistente, sem alterar nada", async () => {
    expect(await definirServicosDoBarbeiro(db, 1, [1, 99])).toBe(false);
    expect(await definirServicosDoBarbeiro(db, 99, [1])).toBe(false);
  });

  it("não agenda serviço que o barbeiro não faz", async () => {
    await definirServicosDoBarbeiro(db, 2, [2]); // Pedro só faz barba
    expect(await marcar(2, 1)).toEqual({ ok: false, motivo: "SERVICO_NAO_OFERECIDO" });
    expect((await marcar(2, 2)).ok).toBe(true);
    expect(await horariosDisponiveis(db, { barbeiroId: 2, servicoId: 1, data: DIA })).toEqual([]);
    expect((await horariosDisponiveis(db, { barbeiroId: 1, servicoId: 1, data: DIA })).length).toBeGreaterThan(0);
  });

  it("não entra na fila de serviço que o barbeiro não faz", async () => {
    await definirServicosDoBarbeiro(db, 2, [2]);
    expect(await entrarNaFila(db, { clienteId: 1, barbeiroId: 2, servicoId: 1, data: DIA })).toEqual({ ok: false, motivo: "REFERENCIA_INVALIDA" });
  });
});

describe("barbeiros", () => {
  it("cria já com os serviços escolhidos", async () => {
    const id = await criarBarbeiro(db, { nome: "Lucas", servicoIds: [1] });
    expect(id).not.toBeNull();
    expect((await listarBarbeirosAdmin(db)).find((b) => b.id === id)).toMatchObject({ nome: "Lucas", status: "ATIVO", servicoIds: [1], temLogin: false });
  });

  it("serviço inexistente: não cria o barbeiro", async () => {
    expect(await criarBarbeiro(db, { nome: "Lucas", servicoIds: [99] })).toBeNull();
    expect(await listarBarbeirosAdmin(db)).toHaveLength(2);
  });

  it("muda nome e status; AUSENTE some do site e dos horários", async () => {
    expect(await atualizarBarbeiro(db, 1, { nome: "João Silva", status: "AUSENTE" })).toBe(true);
    expect((await listarBarbeiros(db)).map((b) => b.nome)).toEqual(["Pedro"]);
    expect(await horariosDisponiveis(db, { barbeiroId: 1, servicoId: 1, data: DIA })).toEqual([]);
    expect(await atualizarBarbeiro(db, 99, { nome: "X" })).toBe(false);
  });

  it("alterar só o status mantém o nome", async () => {
    await atualizarBarbeiro(db, 1, { status: "AUSENTE" });
    expect((await listarBarbeirosAdmin(db)).find((b) => b.id === 1)?.nome).toBe("João");
  });
});

describe("serviços", () => {
  it("cria, muda preço e duração", async () => {
    const id = await criarServico(db, { nome: "Degradê", duracaoMin: 40, preco: 45 });
    expect(await atualizarServico(db, id, { preco: 50, duracaoMin: 45 })).toBe(true);
    expect((await listarServicosAdmin(db)).find((s) => s.id === id)).toMatchObject({ nome: "Degradê", duracaoMin: 45, preco: 50, ativo: true });
  });

  it("desativar tira do site, mas o histórico continua", async () => {
    const r = await marcar(1, 1);
    if (!r.ok) throw new Error();
    await atualizarServico(db, 1, { ativo: false });
    expect((await listarServicos(db)).map((s) => s.nome)).toEqual(["Barba"]);
    expect(await marcar(1, 1)).toEqual({ ok: false, motivo: "SERVICO_NAO_ENCONTRADO" });
    expect((await listarServicosAdmin(db)).find((s) => s.id === 1)?.ativo).toBe(false);
  });

  it("mudar o preço não altera agendamentos antigos", async () => {
    const r = await marcar(1, 1);
    if (!r.ok) throw new Error();
    await atualizarServico(db, 1, { preco: 99 });
    const { rows } = await db.query<{ preco_cobrado: string }>("SELECT preco_cobrado FROM agendamentos WHERE id = $1", [r.id]);
    expect(Number(rows[0].preco_cobrado)).toBe(40);
  });

  it("id inexistente devolve false", async () => {
    expect(await atualizarServico(db, 99, { preco: 1 })).toBe(false);
  });
});
