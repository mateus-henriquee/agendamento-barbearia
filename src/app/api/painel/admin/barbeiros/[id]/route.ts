import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirDono } from "@/lib/acesso";
import { atualizarBarbeiro } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { gerarExpediente } from "@/lib/expediente";
import { alteraBarbeiro } from "@/lib/validacao";

// PATCH /api/painel/admin/barbeiros/3  { "status": "AUSENTE" }  e/ou  { "nome": "...", "servicoIds": [1] }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;

  const id = Number((await params).id);
  const parsed = alteraBarbeiro.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });

  const db = getDb();
  if (!(await atualizarBarbeiro(db, id, parsed.data))) {
    return NextResponse.json({ erro: "Barbeiro ou serviço não encontrado." }, { status: 404 });
  }
  if (parsed.data.status === "ATIVO") await gerarExpediente(db); // quem volta já tem horários
  return new NextResponse(null, { status: 204 });
}
