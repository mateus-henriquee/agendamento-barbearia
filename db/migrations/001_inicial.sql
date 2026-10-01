CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE barbeiros (
  id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome   VARCHAR(100) NOT NULL,
  status VARCHAR(10)  NOT NULL DEFAULT 'ATIVO'
         CHECK (status IN ('ATIVO', 'AUSENTE'))
);

CREATE TABLE servicos (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        VARCHAR(100)  NOT NULL,
  duracao_min INT           NOT NULL CHECK (duracao_min > 0),
  preco       NUMERIC(10,2) NOT NULL CHECK (preco >= 0)
);

CREATE TABLE clientes (
  id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome     VARCHAR(100) NOT NULL,
  telefone VARCHAR(20)  NOT NULL,
  CONSTRAINT clientes_telefone_uk UNIQUE (telefone)
);

CREATE TABLE horarios_funcionamento (
  barbeiro_id INT  NOT NULL REFERENCES barbeiros (id),
  data        DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim    TIME NOT NULL,
  PRIMARY KEY (barbeiro_id, data),
  CHECK (hora_fim > hora_inicio)
);

CREATE TABLE agendamentos (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barbeiro_id INT  NOT NULL REFERENCES barbeiros (id),
  servico_id  INT  NOT NULL REFERENCES servicos (id),
  cliente_id  INT  NOT NULL REFERENCES clientes (id),
  data        DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim    TIME NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO'
              CHECK (status IN ('CONFIRMADO', 'CANCELADO', 'FALTOU', 'CONCLUIDO')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio),

  CONSTRAINT agendamentos_sem_conflito EXCLUDE USING gist (
    barbeiro_id WITH =,
    tsrange(data + hora_inicio, data + hora_fim, '[)') WITH &&
  ) WHERE (status IN ('CONFIRMADO', 'CONCLUIDO'))
);

CREATE INDEX agendamentos_barbeiro_data_idx ON agendamentos (barbeiro_id, data);