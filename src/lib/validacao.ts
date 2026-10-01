import { z } from "zod";

const id = z.number().int().positive();
const idDaUrl = z.coerce.number().int().positive(); // query string chega como texto

/** "2026-10-05": formato certo e data que existe (recusa 2026-02-31). */
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, "Data inexistente");

/** "14:30": 00:00 até 23:59. */
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

export const consultaHorarios = z.object({
  barbeiroId: idDaUrl,
  servicoId: idDaUrl,
  data,
});

export const novoAgendamento = z.object({
  barbeiroId: id,
  servicoId: id,
  clienteId: id,
  data,
  horaInicio: hora,
});

/** Deixa só os dígitos e acrescenta o código do país (55) se faltar. */
export function normalizarTelefone(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}

/** Telefone brasileiro: 55 + DDD (11 a 99) + 8 ou 9 dígitos. */
const telefone = z
  .string()
  .transform(normalizarTelefone)
  .refine((t) => /^55[1-9][1-9]\d{8,9}$/.test(t), "Telefone inválido. Use DDD + número");

export const novoCliente = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(100),
  telefone,
});