import { NextResponse } from "next/server";
import { z } from "zod";
import { obterOuCriarCliente } from "@/lib/clientes";
import { getDb } from "@/lib/db";
import { novoCliente } from "@/lib/validacao";

// POST /api/clientes  { "nome": "Ana", "telefone": "(11) 99999-0001" }
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = novoCliente.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }
  const id = await obterOuCriarCliente(getDb(), parsed.data);
  return NextResponse.json({ id });
}