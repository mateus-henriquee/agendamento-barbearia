import { NextResponse } from "next/server";
import { z } from "zod";
import { agoraNaBarbearia } from "@/lib/agora";
import { obterOuCriarCliente } from "@/lib/clientes";
import { getDb } from "@/lib/db";
import { entrarNaFila } from "@/lib/fila";
import { entradaFila } from "@/lib/validacao";

// POST /api/fila  { "barbeiroId": 1, "servicoId": 1, "data": "2026-10-05", "nome": "Ana", "telefone": "11999990001" }
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = entradaFila.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { nome, telefone, ...fila } = parsed.data;

  if (fila.data < agoraNaBarbearia().data) {
    return NextResponse.json({ erro: "Escolha uma data de hoje em diante." }, { status: 422 });
  }

  const db = getDb();
  const clienteId = await obterOuCriarCliente(db, { nome, telefone });
  const r = await entrarNaFila(db, { ...fila, clienteId });

  if (r.ok) return NextResponse.json({ id: r.id, posicao: r.posicao }, { status: 201 });
  if (r.motivo === "HA_HORARIO_LIVRE") {
    return NextResponse.json({ erro: "Há horários livres neste dia. Escolha um deles.", motivo: r.motivo }, { status: 409 });
  }
  if (r.motivo === "JA_NA_FILA") {
    return NextResponse.json({ erro: "Você já está na fila deste dia.", motivo: r.motivo }, { status: 409 });
  }
  return NextResponse.json({ erro: "Barbeiro ou serviço não encontrado." }, { status: 404 });
}
