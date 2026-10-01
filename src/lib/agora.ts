const FUSO = "America/Sao_Paulo";

/** Data e hora atuais no fuso da barbearia, não no do servidor. */
export function agoraNaBarbearia(instante: Date = new Date()): { data: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}`,
  };
}