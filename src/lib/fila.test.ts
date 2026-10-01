import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agendar, cancelar } from "./agendamentos";
import { atualizarFila, entrarNaFila, filaDoDia } from "./fila";

const DIA = "2099-10-05"; // longe no futuro: o "agora" não interfere
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "006_fila_espera"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

// Expediente curto (09:00–10:00) e serviço de 60 min: um único horário por dia e barbeiro.
beforeEach(async () => {
  await db.exec(`
    TRUNCATE fila_espera, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 60, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001'), ('Bia', '5511900000002'), ('Caio', '5511900000003');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '10:00'), (2, '${DIA}', '09:00', '10:00');
  `);
});

const lotar = (barbeiroId = 1, clienteId = 3) =>
  agendar(db, { barbeiroId, servicoId: 1, clienteId, data: DIA, horaInicio: "09:00" });
const entrar = (clienteId: number, barbeiroId = 1) => entrarNaFila(db, { clienteId, barbeiroId, servicoId: 1, data: DIA });

describe("entrarNaFila", () => {
  it("recusa se ainda há horário livre", async () => {
    expect(await entrar(1)).toEqual({ ok: false, motivo: "HA_HORARIO_LIVRE" });
  });

  it("entra na fila quando o dia está cheio e informa a posição", async () => {
    await lotar();
    const a = await entrar(1);
    const b = await entrar(2);
    expect(a).toMatchObject({ ok: true, posicao: 1 });
    expect(b).toMatchObject({ ok: true, posicao: 2 });
  });

  it("não entra duas vezes na mesma fila, mas pode entrar na de outro barbeiro", async () => {
    await lotar(1);
    await lotar(2, 2);
    expect((await entrar(1, 1)).ok).toBe(true);
    expect(await entrar(1, 1)).toEqual({ ok: false, motivo: "JA_NA_FILA" });
    expect((await entrar(1, 2)).ok).toBe(true);
  });

  it("recusa barbeiro ou cliente inexistente", async () => {
    await lotar();
    expect(await entrar(999)).toEqual({ ok: false, motivo: "REFERENCIA_INVALIDA" });
  });

  it("quem saiu da fila pode entrar de novo", async () => {
    await lotar();
    const a = await entrar(1);
    if (!a.ok) throw new Error();
    await atualizarFila(db, null, a.id, "REMOVIDO");
    expect((await entrar(1)).ok).toBe(true);
  });
});

describe("filaDoDia", () => {
  it("lista em ordem de chegada, com posição por barbeiro", async () => {
    await lotar(1);
    await lotar(2, 2);
    await entrar(1, 1);
    await entrar(2, 1);
    await entrar(3, 2);
    const fila = await filaDoDia(db, null, DIA);
    expect(fila.map((i) => [i.barbeiro, i.cliente, i.posicao])).toEqual([
      ["João", "Ana", 1],
      ["João", "Bia", 2],
      ["Pedro", "Caio", 1],
    ]);
  });

  it("barbeiro só vê a própria fila", async () => {
    await lotar(1);
    await lotar(2, 2);
    await entrar(1, 1);
    await entrar(3, 2);
    expect((await filaDoDia(db, 2, DIA)).map((i) => i.cliente)).toEqual(["Caio"]);
  });

  it("marca vagaLivre quando o horário abre (cancelamento)", async () => {
    const r = await lotar();
    if (!r.ok) throw new Error();
    await entrar(1);
    expect((await filaDoDia(db, null, DIA))[0].vagaLivre).toBe(false);
    await cancelar(db, r.id);
    expect((await filaDoDia(db, null, DIA))[0].vagaLivre).toBe(true);
  });

  it("vaga aberta por reserva Pix vencida também aparece", async () => {
    const r = await agendar(db, { barbeiroId: 1, servicoId: 1, clienteId: 3, data: DIA, horaInicio: "09:00", formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    await entrar(1);
    await db.query("UPDATE agendamentos SET expira_em = now() - interval '1 minute' WHERE id = $1", [r.id]);
    expect((await filaDoDia(db, null, DIA))[0].vagaLivre).toBe(true);
  });

  it("não mostra removidos", async () => {
    await lotar();
    const a = await entrar(1);
    if (!a.ok) throw new Error();
    await atualizarFila(db, null, a.id, "REMOVIDO");
    expect(await filaDoDia(db, null, DIA)).toEqual([]);
  });
});

describe("atualizarFila", () => {
  it("marca como avisado (continua na lista) e registra a hora", async () => {
    await lotar();
    const a = await entrar(1);
    if (!a.ok) throw new Error();
    expect(await atualizarFila(db, null, a.id, "AVISADO")).toBe(true);
    expect((await filaDoDia(db, null, DIA))[0].status).toBe("AVISADO");
    const { rows } = await db.query<{ avisado_em: string | null }>("SELECT avisado_em FROM fila_espera WHERE id = $1", [a.id]);
    expect(rows[0].avisado_em).not.toBeNull();
  });

  it("barbeiro não mexe na fila de outro; dono mexe", async () => {
    await lotar(2, 2);
    const a = await entrar(1, 2);
    if (!a.ok) throw new Error();
    expect(await atualizarFila(db, 1, a.id, "REMOVIDO")).toBe(false);
    expect(await atualizarFila(db, null, a.id, "REMOVIDO")).toBe(true);
  });

  it("id inexistente ou já removido devolve false", async () => {
    expect(await atualizarFila(db, null, 999, "AVISADO")).toBe(false);
  });
});
