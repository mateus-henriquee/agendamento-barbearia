import { WhatsApp } from "@/components/icones";
import { site } from "@/lib/site";

const mensagem = encodeURIComponent("Olá! Gostaria de agendar um horário.");

/** Botão flutuante no canto da tela. Abre a conversa no WhatsApp. */
export default function BotaoWhatsApp() {
  return (
    <a
      href={`https://wa.me/${site.whatsapp}?text=${mensagem}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white shadow-lg shadow-black/50 transition hover:scale-105 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
    >
      <WhatsApp />
    </a>
  );
}