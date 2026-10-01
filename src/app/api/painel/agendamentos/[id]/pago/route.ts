import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { confirmarPagamento, escopoDe } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";

// POST /api/painel/agendamentos/12/pago   (o barbeiro confirma que o Pix caiu)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const ok = await confirmarPagamento(getDb(), escopoDe(usuario), id);
  if (!ok) {
    return NextResponse.json({ erro: "Agendamento não encontrado ou pagamento já confirmado." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
