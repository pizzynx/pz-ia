# PZ AI Studio

Assistente de programação com interface web local e API da OpenRouter. A chave fica no servidor Node.js e não é enviada ao navegador.

## Requisitos
- Node.js 20 ou superior
- Uma chave ativa da OpenRouter

## Instalação no Windows
1. Instale Node.js: https://nodejs.org/
2. Extraia esta pasta.
3. Abra a pasta no Explorador de Arquivos.
4. Copie `.env.example` e renomeie a cópia para `.env`.
5. Abra `.env` e coloque sua NOVA chave depois de `OPENROUTER_API_KEY=`.
6. Abra o terminal nessa pasta e execute:

   ```bash
   npm install
   npm start
   ```

7. Abra http://localhost:3000 no navegador.
8. Escolha um modelo no seletor. O botão ↻ carrega a lista de modelos disponíveis na sua conta.

## Segurança
- A chave da OpenRouter não deve ser colocada em `public/`, HTML, JavaScript do navegador ou repositórios públicos.
- A chave compartilhada em mensagens deve ser revogada e substituída por uma nova.
- O arquivo `.env` já está listado no `.gitignore`.
- Este projeto é um protótipo de chat programador. Ele gera e explica código, mas ainda não lê nem executa automaticamente projetos do seu computador. Isso requer ferramentas locais adicionais, sandbox e controles de permissão.

## Work: buscar oportunidades e criar sites

A área **Work** consulta a Places API (New) pelo servidor, permite filtrar por atividade, cidade, UF e termos a excluir, e mostra empresas cujo registro do Google não traz `websiteUri`. Isso significa **“sem site listado no Google Maps”**, não prova que a empresa não tenha um site. Text Search retorna até 20 resultados por página; a interface limita a consulta a três páginas (até 60 resultados retornados, quando disponíveis). Não há garantia de cobertura completa.

### Configurar Google Cloud

1. No Google Cloud, escolha um projeto, habilite **Places API (New)** e configure faturamento. Restrinja a chave à API necessária; mantenha-a apenas no servidor.
2. Copie as variáveis de `.env.example` para `.env` sem substituir as demais configurações. Preencha `GOOGLE_MAPS_API_KEY`.
3. Informe URLs **públicas, HTTPS e acessíveis** para os Termos de Uso e a Política de Privacidade do seu app em `GOOGLE_MAPS_TERMS_URL` e `GOOGLE_MAPS_PRIVACY_URL`. Essas páginas devem incluir os avisos e incorporar os Termos de Uso e a Política de Privacidade do Google Maps exigidos pelas políticas da plataforma. O servidor mantém a busca desabilitada se a chave ou essas URLs estiverem ausentes.
4. Reinicie `npm start`. Na área Work, aceite a confirmação de cobrança antes de iniciar uma busca.

A seleção de `websiteUri` exige o SKU **Places API Text Search Enterprise**. Na tabela oficial consultada em 29/10/2026, o SKU indica franquia de 1.000 chamadas por mês e preço inicial de US$35 por 1.000 chamadas pagas na primeira faixa; cada página é uma nova chamada, e preços/limites podem mudar. Confirme a sua cobrança e moeda no Google Cloud Console antes de usar. Links: [documentação Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [campos e SKUs](https://developers.google.com/maps/documentation/places/web-service/data-fields), [preços](https://developers.google.com/maps/billing-and-pricing/pricing), [políticas Places](https://developers.google.com/maps/documentation/places/web-service/policies) e [termos gerais](https://cloud.google.com/maps-platform/terms).

### Privacidade e uso dos dados

Os resultados do Places aparecem com atribuição **Google Maps**, links para conferir os perfis e `Cache-Control: no-store`. Eles ficam apenas na memória da página durante a sessão; não há lista salva, exportação nem envio automático de contato. Termos do Google restringem copiar, armazenar, redistribuir e criar conteúdo com base em conteúdo do Maps. Por isso, o gerador **não recebe dados do resultado selecionado**: confirme as informações com o negócio e preencha o briefing manualmente. O prompt é editável; a IA usa o endpoint OpenRouter já configurado, a prévia é isolada, e o HTML final é baixado localmente — nada é publicado ou hospedado automaticamente.

A implementação da busca é direcionada a prospecção B2B conforme o guia oficial de leads com [Places Insights](https://developers.google.com/maps/architecture/places-insights-sales-leads). O acesso ao Places Insights/BigQuery é uma alternativa de maior escala e requer assinatura, permissões e faturamento separados; não é ativado por esta interface.

O arquivo `.env.example` deve conter apenas marcadores, nunca chaves reais. Se uma chave real foi incluída anteriormente nele ou compartilhada, revogue-a no provedor e gere outra.

## Estados, fila e cancelamento do chat

- Cada operação recebe um identificador e usa a máquina de estados finitos de `public/chat-state.js`; a fila serial fica no mesmo módulo. Os eventos/transições e o resultado ficam associados às mensagens no histórico local.
- O seletor **Enquanto responde** oferece três políticas. **Bloquear novos envios** é o padrão; **Adicionar à fila** aceita outras mensagens e as processa uma por vez, em ordem; **Interromper resposta atual** cancela a operação atual e prioriza o novo pedido antes dos demais itens que ainda aguardam.
- A fila aceita até 20 pedidos pendentes por vez; itens podem ser removidos antes do envio.
- É possível interromper a operação atual, remover uma mensagem ainda na fila ou reenviar manualmente uma mensagem que falhou. Não há repetição automática, para evitar chamadas e cobranças duplicadas.
- O servidor rejeita IDs de operação repetidos durante dez minutos. Essa proteção é em memória e é removida ao reiniciar o servidor; ela não substitui armazenamento transacional distribuído.
- O status mostra apenas eventos observáveis pelo aplicativo: solicitação recebida, espera pelo modelo, chegada dos trechos da resposta, conclusão, falha e cancelamento. A API atual não expõe etapas internas confiáveis de análise, busca, execução de ferramentas nem porcentagem de progresso; por isso essas etapas não são simuladas.
- Se a página for recarregada durante uma solicitação, o trabalho não continua em segundo plano. Mensagens pendentes são marcadas como interrompidas e podem ser reenviadas manualmente. O status da conexão verifica a API local; não garante que o provedor externo esteja disponível.

### Testes

Execute `npm test` para validar transições permitidas e inválidas, conclusão/cancelamento, ordem FIFO, prioridade, remoção e IDs duplicados na fila, além dos filtros Work e da geração do prompt apenas com campos manuais confirmados.

## Se aparecer erro
- `API não configurada`: confirme se `.env` existe e contém `OPENROUTER_API_KEY=...`.
- `401`: a chave pode estar inválida ou revogada.
- `402`: verifique créditos e condições do modelo.
- `429`: limite de requisições; aguarde ou consulte os limites da conta.


## AI Video Studio (Google Flow)
A aba **AI Video Studio** prepara prompts para texto-para-vídeo e abre o Google Flow em uma nova guia. Ela não chama uma API de vídeo nem gera/baixa vídeos diretamente dentro deste projeto. Faça login no Flow com a conta que possui o Google AI Pro, confira os créditos disponíveis e cole o prompt preparado pela ferramenta. A assinatura do Flow não deve ser tratada como uma chave de API para integração externa.


## Geração de vídeos com Google AI Studio

A aba **AI Video Studio** usa a API oficial Gemini Interactions com o modelo `gemini-omni-1.1-flash` para gerar um vídeo e disponibilizar um player e download MP4 dentro da interface.

1. Acesse [Google AI Studio API keys](https://aistudio.google.com/apikey) e crie uma chave de API.
2. Copie `.env.example` para `.env` (se ainda não existir) e preencha `GOOGLE_AI_STUDIO_API_KEY`. Mantenha a chave somente no servidor; não a coloque no frontend nem compartilhe o `.env`.
3. Confirme o faturamento e os preços da API antes de gerar vídeos: o modelo de vídeo não tem nível gratuito na API e a cobrança é separada da assinatura Google AI Pro. Confira a página oficial de preços: https://ai.google.dev/gemini-api/docs/pricing
4. Execute `npm install` e `npm start`, abra `http://localhost:3000`, selecione **AI Video Studio**, escreva a ideia e clique em **Gerar vídeo com Gemini**.

Os vídeos gerados ficam em `public/generated`. A geração pode demorar alguns minutos e requer conexão com a internet. O modelo usado é `gemini-omni-1.1-flash`, conforme a documentação oficial de geração de vídeo: https://ai.google.dev/gemini-api/docs/omni
