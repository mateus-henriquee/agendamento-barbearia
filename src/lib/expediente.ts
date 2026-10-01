import { agoraNaBarbearia } from "./agora";
import type { Db } from "./db";

export type OpcoesExpediente = {
  dias: number; // quantos dias à frente, contando hoje
  inicio: string; // "09:00"
  fim: string; // "18:00"
  diasDaSemana: number[]; // 0 = domingo ... 6 = sábado
};

export const EXPEDIENTE_PADRAO: OpcoesExpediente = { dias: 60, inicio: "09:00", fim: "18:00", diasDaSemana: [1, 2, 3, 4, 5, 6] };

/**
 * Cria o expediente dos barbeiros ATIVOS para os próximos dias.
 * Quem já tem expediente em um dia não é alterado (dá para rodar toda semana sem estragar nada).
 * Devolve quantos dias novos foram criados.
 */
export async function gerarExpediente(db: Db, o: OpcoesExpediente = EXPEDIENTE_PADRAO, hoje = agoraNaBarbearia().data): Promise<number> {
  if (!Number.isInteger(o.dias) || o.dias < 1 || o.dias > 366) throw new RangeError("dias deve ficar entre 1 e 366");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.fim) || o.fim <= o.inicio) {
    throw new RangeError("Horário inválido: o fim precisa ser depois do início (HH:MM)");
  }
  if (o.diasDaSemana.length === 0 || o.diasDaSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new RangeError("diasDaSemana deve ter números de 0 (domingo) a 6 (sábado)");
  }

  const r = await db.query(
    `INSERT INTO horarios_funcionamento (barbeiro_id, data, hora_inicio, hora_fim)
     SELECT b.id, d::date, $3::time, $4::time
       FROM barbeiros b
       CROSS JOIN generate_series($1::date, $1::date + ($2::int - 1), interval '1 day') AS d
      WHERE b.status = 'ATIVO' AND extract(dow FROM d)::int = ANY($5::int[])
     ON CONFLICT (barbeiro_id, data) DO NOTHING
     RETURNING barbeiro_id`,
    [hoje, o.dias, o.inicio, o.fim, o.diasDaSemana],
  );
  return r.rows.length;
}
