# WhatsApp: bot de agenda e avisos

O que faz:
- **Bot:** o barbeiro (ou o dono) manda uma mensagem para o número da barbearia e recebe a lista dos próximos dias. Toca no dia e vê: horário, cliente, serviço, valor e **Pago: s/n**. Também entende "hoje", "amanhã", "sexta", "05/10".
  - Barbeiro vê só a própria agenda. Dono vê todos.
  - Número que não está cadastrado é ignorado.
- **Aviso automático:** quando um cliente agenda pelo site, o barbeiro do horário e o dono recebem uma mensagem na hora.

Sem as variáveis abaixo, nada disso liga e o resto do sistema funciona normal.

## 1. Conta na Meta (uma vez)

1. Entre em <https://developers.facebook.com> e crie um app do tipo **Business**.
2. Adicione o produto **WhatsApp**. Ele cria uma conta WhatsApp Business de teste e um número de teste.
3. Em **WhatsApp → Configuração da API** anote:
   - **ID do número de telefone** → `WHATSAPP_PHONE_ID`
   - **Token de acesso**. O temporário vale 24h. Para produção crie um **token permanente** (Configurações do negócio → Usuários do sistema → gerar token com a permissão `whatsapp_business_messaging`) → `WHATSAPP_TOKEN`
4. Em **Configurações do app → Básico** copie a **Chave secreta do app** → `WHATSAPP_APP_SECRET`
5. Invente uma frase secreta qualquer → `WHATSAPP_VERIFY_TOKEN`

No número de teste, a Meta só deixa falar com até 5 telefones que você cadastra em "Para". Para usar com o número real da barbearia, é preciso verificar o negócio e registrar o número (a Meta guia isso no mesmo painel).

## 2. Variáveis na Vercel

Vercel → projeto → Settings → Environment Variables:

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token de acesso |
| `WHATSAPP_PHONE_ID` | ID do número |
| `WHATSAPP_APP_SECRET` | chave secreta do app |
| `WHATSAPP_VERIFY_TOKEN` | a frase que você inventou |
| `WHATSAPP_TEMPLATE_NOVO` | nome do modelo do passo 4 (opcional, recomendado) |

Depois: Deployments → Redeploy.

## 3. Webhook

Meta → WhatsApp → **Configuração** → Webhook → Editar:
- **URL de retorno:** `https://SEU-SITE.vercel.app/api/whatsapp/webhook`
- **Token de verificação:** o mesmo `WHATSAPP_VERIFY_TOKEN`
- Clique em verificar e salvar. Depois assine o campo **messages**.

## 4. Modelo de mensagem (para os avisos)

A Meta só deixa a empresa iniciar conversa com um **modelo aprovado**. Se a pessoa falou com o bot nas últimas 24h, texto livre passa. Fora disso, só modelo.

Meta → WhatsApp → **Modelos de mensagem** → Criar:
- Categoria: **Utilidade**. Idioma: **Português (BR)**. Nome: `novo_agendamento`
- Corpo:

```
Novo agendamento: {{1}}, {{2}} com {{3}}, {{4}}. Pagamento: {{5}}.
```

Exemplos para a aprovação: `Ana Souza`, `Corte (R$ 40,00)`, `João`, `seg 05/10 às 09:00`, `na barbearia`.

Aprovado, coloque `WHATSAPP_TEMPLATE_NOVO=novo_agendamento` na Vercel. A Meta cobra por conversa iniciada pela empresa; confira a tabela de preços atual.

## 5. Cadastrar os números

Barbeiro novo: na tela de Administração, preencha o campo **WhatsApp** junto com o login.

Barbeiro já existente ou dono (no seu computador, na pasta do projeto, com `.env` apontando para o banco):

```bash
npm run telefone -- email@exemplo.com "11 99999-9999"
```

Para tirar: `npm run telefone -- email@exemplo.com limpar`

## Segurança

- Todo POST do webhook precisa da assinatura da Meta (HMAC-SHA256 com a chave secreta). Sem ela: 403.
- Só números cadastrados e ativos recebem resposta. Desativar o usuário corta o acesso.
- Falha no WhatsApp nunca derruba o agendamento do cliente.
- A Meta reenvia mensagens quando demora: cada mensagem é respondida uma vez só.
