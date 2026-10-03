import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { statusDoPagamento } from "@/lib/pix-automatico";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/pagamentos/<código> — a tela do cliente pergunta se o Pix já foi confirmado.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const status = await statusDoPagamento(getDb(), token);
  if (!status) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
