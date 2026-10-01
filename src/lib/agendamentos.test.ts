import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agendar, cancelar, horariosDisponiveis } from "./agendamentos";

const DIA = "2026-10-05"; // segunda-feira
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
    TRUNCATE agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO barbeiros (nome, status) VALUES ('Carlos', 'AUSENTE');
    INSERT INTO servicos (nome, duracao_min, preco)
      VALUES ('Corte masculino', 30, 40), ('Corte e barba', 60, 70);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001'), ('Bia', '5511900000002');
    INSERT INTO horarios_funcionamento VALUES
      (1, '${DIA}', '09:00', '18:00'),
      (2, '${DIA}', '09:00', '18:00'),
      (3, '${DIA}', '09:00', '18:00');
  `);
});

const marcar = (barbeiroId: number, horaInicio: string, servicoId = 1, clienteId = 1) =>
  agendar(db, { barbeiroId, servicoId, clienteId, data: DIA, horaInicio });

describe("agendar", () => {
  it("agenda em horário livre e calcula a hora de fim", async () => {
    const r = await marcar(1, "10:00", 2); // serviço de 60 min
    expect(r.ok).toBe(true);
    const { rows } = await db.query<{ fim: string }>(
      "SELECT to_char(hora_fim, 'HH24:MI') AS fim FROM agendamentos",
    );
    expect(rows[0].fim).toBe("11:00");
  });

  it("recusa sobreposição parcial", async () => {
    await marcar(1, "10:00", 2); // 10:00–11:00
    expect(await marcar(1, "10:30", 1, 2)).toEqual({ ok: false, motivo: "CONFLITO" });
  });

  it("aceita horários que apenas encostam", async () => {
    await marcar(1, "10:00", 2);
    expect((await marcar(1, "11:00", 1, 2)).ok).toBe(true);
  });

  it("barbeiros diferentes podem ter o mesmo horário", async () => {
    await marcar(1, "10:00");
    expect((await marcar(2, "10:00", 1, 2)).ok).toBe(true);
  });

  it("cancelado libera o horário", async () => {
    const primeiro = await marcar(1, "10:00");
    if (!primeiro.ok) throw new Error("preparação falhou");
    await cancelar(db, primeiro.id);
    expect((await marcar(1, "10:00", 1, 2)).ok).toBe(true);
  });

  it("recusa serviço inexistente", async () => {
    expect(await marcar(1, "10:00", 999)).toEqual({ ok: false, motivo: "SERVICO_NAO_ENCONTRADO" });
  });

  it("recusa cliente inexistente", async () => {
    expect(await marcar(1, "10:00", 1, 999)).toEqual({ ok: false, motivo: "REFERENCIA_INVALIDA" });
  });

  it("recusa antes da abertura", async () => {
    expect(await marcar(1, "08:30")).toEqual({ ok: false, motivo: "FORA_DO_EXPEDIENTE" });
  });

  it("recusa serviço que termina depois do fechamento", async () => {
    expect(await marcar(1, "17:30", 2)).toEqual({ ok: false, motivo: "FORA_DO_EXPEDIENTE" });
  });

  it("aceita serviço que termina exatamente no fechamento", async () => {
    expect((await marcar(1, "17:00", 2)).ok).toBe(true);
  });

  it("recusa dia sem expediente", async () => {
    const r = await agendar(db, { barbeiroId: 1, servicoId: 1, clienteId: 1, data: "2026-10-06", horaInicio: "10:00" });
    expect(r).toEqual({ ok: false, motivo: "FORA_DO_EXPEDIENTE" });
  });

  it("recusa barbeiro ausente", async () => {
    expect(await marcar(3, "10:00")).toEqual({ ok: false, motivo: "FORA_DO_EXPEDIENTE" });
  });

  it("30 pedidos ao mesmo tempo no mesmo horário: só 1 vence", async () => {
    const resultados = await Promise.all(Array.from({ length: 30 }, () => marcar(1, "15:00")));
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok && r.motivo === "CONFLITO")).toHaveLength(29);
  });
});

describe("cancelar", () => {
  it("cancela e retorna true", async () => {
    const r = await marcar(1, "10:00");
    if (!r.ok) throw new Error("preparação falhou");
    expect(await cancelar(db, r.id)).toBe(true);
  });

  it("retorna false se já estava cancelado", async () => {
    const r = await marcar(1, "10:00");
    if (!r.ok) throw new Error("preparação falhou");
    await cancelar(db, r.id);
    expect(await cancelar(db, r.id)).toBe(false);
  });

  it("retorna false se não existe", async () => {
    expect(await cancelar(db, 999)).toBe(false);
  });
});

describe("horariosDisponiveis", () => {
  const buscar = (barbeiroId: number, servicoId: number, apartirDe?: string) =>
    horariosDisponiveis(db, { barbeiroId, servicoId, data: DIA, apartirDe });

  it("lista o expediente inteiro quando não há agendamentos", async () => {
    const r = await buscar(1, 2);
    expect(r[0]).toBe("09:00");
    expect(r[r.length - 1]).toBe("17:00");
  });

  it("remove horários ocupados", async () => {
    await marcar(1, "10:00", 2); // 10:00–11:00
    const r = await buscar(1, 1); // corte de 30 min
    expect(r).not.toContain("10:00");
    expect(r).not.toContain("10:30");
    expect(r).toContain("09:30");
    expect(r).toContain("11:00");
  });

  it("horário cancelado volta a aparecer", async () => {
    const m = await marcar(1, "10:00");
    if (!m.ok) throw new Error("preparação falhou");
    await cancelar(db, m.id);
    expect(await buscar(1, 1)).toContain("10:00");
  });

  it("respeita apartirDe", async () => {
    const r = await buscar(1, 1, "16:00");
    expect(r[0]).toBe("16:00");
  });

  it("vazio para barbeiro ausente, dia sem expediente e serviço inexistente", async () => {
    expect(await buscar(3, 1)).toEqual([]);
    expect(await horariosDisponiveis(db, { barbeiroId: 1, servicoId: 1, data: "2026-10-06" })).toEqual([]);
    expect(await buscar(1, 999)).toEqual([]);
  });

  it("o primeiro horário oferecido consegue ser agendado", async () => {
    await marcar(1, "09:00", 2);
    const [primeiro] = await buscar(1, 1);
    expect(primeiro).toBe("10:00");
    expect((await marcar(1, primeiro, 1, 2)).ok).toBe(true);
  });
});
