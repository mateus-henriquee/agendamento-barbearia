import { describe, expect, it } from "vitest";
import { crc16, gerarPixCopiaECola, pixConfigurado } from "./pix";

const base = { chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA" };

describe("crc16", () => {
  it("bate com o valor de referência do padrão CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("gerarPixCopiaECola", () => {
  it("gera exatamente o exemplo do manual do BR Code", () => {
    expect(gerarPixCopiaECola(base)).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("inclui o valor com duas casas decimais", () => {
    expect(gerarPixCopiaECola({ ...base, valor: 40 })).toContain("540540.00");
    expect(gerarPixCopiaECola({ ...base, valor: 1234.5 })).toContain("5407" + "1234.50");
  });

  it("o CRC no final sempre confere", () => {
    const codigo = gerarPixCopiaECola({ ...base, valor: 65, txid: "AG123" });
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
  });

  it("usa o txid do pedido, só com letras e números", () => {
    expect(gerarPixCopiaECola({ ...base, txid: "AG-000 12!" })).toContain("62110507AG00012");
    expect(gerarPixCopiaECola({ ...base, txid: "AG12" })).toContain("62080504AG12");
  });

  it("tira acentos e corta nome e cidade no limite", () => {
    const codigo = gerarPixCopiaECola({
      ...base,
      nome: "Barbearia Espiral de São João Ltda ME",
      cidade: "São José dos Campos",
    });
    expect(codigo).toContain("5924Barbearia Espiral de Sao"); // 25 caracteres, o último era espaço
    expect(codigo).toContain("6015Sao Jose dos Ca");
  });

  it("recusa dados inválidos", () => {
    expect(() => gerarPixCopiaECola({ ...base, chave: "  " })).toThrow(RangeError);
    expect(() => gerarPixCopiaECola({ ...base, nome: "" })).toThrow(RangeError);
    expect(() => gerarPixCopiaECola({ ...base, valor: 0 })).toThrow(RangeError);
    expect(() => gerarPixCopiaECola({ ...base, valor: -5 })).toThrow(RangeError);
    expect(() => gerarPixCopiaECola({ ...base, valor: Number.NaN })).toThrow(RangeError);
  });
});

describe("pixConfigurado", () => {
  it("devolve a configuração quando as três variáveis existem", () => {
    expect(pixConfigurado({ PIX_CHAVE: "a@b.com", PIX_NOME: "Espiral", PIX_CIDADE: "Sao Paulo" })).toEqual({
      chave: "a@b.com",
      nome: "Espiral",
      cidade: "Sao Paulo",
    });
  });

  it("devolve null se a configuração for inválida (chave longa demais)", () => {
    expect(pixConfigurado({ PIX_CHAVE: "x".repeat(100), PIX_NOME: "Espiral", PIX_CIDADE: "Sao Paulo" })).toBeNull();
  });

  it("devolve null se faltar alguma", () => {
    expect(pixConfigurado({ PIX_CHAVE: "a@b.com" })).toBeNull();
    expect(pixConfigurado({})).toBeNull();
  });
});
