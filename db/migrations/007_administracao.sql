-- Etapa 14: o dono administra barbeiros e serviços, e define quem faz o quê.

-- Serviço antigo some do site sem ser apagado (o histórico de agendamentos continua válido).
ALTER TABLE servicos ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE barbeiro_servicos (
  barbeiro_id INT NOT NULL REFERENCES barbeiros (id) ON DELETE CASCADE,
  servico_id  INT NOT NULL REFERENCES servicos (id) ON DELETE CASCADE,
  PRIMARY KEY (barbeiro_id, servico_id)
);

-- Quem já existe passa a fazer todos os serviços (o comportamento de antes).
INSERT INTO barbeiro_servicos (barbeiro_id, servico_id)
SELECT b.id, s.id FROM barbeiros b CROSS JOIN servicos s;

-- Barbeiro ou serviço novo começa ligado a tudo. O dono desmarca o que não se aplica.
CREATE FUNCTION liga_barbeiro_a_todos_servicos() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO barbeiro_servicos (barbeiro_id, servico_id) SELECT NEW.id, id FROM servicos
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER barbeiros_servicos_padrao AFTER INSERT ON barbeiros
  FOR EACH ROW EXECUTE FUNCTION liga_barbeiro_a_todos_servicos();

CREATE FUNCTION liga_servico_a_todos_barbeiros() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO barbeiro_servicos (barbeiro_id, servico_id) SELECT id, NEW.id FROM barbeiros
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER servicos_barbeiros_padrao AFTER INSERT ON servicos
  FOR EACH ROW EXECUTE FUNCTION liga_servico_a_todos_barbeiros();
