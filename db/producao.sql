-- Dados REAIS da barbearia, para o primeiro deploy. EDITE antes de rodar e rode UMA vez.
-- Não apaga nada. (O seed.sql é só para desenvolvimento e apaga tudo.)

-- 1) Barbeiros. A ordem importa: o primeiro é o id 1, o segundo é o id 2...
INSERT INTO barbeiros (nome) VALUES
  ('TROQUE: nome do barbeiro 1'),
  ('TROQUE: nome do barbeiro 2');

-- 2) Serviços: nome, duração em minutos e preço em reais.
INSERT INTO servicos (nome, duracao_min, preco) VALUES
  ('Corte masculino', 30, 40.00),
  ('Barba',           30, 30.00),
  ('Corte e barba',   60, 65.00);

-- 3) Depois, no terminal:  npm run expediente   (cria os horários dos próximos 60 dias)
