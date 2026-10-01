-- Dados de desenvolvimento. APAGA tudo e recria. Nunca rode em produção.
TRUNCATE agendamentos, horarios_funcionamento, clientes, servicos, barbeiros
  RESTART IDENTITY CASCADE;

INSERT INTO barbeiros (nome) VALUES ('João'), ('Pedro');
INSERT INTO barbeiros (nome, status) VALUES ('Carlos', 'AUSENTE');

INSERT INTO servicos (nome, duracao_min, preco) VALUES
  ('Corte masculino', 30, 40.00),
  ('Corte feminino',  45, 70.00),
  ('Pintura',         60, 120.00),
  ('Corte e barba',   60, 65.00);

INSERT INTO clientes (nome, telefone) VALUES
  ('Ana', '5511900000001'),
  ('Bia', '5511900000002');

-- Expediente de segunda a sábado, dos próximos 60 dias, das 09:00 às 18:00.
INSERT INTO horarios_funcionamento (barbeiro_id, data, hora_inicio, hora_fim)
SELECT b.id, d::date, '09:00', '18:00'
FROM barbeiros b
CROSS JOIN generate_series(current_date, current_date + 60, interval '1 day') AS d
WHERE extract(dow FROM d) <> 0;