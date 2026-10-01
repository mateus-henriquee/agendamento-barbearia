import { describe, expect, it } from "vitest";
import { haConflito, horariosLivres, paraHora, paraMinutos } from "./horarios";

describe("conversão de hora", () => {
  it("paraMinutos converte HH:MM em minutos desde a meia-noite", () => {
    expect(paraMinutos("00:00")).toBe(0);
    expect(paraMinutos("09:30")).toBe(570);
    expect(paraMinutos("18:00")).toBe(1080);
  });

  it("paraHora converte minutos em HH:MM com zero à esquerda", () => {
    expect(paraHora(0)).toBe("00:00");
    expect(paraHora(570)).toBe("09:30");
    expect(paraHora(1080)).toBe("18:00");
  });
});

describe("haConflito", () => {
  it("detecta sobreposição parcial", () => {
    expect(haConflito({ inicio: "10:00", fim: "11:00" }, { inicio: "10:30", fim: "11:30" })).toBe(true);
  });

  it("detecta um intervalo dentro do outro", () => {
    expect(haConflito({ inicio: "10:00", fim: "12:00" }, { inicio: "10:30", fim: "11:00" })).toBe(true);
  });

  it("intervalos que apenas encostam não conflitam", () => {
    expect(haConflito({ inicio: "10:00", fim: "11:00" }, { inicio: "11:00", fim: "12:00" })).toBe(false);
  });

  it("intervalos separados não conflitam", () => {
    expect(haConflito({ inicio: "09:00", fim: "10:00" }, { inicio: "14:00", fim: "15:00" })).toBe(false);
  });
});

describe("horariosLivres", () => {
  const expediente = { inicio: "09:00", fim: "12:00" };

  it("lista todos os horários quando a agenda está vazia", () => {
    const r = horariosLivres({ expediente, duracaoMin: 60, ocupados: [] });
    expect(r).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("remove horários que colidem com um agendamento", () => {
    const r = horariosLivres({
      expediente,
      duracaoMin: 30,
      ocupados: [{ inicio: "10:00", fim: "11:00" }],
    });
    expect(r).toEqual(["09:00", "09:30", "11:00", "11:30"]);
  });

  it("não oferece serviço que passa do fim do expediente", () => {
    const r = horariosLivres({ expediente, duracaoMin: 90, ocupados: [] });
    expect(r).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("oferece o encaixe exato entre dois agendamentos", () => {
    const r = horariosLivres({
      expediente,
      duracaoMin: 30,
      ocupados: [
        { inicio: "09:00", fim: "10:00" },
        { inicio: "10:30", fim: "12:00" },
      ],
    });
    expect(r).toEqual(["10:00"]);
  });

  it("retorna lista vazia quando o dia está cheio", () => {
    const r = horariosLivres({
      expediente,
      duracaoMin: 30,
      ocupados: [{ inicio: "09:00", fim: "12:00" }],
    });
    expect(r).toEqual([]);
  });

  it("não oferece horários antes de apartirDe", () => {
    const r = horariosLivres({ expediente, duracaoMin: 60, ocupados: [], apartirDe: "10:30" });
    expect(r).toEqual(["10:30", "11:00"]);
  });

  it("respeita o passo informado", () => {
    const r = horariosLivres({
      expediente: { inicio: "09:00", fim: "10:00" },
      duracaoMin: 30,
      ocupados: [],
      passoMin: 15,
    });
    expect(r).toEqual(["09:00", "09:15", "09:30"]);
  });

  it("recusa duração inválida", () => {
    expect(() => horariosLivres({ expediente, duracaoMin: 0, ocupados: [] })).toThrow(RangeError);
  });
});