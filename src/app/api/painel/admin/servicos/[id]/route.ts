import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirDono } from "@/lib/acesso";
import { atualizarServico } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { alteraServico } from "@/lib/validacao";

// PATCH /api/painel/admin/servicos/2  { "preco": 50 }  ou  { "ativo": false }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;

  const id = Number((await params).id);
  const parsed = alteraServico.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });

  if (!(await atualizarServico(getDb(), id, parsed.data))) {
    return NextResponse.json({ erro: "Serviço não encontrado." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
