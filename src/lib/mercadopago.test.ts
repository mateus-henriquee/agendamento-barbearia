import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assinaturaMPValida, buscarPagamento, configMercadoPago, criarPix, VALIDADE_MP_MIN } from "./mercadopago";

const cfg = { accessToken: "APP_USR-token", segredoWebhook: null, emailPagador: "cliente@barbearia.com", apiUrl: "https://api.mercadopago.com" };

describe("configMercadoPago", () => {
  it("fica desligado sem token", () => {
    expect(configMercadoPago({})).toBeNull();
    expect(configMercadoPago({ MERCADOPAGO_ACCESS_TOKEN: "  " })).toBeNull();
  });
  it("lê as variáveis e tem valores padrão", () => {
    expect(configMercadoPago({ MERCADOPAGO_ACCESS_TOKEN: "T" })).toEqual({
      accessToken: "T",
      segredoWebhook: null,
      emailPagador: "cliente@barbearia.com",
      apiUrl: "https://api.mercadopago.com",
    });
    const c = configMercadoPago({ MERCADOPAGO_ACCESS_TOKEN: "T", MERCADOPAGO_WEBHOOK_SECRET: "S", MERCADOPAGO_EMAIL_PAGADOR: "a@b.com", MERCADOPAGO_API_URL: "http://localhost:9/" });
    expect(c).toMatchObject({ segredoWebhook: "S", emailPagador: "a@b.com", apiUrl: "http://localhost:9" });
  });
});

describe("criarPix", () => {
  const resposta = { id: 987001, point_of_interaction: { transaction_data: { qr_code: "00020126...6304ABCD" } } };
  const dados = { agendamentoId: 12, valor: 40, descricao: "Barbearia - agendamento 12", urlAviso: "https://site.app/api/pagamentos/mercadopago/webhook", agora: new Date("2026-10-03T13:00:00Z") };

  it("pede um Pix ao Mercado Pago com os campos certos", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(resposta), { status: 201 }));
    const r = await criarPix(cfg, dados, f);
    expect(r).toEqual({ ok: true, mpId: "987001", copiaECola: "00020126...6304ABCD" });

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer APP_USR-token");
    expect(init.headers["X-Idempotency-Key"]).toBe("pix-ag-12");
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({
      transaction_amount: 40,
      payment_method_id: "pix",
      external_reference: "AG12",
      notification_url: dados.urlAviso,
      payer: { email: "cliente@barbearia.com" },
    });
    // validade: agora + 30 min, com fuso explícito
    expect(corpo.date_of_expiration).toBe("2026-10-03T13:30:00.000+00:00");
    expect(VALIDADE_MP_MIN).toBe(30);
  });

  it("arredonda o valor para centavos", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(resposta), { status: 201 }));
    await criarPix(cfg, { ...dados, valor: 45.5 + 0.0000001 }, f);
    expect(JSON.parse(f.mock.calls[0][1].body).transaction_amount).toBe(45.5);
  });

  it("devolve o erro em vez de lançar", async () => {
    const recusa = vi.fn().mockResolvedValue(new Response('{"message":"invalid token"}', { status: 401 }));
    expect(await criarPix(cfg, dados, recusa)).toMatchObject({ ok: false, status: 401 });
    const semCodigo = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    expect(await criarPix(cfg, dados, semCodigo)).toMatchObject({ ok: false });
    const rede = vi.fn().mockRejectedValue(new Error("sem rede"));
    expect(await criarPix(cfg, dados, rede)).toMatchObject({ ok: false, status: 0, erro: "sem rede" });
  });
});

describe("buscarPagamento", () => {
  it("lê status, valor e referência", async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 987001, status: "approved", transaction_amount: 40, external_reference: "AG12", payment_method_id: "pix" }), { status: 200 }),
    );
    expect(await buscarPagamento(cfg, "987001", f)).toEqual({
      ok: true,
      pagamento: { id: "987001", status: "approved", valor: 40, referencia: "AG12", metodo: "pix" },
    });
    expect(f.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/987001");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer APP_USR-token");
  });

  it("erro HTTP, resposta torta e rede caída não lançam", async () => {
    expect(await buscarPagamento(cfg, "1", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })))).toMatchObject({ ok: false, status: 404 });
    expect(await buscarPagamento(cfg, "1", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })))).toMatchObject({ ok: false });
    expect(await buscarPagamento(cfg, "1", vi.fn().mockRejectedValue(new Error("x")))).toMatchObject({ ok: false, status: 0 });
  });

  it("protege o id na URL", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    await buscarPagamento(cfg, "1/../../x", f);
    expect(f.mock.calls[0][0]).not.toContain("/../");
  });
});

describe("assinaturaMPValida", () => {
  const assinar = (manifesto: string, segredo: string) => createHmac("sha256", segredo).update(manifesto).digest("hex");
  const base = { dataId: "987001", requestId: "req-abc", segredo: "segredo" };

  it("aceita a assinatura certa", () => {
    const v1 = assinar("id:987001;request-id:req-abc;ts:1700000000;", "segredo");
    expect(assinaturaMPValida({ ...base, xSignature: `ts=1700000000,v1=${v1}` })).toBe(true);
  });

  it("id alfanumérico entra em minúsculas no texto assinado", () => {
    const v1 = assinar("id:abc123;request-id:req-abc;ts:1;", "segredo");
    expect(assinaturaMPValida({ ...base, dataId: "ABC123", xSignature: `ts=1,v1=${v1}` })).toBe(true);
  });

  it("partes ausentes saem do texto assinado", () => {
    const v1 = assinar("ts:1;", "segredo");
    expect(assinaturaMPValida({ dataId: null, requestId: null, segredo: "segredo", xSignature: `ts=1,v1=${v1}` })).toBe(true);
  });

  it("recusa segredo errado, id trocado, cabeçalho ausente ou torto", () => {
    const v1 = assinar("id:987001;request-id:req-abc;ts:1700000000;", "segredo");
    const x = `ts=1700000000,v1=${v1}`;
    expect(assinaturaMPValida({ ...base, segredo: "outro", xSignature: x })).toBe(false);
    expect(assinaturaMPValida({ ...base, dataId: "987002", xSignature: x })).toBe(false);
    expect(assinaturaMPValida({ ...base, requestId: "req-xyz", xSignature: x })).toBe(false);
    expect(assinaturaMPValida({ ...base, xSignature: null })).toBe(false);
    expect(assinaturaMPValida({ ...base, xSignature: "lixo" })).toBe(false);
    expect(assinaturaMPValida({ ...base, xSignature: "ts=1,v1=zz" })).toBe(false);
    expect(assinaturaMPValida({ ...base, xSignature: `v1=${v1}` })).toBe(false);
  });
});
