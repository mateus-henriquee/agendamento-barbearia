import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Usuario } from "./auth";
import { agendaDoDia, escopoDe, marcarAtendimento, resumoDoMes } from "./painel";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/002_login_e_preco.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/003_pagamento.sql", "utf8"));
  await db.exec(readFileSync("db/migrations/004_reserva_com_prazo.sql", "utf8"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

// Dados fixos: João = barbeiro 1, Pedro = barbeiro 2. Serviço 1 = Corte (40), 2 = Corte e barba (65).
beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40), ('Corte e barba', 60, 65);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001'), ('Bia', '5511900000002');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, status, preco_cobrado) VALUES
      (1, 1, 1, '2026-10-05', '09:00', '09:30', 'CONCLUIDO', 40),
      (1, 1, 2, '2026-10-05', '10:00', '10:30', 'CONCLUIDO', 40),
      (1, 2, 1, '2026-10-06', '09:00', '10:00', 'CONFIRMADO', 65),
      (2, 2, 2, '2026-10-05', '09:00', '10:00', 'CONCLUIDO', 65),
      (2, 1, 1, '2026-10-07', '11:00', '11:30', 'FALTOU', 40),
      (2, 1, 2, '2026-10-08', '11:00', '11:30', 'CANCELADO', 40),
      (2, 1, 1, '2026-09-30', '09:00', '09:30', 'CONCLUIDO', 40),
      (2, 1, 2, '2026-10-09', '14:00', '14:30', 'CONCLUIDO', 40),
      (2, 1, 1, '2026-10-05', '15:00', '15:30', 'CONFIRMADO', 40);
  `);
});

const usuario = (papel: "DONO" | "BARBEIRO", barbeiroId: number | null): Usuario => ({
  id: 1,
  nome: "X",
  email: "x@x.com",
  papel,
  barbeiroId,
});

describe("escopoDe", () => {
  it("barbeiro vê só ele mesmo, ignorando o filtro pedido", () => {
    expect(escopoDe(usuario("BARBEIRO", 1))).toBe(1);
    expect(escopoDe(usuario("BARBEIRO", 1), 2)).toBe(1);
  });

  it("dono vê todos, ou o barbeiro que escolher", () => {
    expect(escopoDe(usuario("DONO", null))).toBeNull();
    expect(escopoDe(usuario("DONO", null), 2)).toBe(2);
  });
});

describe("agendaDoDia", () => {
  it("lista o dia em ordem de horário (empate: por nome do barbeiro)", async () => {
    const a = await agendaDoDia(db, null, "2026-10-05");
    expect(a.map((i) => `${i.inicio} ${i.barbeiro}`)).toEqual([
      "09:00 João",
      "09:00 Pedro",
      "10:00 João",
      "15:00 Pedro",
    ]);
    expect(a[0]).toMatchObject({ cliente: "Ana", telefone: "5511900000001", servico: "Corte", fim: "09:30", status: "CONCLUIDO", preco: 40 });
  });

  it("filtra por barbeiro", async () => {
    const a = await agendaDoDia(db, 1, "2026-10-05");
    expect(a.map((i) => i.barbeiro)).toEqual(["João", "João"]);
  });

  it("dia sem agendamentos devolve lista vazia", async () => {
    expect(await agendaDoDia(db, null, "2026-11-20")).toEqual([]);
  });
});

describe("resumoDoMes", () => {
  it("soma o mês de todos os barbeiros", async () => {
    const r = await resumoDoMes(db, null, "2026-10");
    expect(r).toMatchObject({
      mes: "2026-10",
      faturamento: 185, // 40 + 40 + 65 + 40 (só CONCLUIDO)
      previsto: 105, // 65 + 40 (CONFIRMADO)
      concluidos: 4,
      confirmados: 2,
      faltas: 1,
      cancelados: 1,
    });
  });

  it("serviço mais pedido ignora cancelados e faltas", async () => {
    const r = await resumoDoMes(db, null, "2026-10");
    expect(r.servicoMaisPedido).toBe("Corte");
    expect(r.ranking).toEqual([
      { servico: "Corte", quantidade: 4 },
      { servico: "Corte e barba", quantidade: 2 },
    ]);
  });

  it("filtra por barbeiro", async () => {
    const joao = await resumoDoMes(db, 1, "2026-10");
    expect(joao).toMatchObject({ faturamento: 80, previsto: 65, concluidos: 2, confirmados: 1, faltas: 0, cancelados: 0 });
    const pedro = await resumoDoMes(db, 2, "2026-10");
    expect(pedro).toMatchObject({ faturamento: 105, previsto: 40, concluidos: 2, confirmados: 1, faltas: 1, cancelados: 1 });
  });

  it("não mistura meses", async () => {
    const r = await resumoDoMes(db, null, "2026-09");
    expect(r).toMatchObject({ faturamento: 40, concluidos: 1 });
  });

  it("mês sem dados: zeros e nenhum serviço mais pedido", async () => {
    const r = await resumoDoMes(db, null, "2027-01");
    expect(r).toMatchObject({ faturamento: 0, previsto: 0, concluidos: 0, servicoMaisPedido: null, ranking: [], porBarbeiro: [] });
  });

  it("separa por barbeiro, do que mais faturou para o que menos", async () => {
    const r = await resumoDoMes(db, null, "2026-10");
    expect(r.porBarbeiro).toEqual([
      { barbeiro: "Pedro", concluidos: 2, faturamento: 105 },
      { barbeiro: "João", concluidos: 2, faturamento: 80 },
    ]);
  });

  it("usa o preço da hora do agendamento, mesmo se o serviço mudar de preço", async () => {
    await db.exec("UPDATE servicos SET preco = 999");
    const r = await resumoDoMes(db, null, "2026-10");
    expect(r.faturamento).toBe(185);
  });
});

describe("marcarAtendimento", () => {
  const status = async (id: number) =>
    (await db.query<{ status: string }>("SELECT status FROM agendamentos WHERE id = $1", [id])).rows[0].status;

  it("conclui um agendamento confirmado do dia", async () => {
    expect(await marcarAtendimento(db, 1, 3, "CONCLUIDO", "2026-10-06")).toBe(true);
    expect(await status(3)).toBe("CONCLUIDO");
  });

  it("marca falta", async () => {
    expect(await marcarAtendimento(db, 1, 3, "FALTOU", "2026-10-06")).toBe(true);
    expect(await status(3)).toBe("FALTOU");
  });

  it("recusa agendamento de dia futuro", async () => {
    expect(await marcarAtendimento(db, 1, 3, "CONCLUIDO", "2026-10-05")).toBe(false);
    expect(await status(3)).toBe("CONFIRMADO");
  });

  it("barbeiro não mexe no agendamento de outro barbeiro; dono mexe", async () => {
    expect(await marcarAtendimento(db, 1, 9, "CONCLUIDO", "2026-10-05")).toBe(false);
    expect(await status(9)).toBe("CONFIRMADO");
    expect(await marcarAtendimento(db, null, 9, "CONCLUIDO", "2026-10-05")).toBe(true);
  });

  it("recusa o que já foi marcado ou cancelado, e id inexistente", async () => {
    expect(await marcarAtendimento(db, null, 1, "FALTOU", "2026-10-31")).toBe(false); // já CONCLUIDO
    expect(await marcarAtendimento(db, null, 6, "CONCLUIDO", "2026-10-31")).toBe(false); // CANCELADO
    expect(await marcarAtendimento(db, null, 999, "CONCLUIDO", "2026-10-31")).toBe(false);
  });
});
