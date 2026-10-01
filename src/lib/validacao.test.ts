import { describe, expect, it } from "vitest";
import { consultaHorarios, novoAgendamento } from "./validacao";

const valido = { barbeiroId: 1, servicoId: 1, clienteId: 1, data: "2026-10-05", horaInicio: "14:30" };

describe("novoAgendamento", () => {
  it("aceita dados válidos", () => {
    expect(novoAgendamento.safeParse(valido).success).toBe(true);
  });

  it.each([
    ["data inexistente", { ...valido, data: "2026-02-31" }],
    ["data em formato errado", { ...valido, data: "05/10/2026" }],
    ["hora 24:00", { ...valido, horaInicio: "24:00" }],
    ["hora sem zero", { ...valido, horaInicio: "9:00" }],
    ["id como texto", { ...valido, barbeiroId: "1" }],
    ["id negativo", { ...valido, servicoId: -1 }],
    ["campo faltando", { barbeiroId: 1 }],
  ])("recusa %s", (_nome, dados) => {
    expect(novoAgendamento.safeParse(dados).success).toBe(false);
  });
});

describe("consultaHorarios", () => {
  it("converte ids de texto para número", () => {
    const r = consultaHorarios.parse({ barbeiroId: "2", servicoId: "3", data: "2026-10-05" });
    expect(r).toEqual({ barbeiroId: 2, servicoId: 3, data: "2026-10-05" });
  });

  it("recusa parâmetros faltando", () => {
    expect(consultaHorarios.safeParse({}).success).toBe(false);
  });
});


