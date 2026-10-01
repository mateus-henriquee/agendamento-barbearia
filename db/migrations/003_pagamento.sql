-- Etapa 9: como o cliente vai pagar e se já pagou.
ALTER TABLE agendamentos
  ADD COLUMN forma_pagamento TEXT NOT NULL DEFAULT 'NA_BARBEARIA',
  ADD COLUMN pago_em TIMESTAMPTZ; -- NULL = ainda não pago

ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_forma_pagamento_ck
  CHECK (forma_pagamento IN ('PIX', 'NA_BARBEARIA'));

-- Atendimentos antigos já concluídos foram pagos na barbearia.
UPDATE agendamentos SET pago_em = criado_em WHERE status = 'CONCLUIDO';
