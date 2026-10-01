import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario } from "@/lib/auth";
import { definirTelefone } from "@/lib/telefone";
import { processarWebhook } from "@/lib/webhook-whatsapp";
import { POST as agendar } from "./agendamentos/route";
import { GET as verificar, POST as receber } from "./whatsapp/webhook/route";

const ctx = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  ctx.db = db;
  for (const m of ["001_inicial", "002_login_e_preco", "003_pagamento", "004_reserva_com_prazo", "007_administracao", "008_whatsapp"]) {
    await db.exec(readFileSync(`db/migrations/${m}.sql`, "utf8"));
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});

const HOJE = "2026-10-05";
const cfg = { token: "T", phoneId: "1", templateNovo: null, idiomaTemplate: "pt_BR" };

beforeEach(async () => {
  await db.exec(`
    TRUNCATE usuarios, sessoes, agendamentos, horarios_funcionamento, clientes, servicos, barbeiros, whatsapp_recebidas RESTART IDENTITY CASCADE;
    INSERT INTO barbeiros (nome) VALUES ('João');
    INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Corte', 30, 40);
    INSERT INTO clientes (nome, telefone) VALUES ('Ana Souza', '5511900000001');
    INSERT INTO agendamentos (barbeiro_id, servico_id, cliente_id, data, hora_inicio, hora_fim, preco_cobrado)
      VALUES (1, 1, 1, '2026-10-05', '09:00', '09:30', 40);
  `);
  const dono = await criarUsuario(db, { nome: "Dono", email: "dono@x.com", senha: "senha-forte-1", papel: "DONO" });
  if (!dono.ok) throw new Error("setup");
  await definirTelefone(db, { id: dono.id }, "11 99999-0001");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const entrada = (id: string, de: string, extra: Record<string, unknown>) => ({
  entry: [{ changes: [{ value: { messages: [{ id, from: de, ...extra }] } }] }],
});
const texto = (id: string, de: string, body: string) => entrada(id, de, { type: "text", text: { body } });
const okFetch = () => vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));

describe("processarWebhook", () => {
  it("usuário cadastrado recebe a lista de dias", async () => {
    const f = okFetch();
    const r = await processarWebhook(db, texto("w1", "5511999990001", "oi"), cfg, f, HOJE);
    expect(r).toEqual({ recebidas: 1, respondidas: 1, ignoradas: 0 });
    expect(f).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse(f.mock.calls[0][1].body as string);
    expect(corpo.to).toBe("5511999990001");
    expect(corpo.type).toBe("interactive");
  });

  it("'hoje' devolve a agenda e a lista de novo", async () => {
    const f = okFetch();
    await processarWebhook(db, texto("w1", "5511999990001", "hoje"), cfg, f, HOJE);
    const corpos = f.mock.calls.map(([, i]) => JSON.parse(i.body as string));
    expect(corpos[0].text.body).toContain("Ana Souza");
    expect(corpos[0].text.body).toContain("Pago: *n*");
    expect(corpos[1].type).toBe("interactive");
  });

  it("escolha na lista é entendida", async () => {
    const f = okFetch();
    await processarWebhook(db, entrada("w1", "5511999990001", { type: "interactive", interactive: { list_reply: { id: "dia:2026-10-05" } } }), cfg, f, HOJE);
    expect(JSON.parse(f.mock.calls[0][1].body as string).text.body).toContain("09:00");
  });

  it("celular que a Meta entrega sem o 9 também é reconhecido", async () => {
    const f = okFetch();
    const r = await processarWebhook(db, texto("w1", "551199990001", "oi"), cfg, f, HOJE);
    expect(r.respondidas).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body as string).to).toBe("551199990001"); // responde no número que a Meta usou
  });

  it("número desconhecido é ignorado em silêncio", async () => {
    const f = okFetch();
    const r = await processarWebhook(db, texto("w1", "5511977770000", "hoje"), cfg, f, HOJE);
    expect(r).toEqual({ recebidas: 1, respondidas: 0, ignoradas: 1 });
    expect(f).not.toHaveBeenCalled();
  });

  it("usuário desativado perde o acesso", async () => {
    await db.exec("UPDATE usuarios SET ativo = false");
    const f = okFetch();
    expect((await processarWebhook(db, texto("w1", "5511999990001", "hoje"), cfg, f, HOJE)).respondidas).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("a mesma mensagem reenviada pela Meta é respondida uma vez só", async () => {
    const f = okFetch();
    await processarWebhook(db, texto("w1", "5511999990001", "oi"), cfg, f, HOJE);
    const r = await processarWebhook(db, texto("w1", "5511999990001", "oi"), cfg, f, HOJE);
    expect(r).toEqual({ recebidas: 1, respondidas: 0, ignoradas: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("se o envio falha, libera a mensagem para a Meta tentar de novo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ruim = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    const r1 = await processarWebhook(db, texto("w1", "5511999990001", "oi"), cfg, ruim, HOJE);
    expect(r1.respondidas).toBe(0);
    const f = okFetch();
    const r2 = await processarWebhook(db, texto("w1", "5511999990001", "oi"), cfg, f, HOJE);
    expect(r2.respondidas).toBe(1);
  });

  it("figurinha, áudio etc. de usuário cadastrado também recebe o menu", async () => {
    const f = okFetch();
    expect((await processarWebhook(db, entrada("w1", "5511999990001", { type: "sticker" }), cfg, f, HOJE)).respondidas).toBe(1);
  });

  it("limpa registros com mais de 7 dias", async () => {
    await db.exec("INSERT INTO whatsapp_recebidas (wamid, recebido_em) VALUES ('velha', now() - interval '8 days')");
    await processarWebhook(db, { entry: [] }, cfg, okFetch(), HOJE);
    expect((await db.query("SELECT 1 FROM whatsapp_recebidas WHERE wamid = 'velha'")).rows).toHaveLength(0);
  });
});

describe("GET /api/whatsapp/webhook (verificação da Meta)", () => {
  const url = (q: string) => new Request(`http://x/api/whatsapp/webhook?${q}`);
  it("devolve o desafio quando o token confere", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    const r = await verificar(url("hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=12345"));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("12345");
  });
  it("403 com token errado ou sem token configurado", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    expect((await verificar(url("hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1"))).status).toBe(403);
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    expect((await verificar(url("hub.mode=subscribe&hub.verify_token=&hub.challenge=1"))).status).toBe(403);
  });
});

describe("POST /api/whatsapp/webhook", () => {
  const assinar = (corpo: string, segredo: string) => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
  const chamar = (corpo: string, assinatura?: string) =>
    receber(new Request("http://x/api/whatsapp/webhook", { method: "POST", body: corpo, headers: assinatura ? { "x-hub-signature-256": assinatura } : {} }));
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_TOKEN", "T");
    vi.stubEnv("WHATSAPP_PHONE_ID", "1");
    vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
  });

  it("503 se o WhatsApp não está configurado", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await chamar("{}", assinar("{}", ""))).status).toBe(503);
  });

  it("403 sem assinatura ou com assinatura errada, e nada é processado", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    const corpo = JSON.stringify(texto("w1", "5511999990001", "hoje"));
    expect((await chamar(corpo)).status).toBe(403);
    expect((await chamar(corpo, assinar(corpo, "outro-segredo"))).status).toBe(403);
    expect((await chamar(`${corpo} `, assinar(corpo, "app-secret"))).status).toBe(403); // corpo mexido
    await new Promise((r) => setTimeout(r, 50));
    expect(f).not.toHaveBeenCalled();
    expect((await db.query("SELECT 1 FROM whatsapp_recebidas")).rows).toHaveLength(0);
  });

  it("400 para JSON quebrado (mesmo assinado)", async () => {
    expect((await chamar("{nao-json", assinar("{nao-json", "app-secret"))).status).toBe(400);
  });

  it("assinatura certa: 200 e a resposta vai para o usuário", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    const corpo = JSON.stringify(texto("w1", "5511999990001", "oi"));
    expect((await chamar(corpo, assinar(corpo, "app-secret"))).status).toBe(200);
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
  });
});

describe("aviso automático ao agendar pelo site", () => {
  const novo = () =>
    agendar(
      new Request("http://x/api/agendamentos", {
        method: "POST",
        body: JSON.stringify({ barbeiroId: 1, servicoId: 1, clienteId: 1, data: "2099-01-05", horaInicio: "10:00" }),
      }),
    );
  beforeEach(async () => {
    await db.exec("INSERT INTO horarios_funcionamento (barbeiro_id, data, hora_inicio, hora_fim) VALUES (1, '2099-01-05', '09:00', '18:00')");
  });

  it("dono recebe o aviso, e o cliente recebe 201", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "T");
    vi.stubEnv("WHATSAPP_PHONE_ID", "1");
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    const r = await novo();
    expect(r.status).toBe(201);
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const corpo = JSON.parse(f.mock.calls[0][1].body as string);
    expect(corpo.to).toBe("5511999990001");
    expect(corpo.text.body).toContain("Novo agendamento");
  });

  it("se o WhatsApp está fora do ar, o agendamento continua 201 e salvo", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "T");
    vi.stubEnv("WHATSAPP_PHONE_ID", "1");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn().mockRejectedValue(new Error("Meta fora do ar"));
    vi.stubGlobal("fetch", f);
    const r = await novo();
    expect(r.status).toBe(201);
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
    expect((await db.query("SELECT 1 FROM agendamentos WHERE data = '2099-01-05'")).rows).toHaveLength(1);
  });

  it("sem WhatsApp configurado, nada é enviado", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    expect((await novo()).status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    expect(f).not.toHaveBeenCalled();
  });
});
