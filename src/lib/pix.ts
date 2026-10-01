/**
 * Pix "copia e cola" (BR Code estático).
 * É um texto no padrão EMV: cada campo é  ID (2 dígitos) + TAMANHO (2 dígitos) + VALOR.
 * No fim vai um CRC16 que o app do banco usa para saber que o código não foi alterado.
 */

export type DadosPix = {
  chave: string; // chave Pix da barbearia (CPF, CNPJ, e-mail, celular +55... ou aleatória)
  nome: string; // nome do recebedor (até 25 caracteres)
  cidade: string; // cidade do recebedor (até 15 caracteres)
  valor?: number; // em reais. Sem valor, o cliente digita no app.
  txid?: string; // identificador do pedido (letras e números, até 25)
};

/** Monta um campo: id + tamanho com 2 dígitos + valor. Ex.: campo("59", "Ana") = "5903Ana" */
function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, "0") + valor;
}

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), o exigido pelo Pix. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Tira acentos e caracteres fora do ASCII, e corta no tamanho máximo. */
function limpar(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, max)
    .trim(); // o corte pode deixar um espaço no fim
}

export function gerarPixCopiaECola(d: DadosPix): string {
  const chave = d.chave.trim();
  const nome = limpar(d.nome, 25);
  const cidade = limpar(d.cidade, 15);
  if (!chave || chave.length > 77) throw new RangeError("Chave Pix inválida");
  if (!nome || !cidade) throw new RangeError("Nome e cidade são obrigatórios");
  if (d.valor !== undefined && !(Number.isFinite(d.valor) && d.valor > 0 && d.valor <= 999_999.99)) {
    throw new RangeError("Valor inválido");
  }
  const txid = (d.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const semCrc =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", chave)) +
    campo("52", "0000") + // categoria do comerciante: não informada
    campo("53", "986") + // moeda: real
    (d.valor !== undefined ? campo("54", d.valor.toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid)) +
    "6304"; // o CRC é calculado incluindo este "6304"

  return semCrc + crc16(semCrc);
}

/** Lê a configuração do Pix das variáveis de ambiente. null = Pix não configurado (ou configurado errado). */
export function pixConfigurado(env: Record<string, string | undefined> = process.env) {
  const { PIX_CHAVE, PIX_NOME, PIX_CIDADE } = env;
  if (!PIX_CHAVE || !PIX_NOME || !PIX_CIDADE) return null;
  const config = { chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE };
  try {
    gerarPixCopiaECola({ ...config, valor: 1 }); // teste: se der erro, a configuração está errada
  } catch {
    return null;
  }
  return config;
}
