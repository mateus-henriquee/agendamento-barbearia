// Uso: npm run usuario -- "Nome" email@exemplo.com senha-com-8-ou-mais DONO
//      npm run usuario -- "João" joao@exemplo.com senha-com-8-ou-mais BARBEIRO 1
import { criarUsuario, type Papel } from "../src/lib/auth";
import { getDb } from "../src/lib/db";

async function main() {
  const [nome, email, senha, papel, barbeiroId] = process.argv.slice(2);

  if (!nome || !email || !senha || (papel !== "DONO" && papel !== "BARBEIRO")) {
    console.error('Uso: npm run usuario -- "Nome" email senha DONO|BARBEIRO [barbeiroId]');
    return 1;
  }

  const r = await criarUsuario(getDb(), {
    nome,
    email,
    senha,
    papel: papel as Papel,
    barbeiroId: barbeiroId ? Number(barbeiroId) : null,
  });

  if (r.ok) {
    console.log(`Usuário criado (id ${r.id}).`);
    return 0;
  }
  console.error(`Não foi possível criar: ${r.motivo}`);
  return 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(erro);
    process.exit(1);
  },
);