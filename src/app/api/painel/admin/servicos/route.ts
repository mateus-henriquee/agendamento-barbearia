import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirDono } from "@/lib/acesso";
import { criarServico } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { novoServico } from "@/lib/validacao";

// POST /api/painel/admin/servicos  { "nome": "Degradê", "duracaoMin": 40, "preco": 45 }
export async function POST(req: Request) {
  const g = await exigirDono();
  if ("erro" in g) return g.erro;

  const parsed = novoServico.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  return NextResponse.json({ id: await criarServico(getDb(), parsed.data) }, { status: 201 });
}
