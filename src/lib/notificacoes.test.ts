import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario } from "./auth";
import { notificarNovoAgendamento } from "./notificacoes";
import { definirTelefone } from "./telefone";

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

const cfgTexto = { token: "T", phoneId: "1", templateNovo: null, idiomaTemplate: "pt_BR" };
const cfgModelo = { ...cfgTexto, templateNovo: "novo_agendamento" };
const ok = () => vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
const corposEnviados = (f: ReturnType<typeof ok>) => f.mock.calls.map(([, init]) => JSON.parse(init.body as string));

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana Souza', '5511900000001');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado, forma_pagamento, status, expira_em) VALUES
      (1, 1, 1, '2026-10-05', '09:00', '09:30', 40, 'NA_BARBEARIA', 'CONFIRMADO', NULL),
      (2, 1, 1, '2026-10-05', '10:00', '10:30', 40, 'PIX', 'AGUARDANDO_PAGAMENTO', now() + interval '20 minutes');
  `);
  const dono = await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
  const joao = await criarUsuario(db, { nome: "João", email: "joao@x.com", senha: "senha-forte-2", papel: "BARBEIRO", barbeiroId: 1 });
  const pedro = await criarUsuario(db, { nome: "Pedro", email: "pedro@x.com", senha: "senha-forte-3", papel: "BARBEIRO", barbeiroId: 2 });
  if (!dono.ok || !joao.ok || !pedro.ok) throw new Error("setup");
  await definirTelefone(db, { id: dono.id }, "11 90000-0001");
  await definirTelefone(db, { id: joao.id }, "11 90000-0002");
  await definirTelefone(db, { id: pedro.id }, "11 90000-0003");
});

const numeros = (f: ReturnType<typeof ok>) => corposEnviados(f).map((c) => c.to).sort();

describe("notificarNovoAgendamento", () => {
  it("avisa o barbeiro do horário e o dono, e mais ninguém", async () => {
    const f = ok();
    const r = await notificarNovoAgendamento(db, 1, cfgTexto, f);
    expect(r).toEqual({ destinatarios: 2, enviados: 2, falhas: 0 });
    expect(numeros(f)).toEqual(["5511900000001", "5511900000002"]); // dono e João, não o Pedro
  });

  it("texto livre traz cliente, serviço, barbeiro, quando e pagamento", async () => {
    const f = ok();
    await notificarNovoAgendamento(db, 1, cfgTexto, f);
    const corpo = corposEnviados(f)[0].text.body as string;
    expect(corpo).toContain("Ana Souza");
    expect(corpo).toContain("Corte (R$ 40,00)");
    expect(corpo).toContain("Barbeiro: João");
    expect(corpo).toContain("seg 05/10 às 09:00");
    expect(corpo).toContain("Pagamento: na barbearia");
  });

  it("com modelo configurado, manda o modelo com 5 parâmetros", async () => {
    const f = ok();
    await notificarNovoAgendamento(db, 2, cfgModelo, f);
    const c = corposEnviados(f)[0];
    expect(c.type).toBe("template");
    expect(c.template.name).toBe("novo_agendamento");
    expect(c.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Ana Souza",
      "Corte (R$ 40,00)",
      "Pedro",
      "seg 05/10 às 10:00",
      "Pix (aguardando pagamento)",
    ]);
  });

  it("dono que também é o barbeiro recebe uma vez só", async () => {
    await db.exec("DELETE FROM usuarios WHERE email = 'joao@x.com'");
    await db.exec("UPDATE usuarios SET barbeiro_id = 1 WHERE papel = 'DONO'");
    const f = ok();
    const r = await notificarNovoAgendamento(db, 1, cfgTexto, f);
    expect(r.destinatarios).toBe(1);
    expect(numeros(f)).toEqual(["5511900000001"]);
  });

  it("usuário inativo ou sem telefone não recebe", async () => {
    await db.exec("UPDATE usuarios SET ativo = false WHERE email = 'dono@x.com'");
    await db.exec("UPDATE usuarios SET telefone = NULL WHERE email = 'joao@x.com'");
    const f = ok();
    const r = await notificarNovoAgendamento(db, 1, cfgTexto, f);
    expect(r.destinatarios).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("falha no envio não lança e é contada; o outro destinatário ainda recebe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"fora da janela"}', { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const r = await notificarNovoAgendamento(db, 1, cfgTexto, f);
    expect(r).toEqual({ destinatarios: 2, enviados: 1, falhas: 1 });
  });

  it("rede caída não lança", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn().mockRejectedValue(new Error("sem rede"));
    await expect(notificarNovoAgendamento(db, 1, cfgTexto, f)).resolves.toMatchObject({ enviados: 0, falhas: 2 });
  });

  it("WhatsApp desligado: não faz nada", async () => {
    const f = ok();
    expect(await notificarNovoAgendamento(db, 1, null, f)).toEqual({ destinatarios: 0, enviados: 0, falhas: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it("agendamento inexistente não lança", async () => {
    const f = ok();
    expect((await notificarNovoAgendamento(db, 999, cfgTexto, f)).enviados).toBe(0);
  });
});
