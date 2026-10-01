import { NextResponse } from "next/server";
import { z } from "zod";
import { agendar } from "@/lib/agendamentos";
import { agoraNaBarbearia } from "@/lib/agora";
import { getDb } from "@/lib/db";
import { novoAgendamento } from "@/lib/validacao";

const STATUS = {
  CONFLITO: 409,
  FORA_DO_EXPEDIENTE: 422,
  SERVICO_NAO_ENCONTRADO: 404,
  REFERENCIA_INVALIDA: 404,
} as const;

const MENSAGEM = {
  CONFLITO: "Esse horário já foi reservado",
  FORA_DO_EXPEDIENTE: "Horário fora do expediente ou barbeiro indisponível",
  SERVICO_NAO_ENCONTRADO: "Serviço não encontrado",
  REFERENCIA_INVALIDA: "Barbeiro ou cliente não encontrado",
} as const;

// POST /api/agendamentos
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = novoAgendamento.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ erro: z.flattenError(parsed.error) }, { status: 400 });
  }

  const agora = agoraNaBarbearia();
  const { data, horaInicio } = parsed.data;
  if (data < agora.data || (data === agora.data && horaInicio <= agora.hora)) {
    return NextResponse.json({ erro: "Horário no passado" }, { status: 400 });
  }

  const r = await agendar(getDb(), parsed.data);
  if (r.ok) return NextResponse.json({ id: r.id }, { status: 201 });
  return NextResponse.json({ erro: MENSAGEM[r.motivo], motivo: r.motivo }, { status: STATUS[r.motivo] });
}