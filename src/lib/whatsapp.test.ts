import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assinaturaValida, configWhatsApp, enviar, extrairMensagens, montarPayload } from "./whatsapp";

const cfg = { token: "TOK", phoneId: "123", templateNovo: null, idiomaTemplate: "pt_BR" };

describe("configWhatsApp", () => {
  it("fica desligado sem token ou phone id", () => {
    expect(configWhatsApp({})).toBeNull();
    expect(configWhatsApp({ WHATSAPP_TOKEN: "x" })).toBeNull();
  });
  it("lê as variáveis e usa pt_BR por padrão", () => {
    const c = configWhatsApp({ WHATSAPP_TOKEN: " x ", WHATSAPP_PHONE_ID: "9", WHATSAPP_TEMPLATE_NOVO: "novo_agendamento" });
    expect(c).toEqual({ token: "x", phoneId: "9", templateNovo: "novo_agendamento", idiomaTemplate: "pt_BR" });
  });
});

describe("montarPayload", () => {
  it("texto", () => {
    const p = montarPayload("5511999991234", { tipo: "texto", texto: "oi" });
    expect(p).toMatchObject({ messaging_product: "whatsapp", to: "5511999991234", type: "text", text: { body: "oi" } });
  });

  it("lista respeita os limites da API (10 linhas, título 24, descrição 72, botão 20)", () => {
    const linhas = Array.from({ length: 12 }, (_, i) => ({ id: `dia:${i}`, titulo: "T".repeat(40), descricao: "D".repeat(100) }));
    const p = montarPayload("1", { tipo: "lista", corpo: "c", botao: "B".repeat(40), secao: "S".repeat(40), linhas }) as {
      interactive: { action: { button: string; sections: { title: string; rows: { title: string; description: string }[] }[] } };
    };
    const a = p.interactive.action;
    expect(a.button.length).toBeLessThanOrEqual(20);
    expect(a.sections[0].title.length).toBeLessThanOrEqual(24);
    expect(a.sections[0].rows).toHaveLength(10);
    expect(a.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
    expect(a.sections[0].rows[0].description.length).toBeLessThanOrEqual(72);
  });

  it("modelo: parâmetros sem quebra de linha", () => {
    const p = montarPayload("1", { tipo: "template", nome: "novo", idioma: "pt_BR", parametros: ["Ana\nSouza", ""] }) as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    expect(p.template.components[0].parameters.map((x) => x.text)).toEqual(["Ana Souza", "-"]);
  });
});

describe("enviar", () => {
  it("chama a API da Meta com o token", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await enviar(cfg, "5511999991234", { tipo: "texto", texto: "oi" }, f)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(init.headers.Authorization).toBe("Bearer TOK");
  });

  it("devolve o erro em vez de lançar", async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 400 }));
    expect(await enviar(cfg, "1", { tipo: "texto", texto: "oi" }, f)).toMatchObject({ ok: false, status: 400 });
    const g = vi.fn().mockRejectedValue(new Error("rede"));
    expect(await enviar(cfg, "1", { tipo: "texto", texto: "oi" }, g)).toMatchObject({ ok: false, status: 0, erro: "rede" });
  });
});

describe("assinaturaValida", () => {
  const corpo = '{"a":1}';
  const assinar = (c: string, seg: string) => `sha256=${createHmac("sha256", seg).update(c).digest("hex")}`;
  it("aceita a assinatura certa", () => {
    expect(assinaturaValida(corpo, assinar(corpo, "seg"), "seg")).toBe(true);
  });
  it("recusa segredo errado, corpo alterado, cabeçalho ausente ou torto", () => {
    expect(assinaturaValida(corpo, assinar(corpo, "outro"), "seg")).toBe(false);
    expect(assinaturaValida('{"a":2}', assinar(corpo, "seg"), "seg")).toBe(false);
    expect(assinaturaValida(corpo, null, "seg")).toBe(false);
    expect(assinaturaValida(corpo, "sha256=zz", "seg")).toBe(false);
    expect(assinaturaValida(corpo, "abc", "seg")).toBe(false);
  });
});

describe("extrairMensagens", () => {
  const envelope = (messages: unknown[]) => ({ entry: [{ changes: [{ value: { messages } }] }] });
  it("lê texto e escolha de lista", () => {
    const r = extrairMensagens(
      envelope([
        { id: "w1", from: "5511999991234", type: "text", text: { body: "hoje" } },
        { id: "w2", from: "5511999991234", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "dia:2026-10-05" } } },
      ]),
    );
    expect(r).toEqual([
      { id: "w1", de: "5511999991234", texto: "hoje" },
      { id: "w2", de: "5511999991234", escolha: "dia:2026-10-05" },
    ]);
  });
  it("ignora status de entrega, lixo e formatos estranhos", () => {
    expect(extrairMensagens({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(extrairMensagens(null)).toEqual([]);
    expect(extrairMensagens({ entry: "x" })).toEqual([]);
    expect(extrairMensagens(envelope([{ id: 1, from: 2 }]))).toEqual([]);
  });
});
