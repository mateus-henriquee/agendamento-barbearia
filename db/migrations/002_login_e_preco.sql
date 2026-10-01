-- Etapa 8: login de colaboradores + preço cobrado em cada agendamento.

-- 1) Preço "congelado" no momento do agendamento.
--    Se o preço do serviço mudar depois, o faturamento antigo não muda.
ALTER TABLE agendamentos ADD COLUMN preco_cobrado NUMERIC(10,2);

UPDATE agendamentos a
   SET preco_cobrado = s.preco
  FROM servicos s
 WHERE s.id = a.servico_id;

ALTER TABLE agendamentos ALTER COLUMN preco_cobrado SET NOT NULL;
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_preco_cobrado_ck CHECK (preco_cobrado >= 0);

-- 2) Quem pode entrar no painel: barbeiros e dono.
CREATE TABLE usuarios (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,
  papel       TEXT NOT NULL CHECK (papel IN ('BARBEIRO', 'DONO')),
  barbeiro_id INTEGER REFERENCES barbeiros (id),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_email_uk UNIQUE (email),
  CONSTRAINT usuarios_barbeiro_uk UNIQUE (barbeiro_id),
  -- e-mail sempre minúsculo: "Joao@x.com" e "joao@x.com" não viram duas contas
  CONSTRAINT usuarios_email_minusculo_ck CHECK (email = lower(email)),
  -- usuário BARBEIRO precisa estar ligado a um barbeiro
  CONSTRAINT usuarios_barbeiro_ck CHECK (papel <> 'BARBEIRO' OR barbeiro_id IS NOT NULL)
);

-- 3) Sessões de login. Guardamos o HASH do token, nunca o token em si.
CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em  TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessoes_usuario_idx ON sessoes (usuario_id);