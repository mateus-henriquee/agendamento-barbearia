import { after } from "next/server";

/**
 * Roda uma tarefa depois de a resposta ir para o cliente (aviso de WhatsApp, por exemplo).
 * Na Vercel o `after` mantém a função viva até a tarefa terminar. Fora de uma requisição (testes, scripts), roda direto.
 * Erros são só registrados: a tarefa nunca derruba quem a chamou.
 */
export function depoisDaResposta(tarefa: () => Promise<unknown>): void {
  const segura = () =>
    tarefa().catch((erro) => {
      console.error("[tarefa em segundo plano]", erro);
    });
  try {
    after(segura);
  } catch {
    void segura();
  }
}
