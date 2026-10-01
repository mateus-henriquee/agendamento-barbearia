export const site = {
  nome: "Espiral",
  endereco: "Rua Augusta, 1200 — Consolação, São Paulo - SP",
  telefone: "(11) 99999-0000",
  instagram: "@barbearia.espiral",
  horario: "Segunda a sábado, das 9h às 18h",
  whatsapp: "5511999990000", // só números: 55 + DDD + número
  redes: {
  instagram: "https://instagram.com/barbearia.espiral",
  facebook: "https://facebook.com/barbearia.espiral",
  tiktok: "https://tiktok.com/@barbearia.espiral",
  youtube: "https://youtube.com/@barbearia.espiral",
  },
};

export type Profissional = {
  nome: string;
  foto: string;
  anosExperiencia: number;
  nota: number;
  avaliacoes: number;
  especialidade: string;
};

// Dados de exemplo. Troque pelas fotos e informações reais.
export const equipe: Profissional[] = [
  { nome: "João", foto: "/img/joao.jpg", anosExperiencia: 8, nota: 4.9, avaliacoes: 214, especialidade: "Degradê e barba" },
  { nome: "Pedro", foto: "/img/pedro.jpg", anosExperiencia: 5, nota: 4.8, avaliacoes: 167, especialidade: "Corte clássico" },
  { nome: "Carlos", foto: "/img/carlos.jpg", anosExperiencia: 12, nota: 5.0, avaliacoes: 301, especialidade: "Pintura e química" },
];
