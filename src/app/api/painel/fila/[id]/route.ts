import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { atualizarFila } from "@/lib/fila";
import { escopoDe } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";
import { statusFila } from "@/lib/validacao";

// PATCH /api/painel/fila/7  { "status": "AVISADO" }  ou  { "status": "REMOVIDO" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const id = Number((await params).id);
  const corpo = statusFila.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0 || !corpo.success) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const ok = await atualizarFila(getDb(), escopoDe(usuario), id, corpo.data.status);
  if (!ok) return NextResponse.json({ erro: "Item da fila não encontrado." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
