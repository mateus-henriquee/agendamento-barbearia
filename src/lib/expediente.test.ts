import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EXPEDIENTE_PADRAO, gerarExpediente } from "./expediente";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync("db/migrations/001_inicial.sql", "utf8"));
}, 30_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`
    TRUNCATE horarios_funcionamento, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO barbeiros (nome, status) VALUES ('Carlos', 'AUSENTE');
  `);
});

// 2026-10-05 é segunda-feira.
const SEGUNDA = "2026-10-05";
const linhas = async () =>
  (await db.query<{ barbeiro_id: number; data: string; hora_inicio: string; hora_fim: string }>(
    "SELECT barbeiro_id, data::text, hora_inicio::text, hora_fim::text FROM horarios_funcionamento ORDER BY barbeiro_id, data",
  )).rows;

describe("gerarExpediente", () => {
  it("cria de segunda a sábado para os barbeiros ativos (ignora ausente e domingo)", async () => {
    const n = await gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 7 }, SEGUNDA); // seg..dom
    expect(n).toBe(12); // 2 barbeiros x 6 dias
    const l = await linhas();
    expect(new Set(l.map((x) => x.barbeiro_id))).toEqual(new Set([1, 2]));
    expect(l.some((x) => x.data === "2026-10-11")).toBe(false); // domingo
    expect(l[0]).toMatchObject({ data: SEGUNDA, hora_inicio: "09:00:00", hora_fim: "18:00:00" });
  });

  it("rodar de novo não duplica nem altera o que já existe", async () => {
    await gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 7 }, SEGUNDA);
    await db.query("UPDATE horarios_funcionamento SET hora_fim = '12:00' WHERE barbeiro_id = 1 AND data = $1", [SEGUNDA]);
    expect(await gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 7 }, SEGUNDA)).toBe(0);
    expect((await linhas()).find((x) => x.barbeiro_id === 1 && x.data === SEGUNDA)?.hora_fim).toBe("12:00:00");
  });

  it("estender o período cria só os dias novos", async () => {
    await gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 7 }, SEGUNDA);
    expect(await gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 14 }, SEGUNDA)).toBe(12); // segunda semana
  });

  it("respeita horário e dias da semana escolhidos", async () => {
    await gerarExpediente(db, { dias: 7, inicio: "08:00", fim: "12:00", diasDaSemana: [6] }, SEGUNDA);
    const l = await linhas();
    expect(l).toHaveLength(2); // só o sábado, dois barbeiros
    expect(l[0]).toMatchObject({ data: "2026-10-10", hora_inicio: "08:00:00", hora_fim: "12:00:00" });
  });

  it("recusa parâmetros inválidos", async () => {
    await expect(gerarExpediente(db, { ...EXPEDIENTE_PADRAO, dias: 0 }, SEGUNDA)).rejects.toThrow(RangeError);
    await expect(gerarExpediente(db, { ...EXPEDIENTE_PADRAO, inicio: "18:00", fim: "09:00" }, SEGUNDA)).rejects.toThrow(RangeError);
    await expect(gerarExpediente(db, { ...EXPEDIENTE_PADRAO, inicio: "9h" }, SEGUNDA)).rejects.toThrow(RangeError);
    await expect(gerarExpediente(db, { ...EXPEDIENTE_PADRAO, diasDaSemana: [7] }, SEGUNDA)).rejects.toThrow(RangeError);
  });
});
