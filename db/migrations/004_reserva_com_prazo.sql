-- Etapa 9c: reserva com prazo para quem escolhe pagar com Pix.
-- AGUARDANDO_PAGAMENTO segura o horário até expira_em. Pagou: vira CONFIRMADO. Não pagou: vira CANCELADO.
ALTER TABLE agendamentos DROP CONSTRAINT agendamentos_status_check;
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('AGUARDANDO_PAGAMENTO', 'CONFIRMADO', 'CANCELADO', 'FALTOU', 'CONCLUIDO'));

ALTER TABLE agendamentos ADD COLUMN expira_em TIMESTAMPTZ;

-- Toda reserva aguardando pagamento precisa ter prazo.
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_prazo_ck
  CHECK (status <> 'AGUARDANDO_PAGAMENTO' OR expira_em IS NOT NULL);

-- A regra anti-conflito agora também protege o horário que está aguardando pagamento.
ALTER TABLE agendamentos DROP CONSTRAINT agendamentos_sem_conflito;
ALTER TABLE agendamentos
  ADD CONSTRAINT agendamentos_sem_conflito EXCLUDE USING gist (
    barbeiro_id WITH =,
    tsrange(data + hora_inicio, data + hora_fim, '[)') WITH &&
  ) WHERE (status IN ('AGUARDANDO_PAGAMENTO', 'CONFIRMADO', 'CONCLUIDO'));
