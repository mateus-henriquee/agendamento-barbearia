/** Intervalo de horas no mesmo dia, no formato "HH:MM". */
export type Intervalo = { inicio: string; fim: string };

export function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function paraHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Intervalos são [inicio, fim): fim de um igual ao início do outro não conflita. */
export function haConflito(a: Intervalo, b: Intervalo): boolean {
  return paraMinutos(a.inicio) < paraMinutos(b.fim) && paraMinutos(b.inicio) < paraMinutos(a.fim);
}

type Parametros = {
  expediente: Intervalo; // turno do barbeiro no dia
  duracaoMin: number; // duração do serviço
  ocupados: Intervalo[]; // agendamentos ativos do barbeiro no dia
  passoMin?: number; // de quanto em quanto tempo oferecer horários (padrão 30)
  apartirDe?: string; // não oferece início antes disso (ex.: hora atual)
};

/** Horários de início livres para um serviço, dentro do expediente. */
export function horariosLivres(p: Parametros): string[] {
  const passo = p.passoMin ?? 30;
  if (p.duracaoMin <= 0 || passo <= 0) {
    throw new RangeError("duracaoMin e passoMin devem ser maiores que zero");
  }

  const abre = paraMinutos(p.expediente.inicio);
  const fecha = paraMinutos(p.expediente.fim);
  const minimo = p.apartirDe ? paraMinutos(p.apartirDe) : 0;
  const livres: string[] = [];

  for (let t = abre; t + p.duracaoMin <= fecha; t += passo) {
    if (t < minimo) continue;
    const candidato = { inicio: paraHora(t), fim: paraHora(t + p.duracaoMin) };
    if (p.ocupados.some((o) => haConflito(candidato, o))) continue;
    livres.push(candidato.inicio);
  }
  return livres;
}