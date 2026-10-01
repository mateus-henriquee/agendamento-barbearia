import { describe, expect, it } from "vitest";
import { agoraNaBarbearia } from "./agora";

describe("agoraNaBarbearia", () => {
  it("converte UTC para o horário de Brasília (UTC-3)", () => {
    expect(agoraNaBarbearia(new Date("2026-10-05T15:30:00Z"))).toEqual({
      data: "2026-10-05",
      hora: "12:30",
    });
  });

  it("muda o dia quando passa da meia-noite em Brasília", () => {
    expect(agoraNaBarbearia(new Date("2026-10-06T02:15:00Z"))).toEqual({
      data: "2026-10-05",
      hora: "23:15",
    });
  });

  it("meia-noite aparece como 00:00, não 24:00", () => {
    expect(agoraNaBarbearia(new Date("2026-10-05T03:00:00Z")).hora).toBe("00:00");
  });
});