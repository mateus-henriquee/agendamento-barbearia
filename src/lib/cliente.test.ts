import { describe, expect, it } from "vitest";
import { normalizarTelefone, novoCliente } from "./validacao";

describe("normalizarTelefone", () => {
  it.each([
    ["(11) 99999-0001", "5511999990001"],
    ["11 99999-0001", "5511999990001"],
    ["+55 11 99999-0001", "5511999990001"],
    ["5511999990001", "5511999990001"],
    ["(11) 3333-4444", "551133334444"], // fixo, 10 dígitos
    ["(55) 99123-4567", "5555991234567"], // DDD 55 (RS) não é confundido com o país
  ])("%s -> %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });
});

describe("novoCliente", () => {
  it("aceita e normaliza", () => {
    const r = novoCliente.parse({ nome: "  Ana  ", telefone: "(11) 99999-0001" });
    expect(r).toEqual({ nome: "Ana", telefone: "5511999990001" });
  });

  it.each([
    ["telefone curto", { nome: "Ana", telefone: "9999-0001" }],
    ["telefone com letras", { nome: "Ana", telefone: "abc" }],
    ["DDD inexistente", { nome: "Ana", telefone: "(01) 99999-0001" }],
    ["nome curto", { nome: "A", telefone: "(11) 99999-0001" }],
    ["sem nome", { telefone: "(11) 99999-0001" }],
  ])("recusa %s", (_n, dados) => {
    expect(novoCliente.safeParse(dados).success).toBe(false);
  });
});