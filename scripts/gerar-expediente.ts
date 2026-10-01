// Cria o expediente dos próximos dias para os barbeiros ativos. Pode rodar de novo sem problema.
//   npm run expediente                             60 dias, segunda a sábado, 09:00 às 18:00
//   npm run expediente -- --dias 30 --inicio 08:00 --fim 19:00 --semana 1,2,3,4,5
import { getDb } from "../src/lib/db";
import { EXPEDIENTE_PADRAO, gerarExpediente } from "../src/lib/expediente";

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dias = opcao("dias");
  const semana = opcao("semana");
  const criados = await gerarExpediente(getDb(), {
    dias: dias ? Number(dias) : EXPEDIENTE_PADRAO.dias,
    inicio: opcao("inicio") ?? EXPEDIENTE_PADRAO.inicio,
    fim: opcao("fim") ?? EXPEDIENTE_PADRAO.fim,
    diasDaSemana: semana ? semana.split(",").map(Number) : EXPEDIENTE_PADRAO.diasDaSemana,
  });
  console.log(criados === 0 ? "Nada novo: o expediente já existia." : `✓ ${criados} dias de expediente criados.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
