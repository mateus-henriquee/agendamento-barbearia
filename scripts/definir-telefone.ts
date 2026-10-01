// Uso: npm run telefone -- email@exemplo.com "11 99999-9999"
//      npm run telefone -- email@exemplo.com limpar
// O número do usuário recebe os avisos de novo agendamento e pode consultar a agenda pelo WhatsApp.
import { getDb } from "../src/lib/db";
import { definirTelefone } from "../src/lib/telefone";

async function main() {
  const [email, telefone] = process.argv.slice(2);
  if (!email || !telefone) {
    console.error('Uso: npm run telefone -- email "11 99999-9999"   (ou "limpar" para remover)');
    return 1;
  }
  const r = await definirTelefone(getDb(), { email }, telefone === "limpar" ? null : telefone);
  if (r === "OK") {
    console.log("WhatsApp salvo.");
    return 0;
  }
  const texto = {
    USUARIO_NAO_ENCONTRADO: "Nenhum usuário com esse e-mail.",
    TELEFONE_INVALIDO: "Telefone inválido. Use DDD + número.",
    TELEFONE_EM_USO: "Esse número já pertence a outro usuário.",
  }[r];
  console.error(texto);
  return 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(erro);
    process.exit(1);
  },
);
