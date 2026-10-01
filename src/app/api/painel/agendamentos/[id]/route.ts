import { NextResponse } from "next/server";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { escopoDe, marcarAtendimento } from "@/lib/painel";
import { usuarioAtual } from "@/lib/sessao";
import { novoStatus } from "@/lib/validacao";

// PATCH /api/painel/agendamentos/12  { "status": "CONCLUIDO" }  ou  { "status": "FALTOU" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const id = Number((await params).id);
  const corpo = novoStatus.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0 || !corpo.success) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const ok = await marcarAtendimento(
    getDb(),
    escopoDe(usuario),
    id,
    corpo.data.status,
    agoraNaBarbearia().data,
  );
  if (!ok) {
    return NextResponse.json({ erro: "Agendamento não encontrado ou não pode ser alterado." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}