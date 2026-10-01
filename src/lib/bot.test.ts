import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Usuario } from "./auth";
import { interpretarData, listaDeDias, responder, textoDaAgenda } from "./bot";

const HOJE = "2026-10-05"; // segunda-feira

describe("interpretarData", () => {
  it("palavras do dia a dia", () => {
    expect(interpretarData("hoje", HOJE)).toBe("2026-10-05");
    expect(interpretarData("Amanhã", HOJE)).toBe("2026-10-06");
    expect(interpretarData("amanha!", HOJE)).toBe("2026-10-06");
    expect(interpretarData("depois de amanhã", HOJE)).toBe("2026-10-07");
    expect(interpretarData("ontem", HOJE)).toBe("2026-10-04");
  });

  it("dia da semana vai para o próximo; se hoje é ele, é hoje", () => {
    expect(interpretarData("segunda", HOJE)).toBe("2026-10-05");
    expect(interpretarData("sexta", HOJE)).toBe("2026-10-09");
    expect(interpretarData("Sábado", HOJE)).toBe("2026-10-10");
    expect(interpretarData("domingo", HOJE)).toBe("2026-10-11");
    expect(interpretarData("terça-feira", HOJE)).toBe("2026-10-06");
  });

  it("datas com dia/mês, com ou sem ano", () => {
    expect(interpretarData("12/10", HOJE)).toBe("2026-10-12");
    expect(interpretarData("1/11", HOJE)).toBe("2026-11-01");
    expect(interpretarData("12-10-2026", HOJE)).toBe("2026-10-12");
    expect(interpretarData("12/10/27", HOJE)).toBe("2027-10-12");
  });

  it("recusa data que não existe e texto solto", () => {
    expect(interpretarData("31/02", HOJE)).toBeNull();
    expect(interpretarData("32/01", HOJE)).toBeNull();
    expect(interpretarData("oi", HOJE)).toBeNull();
    expect(interpretarData("", HOJE)).toBeNull();
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

const dono: Usuario = { id: 1, nome: "Mateus Henrique", email: "d@x.com", papel: "DONO", barbeiroId: null };
const joao: Usuario = { id: 2, nome: "João Silva", email: "j@x.com", papel: "BARBEIRO", barbeiroId: 1 };

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40), ('Barba', 30, 30);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana Souza', '5511900000001'), ('Bia Lima', '5511900000002');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento, status, pago_em, expira_em) VALUES
      (1, 1, 1, '2026-10-05', '09:00', '09:30', 40, 'NA_BARBEARIA', 'CONFIRMADO', NULL, NULL),
      (1, 2, 2, '2026-10-05', '10:00', '10:30', 30, 'PIX', 'CONFIRMADO', now(), NULL),
      (1, 1, 2, '2026-10-05', '11:00', '11:30', 40, 'NA_BARBEARIA', 'CANCELADO', NULL, NULL),
      (2, 1, 1, '2026-10-05', '09:00', '09:30', 40, 'PIX', 'AGUARDANDO_PAGAMENTO', NULL, now() + interval '10 minutes'),
      (2, 2, 2, '2026-10-05', '14:00', '14:30', 30, 'NA_BARBEARIA', 'FALTOU', NULL, NULL),
      (1, 1, 1, '2026-10-07', '15:00', '15:30', 40, 'NA_BARBEARIA', 'CONFIRMADO', NULL, NULL);
  `);
});

describe("textoDaAgenda", () => {
  it("barbeiro vê só os dele, com pago s/n, sem cancelados", async () => {
    const t = await textoDaAgenda(db, joao, "2026-10-05", HOJE);
    expect(t).toContain("Segunda-feira, 05/10/2026");
    expect(t).toContain("(hoje)");
    expect(t).toContain("*09:00* Ana Souza");
    expect(t).toContain("Corte · R$ 40,00 · Pago: *n*");
    expect(t).toContain("*10:00* Bia Lima");
    expect(t).toContain("Barba · R$ 30,00 · Pago: *s*");
    expect(t).not.toContain("11:00"); // cancelado
    expect(t).not.toContain("14:00"); // do Pedro
    expect(t).not.toContain("Pedro");
    expect(t).toContain("Total: 2 · pagos: 1 · a receber: R$ 40,00");
  });

  it("dono vê todos, com o nome do barbeiro, Pix aguardando e falta", async () => {
    const t = await textoDaAgenda(db, dono, "2026-10-05", HOJE);
    expect(t).toContain("Corte · R$ 40,00 · João · Pago: *n*");
    expect(t).toContain("Corte · R$ 40,00 · Pedro · Pago: *n* (aguardando Pix)");
    expect(t).toContain("Barba · R$ 30,00 · Pedro · faltou");
    expect(t).toContain("Total: 4 · pagos: 1 · a receber: R$ 80,00"); // falta não entra em "a receber"
  });

  it("ordena por horário", async () => {
    const t = await textoDaAgenda(db, dono, "2026-10-05", HOJE);
    expect(t.indexOf("09:00")).toBeLessThan(t.indexOf("10:00"));
    expect(t.indexOf("10:00")).toBeLessThan(t.indexOf("14:00"));
  });

  it("dia sem nada", async () => {
    expect(await textoDaAgenda(db, dono, "2026-10-06", HOJE)).toContain("Nenhum agendamento neste dia.");
  });

  it("reserva de Pix vencida deixa de aparecer", async () => {
    await db.exec("UPDATE agendamentos SET expira_em = now() - interval '1 minute' WHERE status = 'AGUARDANDO_PAGAMENTO'");
    const t = await textoDaAgenda(db, dono, "2026-10-05", HOJE);
    expect(t).not.toContain("aguardando Pix");
    expect(t).toContain("Total: 3");
  });

  it("dia muito cheio é cortado antes do limite do WhatsApp", async () => {
    await db.exec(`
      INSERT INTO clientes (nome, telefone) SELECT 'Cliente com nome bem comprido numero ' || g, '55119' || (10000000 + g)::text FROM generate_series(1, 120) g;
      INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado)
        SELECT 2, 1, 2 + g, '2026-10-12', ('08:00'::time + (g * interval '5 minutes'))::time, ('08:00'::time + (g * interval '5 minutes') + interval '5 minutes')::time, 40 FROM generate_series(1, 120) g;
    `);
    const t = await textoDaAgenda(db, dono, "2026-10-12", HOJE);
    expect(t.length).toBeLessThanOrEqual(4000);
    expect(t).toContain("… e mais");
  });
});

describe("listaDeDias", () => {
  it("10 dias a partir de hoje, com contagem do escopo", async () => {
    const m = await listaDeDias(db, joao, HOJE, "Oi");
    if (m.tipo !== "lista") throw new Error("deveria ser lista");
    expect(m.linhas).toHaveLength(10);
    expect(m.linhas[0]).toEqual({ id: "dia:2026-10-05", titulo: "Hoje · seg 05/10", descricao: "2 agendamentos" });
    expect(m.linhas[1]).toMatchObject({ titulo: "Amanhã · ter 06/10", descricao: "Sem agendamentos" });
    expect(m.linhas[2]).toMatchObject({ id: "dia:2026-10-07", descricao: "1 agendamento" });
    expect(m.linhas[9].id).toBe("dia:2026-10-14");
  });

  it("dono conta os agendamentos de todos (cancelado fora, falta dentro)", async () => {
    const m = await listaDeDias(db, dono, HOJE, "Oi");
    if (m.tipo !== "lista") throw new Error("deveria ser lista");
    expect(m.linhas[0].descricao).toBe("4 agendamentos");
  });
});

describe("responder", () => {
  it("mensagem qualquer → saudação com a lista de dias", async () => {
    const r = await responder(db, joao, { texto: "oi" }, HOJE);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "lista" });
    expect((r[0] as { corpo: string }).corpo).toContain("Olá, João!");
  });

  it("toque numa linha → agenda daquele dia + lista para escolher outro", async () => {
    const r = await responder(db, joao, { escolha: "dia:2026-10-07" }, HOJE);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ tipo: "texto" });
    expect((r[0] as { texto: string }).texto).toContain("15:00");
    expect(r[1]).toMatchObject({ tipo: "lista" });
  });

  it("texto 'sexta' funciona como escolha", async () => {
    const r = await responder(db, dono, { texto: "sexta" }, HOJE);
    expect((r[0] as { texto: string }).texto).toContain("Sexta-feira, 09/10/2026");
  });

  it("id de linha malformado é tratado como mensagem comum", async () => {
    const r = await responder(db, joao, { escolha: "dia:2026-13-45" }, HOJE);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "lista" });
  });
});
