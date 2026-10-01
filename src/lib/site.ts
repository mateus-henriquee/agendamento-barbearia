export const site = {
  nome: "Barbearia",
  endereco: "Rua Augusta, 1200 — Consolação, São Paulo - SP",
  telefone: "(11) 99999-0000",
  instagram: "@barbearia",
  horario: "Segunda a sábado, das 9h às 18h",
  whatsapp: "5511999990000", // só números: 55 + DDD + número
  redes: {
  instagram: "https://instagram.com",
  facebook: "https://facebook.com",
  tiktok: "https://tiktok.com",
  youtube: "https://youtube.com",
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
  { nome: "Mateus", foto: "/img/mateus.jpg", anosExperiencia: 8, nota: 4.9, avaliacoes: 214, especialidade: "Degradê e barba" },
  { nome: "Henrique", foto: "/img/henrique.jpg", anosExperiencia: 5, nota: 4.8, avaliacoes: 167, especialidade: "Corte clássico" },
  { nome: "Leccese", foto: "/img/leccese.jpg", anosExperiencia: 12, nota: 5.0, avaliacoes: 301, especialidade: "Pintura e química" },
];
