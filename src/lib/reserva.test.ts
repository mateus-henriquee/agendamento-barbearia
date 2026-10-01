import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agendar, cancelar, horariosDisponiveis, liberarExpirados, PRAZO_PIX_MIN } from "./agendamentos";
import { agendaDoDia, confirmarPagamento } from "./painel";

const DIA = "2026-10-05";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
      RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40), ('Cortesia', 30, 0);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana', '5511900000001'), ('Bia', '5511900000002');
    INSERT INTO horarios_funcionamento VALUES (1, '${DIA}', '09:00', '18:00'), (2, '${DIA}', '09:00', '18:00');
  `);
});

const marcar = (horaInicio: string, extra: Partial<Parameters<typeof agendar>[1]> = {}) =>
  agendar(db, { barbeiroId: 1, servicoId: 1, clienteId: 1, data: DIA, horaInicio, ...extra });
const linha = async (id: number) =>
  (await db.query<{ status: string; expira_em: string | null; pago_em: string | null }>(
    "SELECT status, expira_em, pago_em FROM agendamentos WHERE id = $1",
    [id],
  )).rows[0];
const vencer = (id: number) =>
  db.query("UPDATE agendamentos SET expira_em = now() - interval '1 minute' WHERE id = $1", [id]);

describe("reserva com prazo", () => {
  it("Pix nasce AGUARDANDO_PAGAMENTO com prazo de ~20 min", async () => {
    const r = await marcar("10:00", { formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    expect(r.expiraEm).not.toBeNull();
    const { rows } = await db.query<{ min: number }>(
      "SELECT extract(epoch FROM (expira_em - now()))::float8 / 60 AS min FROM agendamentos WHERE id = $1",
      [r.id],
    );
    expect(rows[0].min).toBeGreaterThan(PRAZO_PIX_MIN - 1);
    expect(rows[0].min).toBeLessThanOrEqual(PRAZO_PIX_MIN);
    expect((await linha(r.id)).status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("pagar na barbearia nasce CONFIRMADO, sem prazo", async () => {
    const r = await marcar("10:00");
    if (!r.ok) throw new Error();
    expect(r.expiraEm).toBeNull();
    expect(await linha(r.id)).toMatchObject({ status: "CONFIRMADO", expira_em: null });
  });

  it("Pix em serviço gratuito já nasce CONFIRMADO", async () => {
    const r = await marcar("10:00", { servicoId: 2, formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    expect((await linha(r.id)).status).toBe("CONFIRMADO");
  });

  it("o horário reservado bloqueia outros clientes", async () => {
    await marcar("10:00", { formaPagamento: "PIX" });
    const outro = await marcar("10:00", { clienteId: 2 });
    expect(outro).toEqual({ ok: false, motivo: "CONFLITO" });
    expect(await horariosDisponiveis(db, { barbeiroId: 1, servicoId: 1, data: DIA })).not.toContain("10:00");
  });

  it("reserva vencida libera o horário para outro cliente", async () => {
    const a = await marcar("10:00", { formaPagamento: "PIX" });
    if (!a.ok) throw new Error();
    await vencer(a.id);
    expect(await horariosDisponiveis(db, { barbeiroId: 1, servicoId: 1, data: DIA })).toContain("10:00");
    const b = await marcar("10:00", { clienteId: 2 });
    expect(b.ok).toBe(true);
    expect((await linha(a.id)).status).toBe("CANCELADO");
  });

  it("liberarExpirados só cancela as vencidas", async () => {
    const a = await marcar("10:00", { formaPagamento: "PIX" });
    const b = await marcar("11:00", { formaPagamento: "PIX" });
    if (!a.ok || !b.ok) throw new Error();
    await vencer(a.id);
    expect(await liberarExpirados(db)).toBe(1);
    expect((await linha(a.id)).status).toBe("CANCELADO");
    expect((await linha(b.id)).status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("pagamento confirmado vira CONFIRMADO, sem prazo, e nunca mais expira", async () => {
    const r = await marcar("10:00", { formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    expect(await confirmarPagamento(db, 1, r.id)).toBe(true);
    expect(await linha(r.id)).toMatchObject({ status: "CONFIRMADO", expira_em: null });
    expect(await liberarExpirados(db)).toBe(0);
    expect((await linha(r.id)).status).toBe("CONFIRMADO");
  });

  it("não confirma pagamento de reserva vencida", async () => {
    const r = await marcar("10:00", { formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    await vencer(r.id);
    expect(await confirmarPagamento(db, null, r.id)).toBe(false);
    expect((await linha(r.id)).status).toBe("CANCELADO");
  });

  it("cancelar funciona em reserva aguardando pagamento", async () => {
    const r = await marcar("10:00", { formaPagamento: "PIX" });
    if (!r.ok) throw new Error();
    expect(await cancelar(db, r.id)).toBe(true);
  });

  it("a agenda mostra o status e já remove as vencidas", async () => {
    const a = await marcar("09:00", { formaPagamento: "PIX" });
    const b = await marcar("10:00", { formaPagamento: "PIX" });
    if (!a.ok || !b.ok) throw new Error();
    await vencer(b.id);
    const agenda = await agendaDoDia(db, null, DIA);
    expect(agenda.map((i) => [i.inicio, i.status])).toEqual([
      ["09:00", "AGUARDANDO_PAGAMENTO"],
      ["10:00", "CANCELADO"],
    ]);
  });

  it("o banco exige prazo em toda reserva aguardando pagamento", async () => {
    await expect(
      db.query(
        `INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, status)
         VALUES (1, 1, 1, '${DIA}', '10:00', '10:30', 40, 'AGUARDANDO_PAGAMENTO')`,
      ),
    ).rejects.toThrow();
  });
});
