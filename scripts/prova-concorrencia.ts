// Prova de que o banco impede overbooking: N pessoas tentam o MESMO horário ao mesmo tempo,
// cada uma por uma conexão diferente. Só uma pode vencer.
//   npm run prova            (20 pessoas)      npm run prova -- 50
import { Pool } from "pg";
import { agendar } from "../src/lib/agendamentos";

const N = Number(process.argv[2] ?? 20);
const DIA = "2099-12-31";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não está definida.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: N });
  const sufixo = String(Date.now()).slice(-9);

  // Dados de teste isolados: um barbeiro e um serviço só desta prova, apagados no fim.
  const barbeiro = (await pool.query("INSERT INTO barbeiros (nome) VALUES ('Prova') RETURNING id")).rows[0].id as number;
  const servico = (
    await pool.query("INSERT INTO servicos (nome, duracao_min, preco) VALUES ('Prova', 30, 1) RETURNING id")
  ).rows[0].id as number;
  await pool.query("INSERT INTO horarios_funcionamento VALUES ($1, $2, '09:00', '18:00')", [barbeiro, DIA]);
  const clientes: number[] = [];
  for (let i = 0; i < N; i++) {
    const c = await pool.query("INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id", [
      `Prova ${i}`,
      `55${sufixo}${String(i).padStart(2, "0")}`,
    ]);
    clientes.push(c.rows[0].id);
  }

  try {
    const inicio = Date.now();
    const resultados = await Promise.all(
      clientes.map((clienteId) =>
        agendar(pool, { barbeiroId: barbeiro, servicoId: servico, clienteId, data: DIA, horaInicio: "10:00" }),
      ),
    );
    const ms = Date.now() - inicio;
    const vencedores = resultados.filter((r) => r.ok).length;
    const conflitos = resultados.filter((r) => !r.ok && r.motivo === "CONFLITO").length;
    const gravados = Number(
      (
        await pool.query(
          "SELECT COUNT(*) AS n FROM agendamentos WHERE barbeiro_id = $1 AND data = $2 AND hora_inicio = '10:00' AND status <> 'CANCELADO'",
          [barbeiro, DIA],
        )
      ).rows[0].n,
    );

    console.log(`${N} pedidos simultâneos para o mesmo horário (${ms} ms)`);
    console.log(`  confirmados: ${vencedores}`);
    console.log(`  conflitos recusados pelo banco: ${conflitos}`);
    console.log(`  linhas gravadas: ${gravados}`);

    if (vencedores !== 1 || conflitos !== N - 1 || gravados !== 1) {
      console.error("FALHOU: o esperado era 1 confirmado e o resto conflito.");
      process.exitCode = 1;
    } else {
      console.log("OK: sem overbooking.");
    }
  } finally {
    await pool.query("DELETE FROM agendamentos WHERE barbeiro_id = $1", [barbeiro]);
    await pool.query("DELETE FROM horarios_funcionamento WHERE barbeiro_id = $1", [barbeiro]);
    await pool.query("DELETE FROM clientes WHERE id = ANY($1::int[])", [clientes]);
    await pool.query("DELETE FROM servicos WHERE id = $1", [servico]);
    await pool.query("DELETE FROM barbeiros WHERE id = $1", [barbeiro]);
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
