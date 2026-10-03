-- Pix automático (Mercado Pago): registro de cada pagamento criado e do que aconteceu com ele.
CREATE TABLE pagamentos_pix (
  mp_id          TEXT PRIMARY KEY,                       -- id do pagamento no Mercado Pago
  agendamento_id INT  NOT NULL REFERENCES agendamentos (id),
  valor          NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  -- Código que o navegador do cliente usa para perguntar "já pagou?". Aleatório: ninguém adivinha o de outro cliente.
  consulta_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  situacao       TEXT NOT NULL DEFAULT 'PENDENTE'
                 CHECK (situacao IN ('PENDENTE', 'APROVADO', 'CANCELADO', 'REEMBOLSO_PENDENTE', 'DEVOLVIDO')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  aprovado_em    TIMESTAMPTZ,
  CONSTRAINT pagamentos_pix_token_uk UNIQUE (consulta_token)
);
CREATE INDEX pagamentos_pix_agendamento_idx ON pagamentos_pix (agendamento_id);
-- A tela do dono lista só os que precisam de devolução.
CREATE INDEX pagamentos_pix_devolver_idx ON pagamentos_pix (situacao) WHERE situacao = 'REEMBOLSO_PENDENTE';
