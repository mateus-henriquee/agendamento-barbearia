import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { depoisDaResposta } from "@/lib/depois";
import { processarWebhook } from "@/lib/webhook-whatsapp";
import { assinaturaValida, configWhatsApp } from "@/lib/whatsapp";

// GET: a Meta chama uma vez, ao cadastrar o webhook, para confirmar que o endereço é nosso.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (esperado && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === esperado) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST: cada mensagem recebida. Só aceitamos o que vier assinado pela Meta.
export async function POST(req: Request) {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  const cfg = configWhatsApp();
  if (!segredo || !cfg) return NextResponse.json({ erro: "WhatsApp não configurado" }, { status: 503 });

  const corpo = await req.text(); // o texto bruto é o que foi assinado; não pode ser reformatado antes
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), segredo)) {
    return NextResponse.json({ erro: "Assinatura inválida" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  // Responde 200 já; a Meta reenvia se demorarmos. O trabalho segue em segundo plano.
  depoisDaResposta(() => processarWebhook(getDb(), payload, cfg));
  return NextResponse.json({ ok: true });
}
