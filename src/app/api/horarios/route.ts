import { NextResponse } from "next/server";
import { z } from "zod";
import { horariosDisponiveis } from "@/lib/agendamentos";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { consultaHorarios } from "@/lib/validacao";

// GET /api/horarios?barbeiroId=1&servicoId=1&data=2026-10-05
export async function GET(req: Request) {
  const parsed = consultaHorarios.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }

  const agora = agoraNaBarbearia();
  const { data } = parsed.data;
  if (data < agora.data) return NextResponse.json({ horarios: [] }); // dia que já passou

  const horarios = await horariosDisponiveis(getDb(), {
    ...parsed.data,
    apartirDe: data === agora.data ? agora.hora : undefined, // hoje: só dali em diante
  });
  return NextResponse.json({ horarios });
}