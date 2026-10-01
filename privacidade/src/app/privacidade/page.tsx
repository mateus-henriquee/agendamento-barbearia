import type { Metadata } from "next";
import { Documento, Lista, Secao } from "@/components/documento";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Política de Privacidade — ${site.nome}`,
  description: `Como a ${site.nome} trata os dados de quem agenda horário pelo site.`,
};

export default function Privacidade() {
  return (
    <Documento titulo="Política de Privacidade" atualizado="1 de outubro de 2026">
      <p>
        Esta página explica quais dados a barbearia <strong>{site.nome}</strong> coleta quando você agenda um horário pelo site, para que usamos e como
        você pode pedir a correção ou a exclusão deles, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <Secao titulo="Quem é o responsável">
        <p>
          {site.nome} — {site.endereco}. Contato: WhatsApp {site.telefone}.
        </p>
      </Secao>

      <Secao titulo="Quais dados coletamos">
        <Lista
          itens={[
            "Nome e telefone, informados por você ao agendar.",
            "O serviço, o barbeiro, a data e o horário escolhidos.",
            "A forma de pagamento escolhida (Pix ou na barbearia) e se o pagamento foi confirmado.",
            "Se o dia estiver cheio e você entrar na fila de espera: nome, telefone e o dia desejado.",
          ]}
        />
        <p>Não pedimos CPF, endereço, e-mail, senha nem dados de cartão de quem agenda. O pagamento por Pix é feito no aplicativo do seu banco.</p>
      </Secao>

      <Secao titulo="Para que usamos">
        <Lista
          itens={[
            "Reservar o horário e evitar dois clientes no mesmo horário.",
            "Avisar a equipe sobre o seu agendamento.",
            "Confirmar ou lembrar o horário com você pelo WhatsApp.",
            "Avisar você se um horário vagar, caso esteja na fila de espera.",
            "Controlar o atendimento e o faturamento da barbearia.",
          ]}
        />
        <p>Não vendemos seus dados e não os usamos para propaganda de terceiros.</p>
      </Secao>

      <Secao titulo="WhatsApp">
        <p>
          Usamos a plataforma WhatsApp Business (API oficial da Meta) para enviar avisos à equipe da barbearia e para que barbeiros consultem a própria
          agenda. Para a mensagem chegar, o número de telefone do destinatário e o texto da mensagem passam pelos servidores da Meta, que trata esses dados
          conforme a política dela. Quando você mesmo toca no botão de WhatsApp do site, a conversa abre no seu aplicativo.
        </p>
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        <Lista
          itens={[
            "A equipe da barbearia (barbeiro do seu horário e responsável).",
            "Provedores que mantêm o site no ar: hospedagem (Vercel) e banco de dados (Neon).",
            "Meta Platforms, para entrega de mensagens de WhatsApp.",
            "Autoridades, se a lei exigir.",
          ]}
        />
      </Secao>

      <Secao titulo="Cookies">
        <p>
          O site de agendamento não usa cookies de publicidade nem de rastreamento. Existe um cookie de sessão apenas para a equipe, na área de login do
          painel.
        </p>
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        <p>
          Guardamos os agendamentos enquanto forem necessários para o atendimento e para o controle financeiro da barbearia. Você pode pedir a exclusão dos
          seus dados a qualquer momento (veja abaixo).
        </p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>Você pode pedir, a qualquer momento:</p>
        <Lista
          itens={[
            "Confirmar se tratamos seus dados e receber uma cópia.",
            "Corrigir dados incorretos.",
            "Excluir seus dados pessoais.",
            "Saber com quem compartilhamos.",
            "Retirar o consentimento.",
          ]}
        />
      </Secao>

      <Secao id="exclusao" titulo="Como pedir a exclusão dos seus dados">
        <p>
          Envie uma mensagem para o WhatsApp {site.telefone} com o texto &quot;Excluir meus dados&quot; e o nome e o telefone usados no agendamento. Vamos
          apagar ou anonimizar seus dados em até 15 dias e confirmar a você. Agendamentos já concluídos podem ser mantidos de forma anonimizada para o controle
          financeiro.
        </p>
      </Secao>

      <Secao titulo="Segurança">
        <p>
          O site usa conexão criptografada (HTTPS). O painel da equipe exige login com senha, e senhas são guardadas de forma protegida. Cada barbeiro vê
          apenas a própria agenda.
        </p>
      </Secao>

      <Secao titulo="Mudanças">
        <p>Podemos atualizar esta política. A data da última atualização fica no topo da página.</p>
      </Secao>
    </Documento>
  );
}
