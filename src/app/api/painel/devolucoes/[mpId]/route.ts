import { NextResponse } from "next/server";
import { exigirDono } from "@/lib/acesso";
import { getDb } from "@/lib/db";
import { marcarDevolvido } from "@/lib/pix-automatico";

// POST /api/painel/devolucoes/123456 — o dono avisa que já devolveu o dinheiro (só dono)
export async function POST(_req: Request, { params }: { params: Promise<{ mpId: string }> }) {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;
  const { mpId } = await params;
  if (!/^\d{1,20}$/.test(mpId)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  if (!(await marcarDevolvido(getDb(), mpId))) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
