-- Etapa 10: fila de espera. O cliente entra na fila de um barbeiro em um dia sem horário livre.
CREATE TABLE fila_espera (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id  INT  NOT NULL REFERENCES clientes (id),
  barbeiro_id INT  NOT NULL REFERENCES barbeiros (id),
  servico_id  INT  NOT NULL REFERENCES servicos (id),
  data        DATE NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'AGUARDANDO'
              CHECK (status IN ('AGUARDANDO', 'AVISADO', 'REMOVIDO')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  avisado_em  TIMESTAMPTZ
);

-- Ninguém entra duas vezes na mesma fila (barbeiro + dia) enquanto estiver aguardando.
CREATE UNIQUE INDEX fila_espera_unica_idx
  ON fila_espera (cliente_id, barbeiro_id, data) WHERE status = 'AGUARDANDO';
CREATE INDEX fila_espera_dia_idx ON fila_espera (barbeiro_id, data);
