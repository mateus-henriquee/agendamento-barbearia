import type { Metadata } from "next";
import { Documento, Lista, Secao } from "@/components/documento";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Termos de Uso — ${site.nome}`,
  description: `Regras para agendar horário pelo site da ${site.nome}.`,
};

export default function Termos() {
  return (
    <Documento titulo="Termos de Uso" atualizado="1 de outubro de 2026">
      <p>
        Ao agendar um horário no site da <strong>{site.nome}</strong>, você concorda com as regras abaixo.
      </p>

      <Secao titulo="Agendamento">
        <Lista
          itens={[
            "Você escolhe serviço, barbeiro, dia e horário. Só mostramos horários livres.",
            "Informe nome e telefone corretos. Usamos o telefone para falar com você sobre o horário.",
            "Se o dia estiver cheio, você pode entrar na fila de espera. Entrar na fila não garante o horário.",
          ]}
        />
      </Secao>

      <Secao titulo="Pagamento">
        <Lista
          itens={[
            "Você pode pagar na barbearia ou por Pix.",
            "No Pix, o horário fica reservado por 20 minutos. Se o pagamento não for confirmado nesse prazo, a reserva é cancelada e o horário volta a ficar livre.",
            "A confirmação do Pix é feita pela equipe da barbearia.",
          ]}
        />
      </Secao>

      <Secao titulo="Atrasos e faltas">
        <p>Se não puder comparecer, avise a barbearia pelo WhatsApp {site.telefone} o quanto antes, para liberar o horário a outro cliente.</p>
      </Secao>

      <Secao titulo="Dados pessoais">
        <p>
          O tratamento dos seus dados está descrito na <a className="underline underline-offset-4" href="/privacidade">Política de Privacidade</a>.
        </p>
      </Secao>

      <Secao titulo="Contato">
        <p>
          {site.nome} — {site.endereco} — WhatsApp {site.telefone}. Horário: {site.horario}.
        </p>
      </Secao>
    </Documento>
  );
}
