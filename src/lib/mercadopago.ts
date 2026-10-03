import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente mínimo do Mercado Pago para Pix. Sem biblioteca: são só chamadas HTTP.
 * Fluxo: criamos um Pix por agendamento (com o id do agendamento como referência); o Mercado Pago avisa
 * o nosso webhook quando o dinheiro cai; nós consultamos o pagamento direto na API deles antes de confirmar.
 */

export type ConfigMercadoPago = {
  accessToken: string;
  /** Chave secreta do webhook (recomendado). Sem ela, o aviso não tem a assinatura conferida, mas o pagamento é sempre reconsultado na API. */
  segredoWebhook: string | null;
  /** E-mail que o Mercado Pago exige no pagador. O cliente do site não informa e-mail. */
  emailPagador: string;
  apiUrl: string;
};

export function configMercadoPago(env: Record<string, string | undefined> = process.env): ConfigMercadoPago | null {
  const accessToken = env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  return {
    accessToken,
    segredoWebhook: env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null,
    emailPagador: env.MERCADOPAGO_EMAIL_PAGADOR?.trim() || "cliente@barbearia.com",
    apiUrl: (env.MERCADOPAGO_API_URL?.trim() || "https://api.mercadopago.com").replace(/\/$/, ""),
  };
}

/** O Mercado Pago exige pelo menos 30 minutos de validade num Pix. Nossa reserva dura menos; pagamento tardio é tratado no banco. */
export const VALIDADE_MP_MIN = 30;

type Fetch = typeof fetch;

export type PixCriado = { mpId: string; copiaECola: string };
export type ResultadoCriar = ({ ok: true } & PixCriado) | { ok: false; status: number; erro: string };

export async function criarPix(
  cfg: ConfigMercadoPago,
  d: { agendamentoId: number; valor: number; descricao: string; urlAviso: string; agora?: Date },
  fetchImpl: Fetch = fetch,
): Promise<ResultadoCriar> {
  const expira = new Date((d.agora ?? new Date()).getTime() + VALIDADE_MP_MIN * 60_000);
  try {
    const r = await fetchImpl(`${cfg.apiUrl}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
        // Mesma chave para o mesmo agendamento: se repetirmos o pedido, o Mercado Pago não cobra duas vezes.
        "X-Idempotency-Key": `pix-ag-${d.agendamentoId}`,
      },
      body: JSON.stringify({
        transaction_amount: Math.round(d.valor * 100) / 100,
        description: d.descricao.slice(0, 200),
        payment_method_id: "pix",
        external_reference: `AG${d.agendamentoId}`,
        notification_url: d.urlAviso,
        date_of_expiration: expira.toISOString().replace("Z", "+00:00"),
        payer: { email: cfg.emailPagador },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const texto = await r.text();
    if (!r.ok) return { ok: false, status: r.status, erro: texto.slice(0, 300) };
    const j = JSON.parse(texto) as { id?: number | string; point_of_interaction?: { transaction_data?: { qr_code?: string } } };
    const copiaECola = j.point_of_interaction?.transaction_data?.qr_code;
    if (j.id === undefined || !copiaECola) return { ok: false, status: r.status, erro: "resposta sem id ou sem código Pix" };
    return { ok: true, mpId: String(j.id), copiaECola };
  } catch (erro) {
    return { ok: false, status: 0, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

export type PagamentoMP = {
  id: string;
  status: string; // approved, pending, cancelled, rejected, expired, refunded ...
  valor: number;
  referencia: string | null;
  metodo: string | null;
};

/** Consulta o pagamento direto no Mercado Pago. É essa resposta, e não o aviso recebido, que decide se foi pago. */
export async function buscarPagamento(
  cfg: ConfigMercadoPago,
  mpId: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true; pagamento: PagamentoMP } | { ok: false; status: number; erro: string }> {
  try {
    const r = await fetchImpl(`${cfg.apiUrl}/v1/payments/${encodeURIComponent(mpId)}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const texto = await r.text();
    if (!r.ok) return { ok: false, status: r.status, erro: texto.slice(0, 300) };
    const j = JSON.parse(texto) as {
      id?: number | string;
      status?: string;
      transaction_amount?: number;
      external_reference?: string | null;
      payment_method_id?: string | null;
    };
    if (j.id === undefined || typeof j.status !== "string" || typeof j.transaction_amount !== "number") {
      return { ok: false, status: r.status, erro: "resposta inesperada" };
    }
    return {
      ok: true,
      pagamento: { id: String(j.id), status: j.status, valor: j.transaction_amount, referencia: j.external_reference ?? null, metodo: j.payment_method_id ?? null },
    };
  } catch (erro) {
    return { ok: false, status: 0, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/**
 * Confere a assinatura do aviso (cabeçalho x-signature).
 * O Mercado Pago assina "id:<id do pagamento>;request-id:<x-request-id>;ts:<ts>;" com HMAC-SHA256 e a chave secreta do webhook.
 * Partes ausentes saem do texto assinado.
 */
export function assinaturaMPValida(p: { dataId: string | null; requestId: string | null; xSignature: string | null; segredo: string }): boolean {
  if (!p.xSignature) return false;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const parte of p.xSignature.split(",")) {
    const [chave, ...resto] = parte.trim().split("=");
    const valor = resto.join("=");
    if (chave === "ts") ts = valor;
    if (chave === "v1") v1 = valor;
  }
  if (!ts || !v1) return false;

  let manifesto = "";
  if (p.dataId) manifesto += `id:${/^[a-z0-9]+$/i.test(p.dataId) ? p.dataId.toLowerCase() : p.dataId};`;
  if (p.requestId) manifesto += `request-id:${p.requestId};`;
  manifesto += `ts:${ts};`;

  const esperado = createHmac("sha256", p.segredo).update(manifesto).digest();
  const recebido = Buffer.from(v1, "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
