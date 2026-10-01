-- Etapa 13: WhatsApp. Quem recebe avisos e consulta a agenda pelo bot.

-- Telefone no formato internacional, só dígitos (ex.: 5511999999999).
ALTER TABLE usuarios ADD COLUMN telefone TEXT;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_telefone_ck CHECK (telefone IS NULL OR telefone ~ '^[0-9]{12,15}$');
-- Um número pertence a um só usuário: é assim que o bot sabe quem está falando.
CREATE UNIQUE INDEX usuarios_telefone_uk ON usuarios (telefone) WHERE telefone IS NOT NULL;

-- A Meta repete o envio do webhook se demorarmos. Guardamos o id de cada mensagem para não responder duas vezes.
CREATE TABLE whatsapp_recebidas (
  wamid       TEXT PRIMARY KEY,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
