import { NextResponse } from "next/server";
import { cancelar } from "@/lib/agendamentos";
import { getDb } from "@/lib/db";

// DELETE /api/agendamentos/12
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  }
  const cancelado = await cancelar(getDb(), id);
  if (!cancelado) {
    return NextResponse.json({ erro: "Agendamento não encontrado ou já cancelado" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}