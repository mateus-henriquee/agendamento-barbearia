import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { assinaturaMPValida, configMercadoPago } from "@/lib/mercadopago";
import { tratarAvisoMercadoPago } from "@/lib/pix-automatico";

// POST /api/pagamentos/mercadopago/webhook — o Mercado Pago avisa que um pagamento mudou.
// Responder 200 = "recebi". Qualquer outra coisa faz o Mercado Pago tentar de novo mais tarde.
export async function POST(req: Request) {
  const cfg = configMercadoPago();
  if (!cfg) return NextResponse.json({ erro: "Mercado Pago não configurado" }, { status: 503 });

  const url = new URL(req.url);
  const bruto = await req.text();
  let corpo: { type?: unknown; topic?: unknown; data?: { id?: unknown } } = {};
  try {
    corpo = bruto ? JSON.parse(bruto) : {};
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  const idCorpo = corpo?.data?.id !== undefined ? String(corpo.data.id) : null;
  const dataId = url.searchParams.get("data.id") ?? idCorpo;

  if (cfg.segredoWebhook) {
    const ok = assinaturaMPValida({
      dataId: url.searchParams.get("data.id") ?? idCorpo,
      requestId: req.headers.get("x-request-id"),
      xSignature: req.headers.get("x-signature"),
      segredo: cfg.segredoWebhook,
    });
    if (!ok) return NextResponse.json({ erro: "Assinatura inválida" }, { status: 403 });
  }

  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (typeof corpo.type === "string" ? corpo.type : typeof corpo.topic === "string" ? corpo.topic : null);
  if (tipo !== "payment" || !dataId || !/^\d{1,20}$/.test(dataId)) return NextResponse.json({ ok: true, ignorado: true });

  const r = await tratarAvisoMercadoPago(getDb(), cfg, dataId);
  if (r.resultado === "ERRO") {
    console.error(`[pix] não foi possível consultar o pagamento ${dataId}: ${r.detalhe}`);
    return NextResponse.json({ erro: "Tente de novo" }, { status: 500 });
  }
  if (r.resultado === "REEMBOLSO_PENDENTE") console.error(`[pix] pagamento ${dataId} recebido sem horário: devolver ao cliente`);
  return NextResponse.json({ ok: true, resultado: r.resultado });
}
