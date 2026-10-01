import { describe, expect, it } from "vitest";
import { dataCurta, linkWhatsApp, mensagemConfirmacao, mensagemLembrete, somarDias } from "./mensagens";

describe("datas", () => {
  it("dataCurta inverte para dia/mês/ano", () => {
    expect(dataCurta("2026-10-05")).toBe("05/10/2026");
  });

  it("somarDias atravessa fim de mês e de ano", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("linkWhatsApp", () => {
  it("deixa só os dígitos do telefone e codifica o texto", () => {
    expect(linkWhatsApp("+55 (11) 99999-0001", "Olá & tudo bem?")).toBe(
      "https://wa.me/5511999990001?text=Ol%C3%A1%20%26%20tudo%20bem%3F",
    );
  });
});

describe("mensagemConfirmacao", () => {
  const base = { cliente: "Ana Souza", servico: "Corte masculino", barbeiro: "João", data: "2026-10-05", hora: "10:00" };

  it("traz todos os dados do agendamento", () => {
    const m = mensagemConfirmacao({ ...base, formaPagamento: "NA_BARBEARIA" });
    expect(m).toContain("Nome: Ana Souza");
    expect(m).toContain("Serviço: Corte masculino");
    expect(m).toContain("Barbeiro: João");
    expect(m).toContain("Data: 05/10/2026 às 10:00");
    expect(m).toContain("Pagamento: após o corte");
  });

  it("informa Pix quando for o caso", () => {
    expect(mensagemConfirmacao({ ...base, formaPagamento: "PIX" })).toContain("Pagamento: Pix");
  });
});

describe("mensagemLembrete", () => {
  const base = { cliente: "Ana Souza", servico: "Corte masculino", hora: "10:00", barbearia: "Espiral" };

  it("usa só o primeiro nome", () => {
    expect(mensagemLembrete({ ...base, data: "2026-10-05" }, "2026-10-05")).toContain("Oi, Ana!");
  });

  it("diz hoje, amanhã ou a data", () => {
    expect(mensagemLembrete({ ...base, data: "2026-10-05" }, "2026-10-05")).toContain("hoje às 10:00");
    expect(mensagemLembrete({ ...base, data: "2026-10-06" }, "2026-10-05")).toContain("amanhã às 10:00");
    expect(mensagemLembrete({ ...base, data: "2026-10-09" }, "2026-10-05")).toContain("dia 09/10 às 10:00");
  });
});

describe("mensagemVaga", () => {
  it("avisa o primeiro nome, o barbeiro e o dia", async () => {
    const { mensagemVaga } = await import("./mensagens");
    const m = mensagemVaga({ cliente: "Ana Souza", barbeiro: "João", data: "2026-10-06", barbearia: "Espiral" }, "2026-10-05");
    expect(m).toContain("Oi, Ana!");
    expect(m).toContain("com João amanhã na Espiral");
  });
});
