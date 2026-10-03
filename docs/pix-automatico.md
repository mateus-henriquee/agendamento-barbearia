# Pix automático (Mercado Pago)

O cliente paga, o sistema confirma sozinho. Sem ação do barbeiro.

## Como funciona
1. Cliente escolhe "Pagar agora (Pix)".
2. O site pede um Pix único ao Mercado Pago.
3. Cliente paga. O Mercado Pago avisa o site (webhook).
4. O site confere o pagamento na API e confirma o horário.
5. A tela do cliente muda para "Pagamento confirmado ✓".

## Configurar
1. Crie conta em mercadopago.com.br (conta vendedor, verificada).
2. Painel de desenvolvedores → Suas integrações → Criar aplicação (Pagamentos online, Checkout API).
3. Credenciais de **produção** → copie o **Access Token**.
4. Webhooks → Modo produção → URL: `https://SEU-SITE/api/pagamentos/mercadopago/webhook` → evento **Pagamentos**.
5. Copie a **chave secreta** do webhook.
6. Vercel → Settings → Environment Variables:
   - `MERCADOPAGO_ACCESS_TOKEN`
   - `MERCADOPAGO_WEBHOOK_SECRET`
   - `APP_URL` = endereço do site
   - **Mantenha** `PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE` (reserva e exibe a opção Pix).
7. Redeploy.
8. Teste com um Pix pequeno de verdade.

## Migração
Rode a `009_pix_automatico.sql` no Neon (URL direta) **antes** do push.

## Casos especiais
- **Mercado Pago fora do ar:** usa o Pix manual (barbeiro confirma). Sem Pix manual, o horário é liberado e o cliente vê erro.
- **Pagou depois dos 20 min:** se o horário seguir livre, reativa. Se outra pessoa pegou, aparece o aviso "pagamentos para devolver" no painel do dono.
- **Devolver:** no painel do Mercado Pago, devolva o valor. No painel do sistema, clique "Já devolvi".
- **Valor diferente do preço:** não confirma; vai para devolução.
- O Mercado Pago exige Pix válido por no mínimo 30 min; a reserva dura 20.

## Taxas
O Mercado Pago cobra taxa por Pix recebido. Confira o valor atual no site deles.
