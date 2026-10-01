-- Proteção contra tentativas em massa de senha: cada login errado vira uma linha aqui.
CREATE TABLE tentativas_login (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email     TEXT        NOT NULL,   -- sempre minúsculo; vale também para e-mails que não existem
  ip        TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tentativas_login_email_idx ON tentativas_login (email, criado_em);
CREATE INDEX tentativas_login_ip_idx ON tentativas_login (ip, criado_em);
