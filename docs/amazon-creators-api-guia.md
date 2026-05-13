# Amazon Creators API — Guia de Integração para o ComparaSuple

> Documento técnico de referência para integrar o comparador de suplementos com a **Amazon Creators API** (substituta da PA-API 5.0 a partir de 15/mai/2026).
> Versão: 1.0 — Maio/2026
> Veja `legacy-pa-api-v5.md` para a versão anterior do guia, mantida apenas como referência histórica.

---

## 1. Por que esse guia (e por que a PA-API v5 está morrendo)

A **Product Advertising API 5.0** (sobre a qual a primeira versão deste guia foi escrita) foi descontinuada pela Amazon. A timeline é:

| Data | Evento |
|---|---|
| 30/abr/2026 | Deprecação oficial. Documentação parou de ser atualizada. |
| **15/mai/2026** | **Endpoint da PA-API v5 para de aceitar requisições.** Erros de auth a partir desse dia. |

A substituta é a **Amazon Creators API**, com mudanças não-triviais:

| Camada | PA-API v5 | Creators API |
|---|---|---|
| Auth | AWS Signature v4 (assinatura criptográfica) | OAuth 2.0 client-credentials (bearer token) |
| Credenciais | Access Key ID + Secret Access Key | Credential ID + Credential Secret |
| Casing | `PascalCase` (`SearchItems`, `ItemInfo`) | `lowerCamelCase` (`searchItems`, `itemInfo`) |
| Host | `webservices.amazon.{tld}` (regional) | `creatorsapi.amazon/catalog/v1/` (global, com header de marketplace) |
| Marketplace BR | Embutido no host | Header `x-marketplace` |
| Pré-requisito | 3 vendas em 180 dias | **10 vendas qualificadas em 30 dias** (mais alto) |
| SDKs `paapi5-*` | ✓ funcionam até 15/mai | ✗ não funcionam (auth diferente) |
| Brasil | Suportado em endpoint próprio | Suportado dentro da região NA |

> **Implicação para o ComparaSuple:** todo o capítulo de implementação Amazon do business plan precisa ser refeito com base neste guia. As regras de TOS sobre comparadores, cache 24h, price tracking proibido, disclosure etc. **continuam valendo** — o que muda é só a camada técnica.

---

## 2. Pré-requisitos

### 2.1. Conta de Associado Amazon Brasil aprovada

- Cadastro em https://associados.amazon.com.br/
- Site `comparasuple.com.br` (ou domínio escolhido) na lista de fontes
- Aprovação inicial concedida

### 2.2. **A barreira das 10 vendas em 30 dias** ⚠️

A Creators API só é liberada para contas que tenham **gerado pelo menos 10 vendas qualificadas nos últimos 30 dias**. Esse requisito é muito mais alto que o anterior (3 vendas em 180 dias na PA-API v5) e muda a estratégia de bootstrap do projeto:

- **Conta nova / projeto pré-tração:** sem chance de acessar a Creators API logo de cara. As 10 vendas/30d significam tráfego e conversão estabelecidos.
- **Caminho recomendado:** começar a integração pelo **Mercado Livre API** (sem essa barreira) e por links de afiliado Amazon "manuais" (sem API, só `?tag=comparasuple-20`) para gerar as primeiras vendas. Quando atingir as 10 vendas/30d, aplica para a Creators API e migra a fonte de dados Amazon.
- **Manutenção:** a quota é re-avaliada continuamente — se cair abaixo de 10 vendas/30d, o acesso é suspenso.

### 2.3. Aplicação para a Creators API

Caminho: **Associates Central → Tools → Creators API → Apply**.

Apenas o **owner** primário da conta pode aplicar. Aprovação leva alguns dias úteis.

### 2.4. Marketplace Brasil

| Item | Valor |
|---|---|
| Marketplace ID (header `x-marketplace`) | `www.amazon.com.br` *(confirmar no painel após registro — Amazon usa esse formato em outras APIs)* |
| Região da credencial | NA (US/CA/MX/BR estão na mesma região) |
| Idioma das respostas | `pt_BR` |
| Moeda | BRL |

> **A confirmar no registro:** o valor exato do `x-marketplace` para o BR pode aparecer como `www.amazon.com.br`, `BR`, ou um Marketplace ID alfanumérico. O painel de credenciais mostra o valor canônico depois da aprovação. Documente conforme aparecer.

---

## 3. Credenciais — versões 2.x e 3.x

A Creators API expõe **duas gerações de credenciais**, cada uma com seu próprio fluxo OAuth e seu próprio endpoint de token. Você escolhe uma no momento do registro.

### 3.1. Visão comparativa

| Aspecto | v2.x (Cognito) | v3.x (Login with Amazon) |
|---|---|---|
| Identificadores de versão | v2.1 (NA), v2.2 (EU), v2.3 (FE) | v3.1 (NA), v3.2 (EU), v3.3 (FE) |
| Backend de auth | AWS Cognito | LWA (Login with Amazon) |
| Endpoint de token NA | `https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token` | `https://api.amazon.com/auth/o2/token` |
| Endpoint de token EU | `https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token` | `https://api.amazon.co.uk/auth/o2/token` |
| Endpoint de token FE | `https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token` | `https://api.amazon.co.jp/auth/o2/token` |
| Scope | `creatorsapi/default` | `creatorsapi::default` (dois pontos duplos) |
| Como mandar credenciais | Basic auth (`Authorization: Basic base64(id:secret)`) | Body `client_id` / `client_secret` |
| Header extra na chamada | `Authorization: Bearer <token>, Version <ver>` | `Authorization: Bearer <token>` (sem Version) |

### 3.2. Qual escolher

- **v3.x (LWA)** é a recomendação prática — usa o stack OAuth padrão da Amazon (mesmo do SP-API), mais bibliotecas existem para LWA, e é o caminho que a Amazon parece tratar como "moderno". Para o BR, use v3.1 (região NA).
- **v2.x (Cognito)** funciona, mas tem o cabeçalho extra `Version` e usa scope com formato diferente. Várias bibliotecas comunitárias suportam v2.x por questão histórica.

> O exemplo Python no fim deste guia usa **v3.x**. Se você optou pela v2.x no painel, o ajuste é trocar o token endpoint e adicionar o `, Version 3.1`/`, Version 2.1`/etc. no header `Authorization`.

---

## 4. Autenticação — fluxo OAuth 2.0 client_credentials

A ideia é: cada chamada à API precisa ir com um **bearer token** no header. Esse token vem de um endpoint separado de auth, dura ~1 hora, e você **deve cachear**.

### 4.1. Obter um token (v3.x, região NA)

**Request:**

```http
POST /auth/o2/token HTTP/1.1
Host: api.amazon.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={CREDENTIAL_ID}&client_secret={CREDENTIAL_SECRET}&scope=creatorsapi::default
```

**Response (200 OK):**

```json
{
  "access_token": "Atza|IwEBI…",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### 4.2. Obter um token (v2.x, região NA — alternativa)

```http
POST /oauth2/token HTTP/1.1
Host: creatorsapi.auth.us-east-1.amazoncognito.com
Authorization: Basic {base64(CREDENTIAL_ID:CREDENTIAL_SECRET)}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=creatorsapi/default
```

A resposta tem o mesmo formato.

### 4.3. Cachear o token

- TTL ~1h. Refresh com margem (renovar com 5min de folga).
- **Em memória** já é suficiente para um único processo. Em produção multi-worker, use Redis ou similar para evitar que cada worker peça um token.
- **Não logue o token** em nenhum lugar (é equivalente a uma senha enquanto válido).

### 4.4. Usar o token nas chamadas à API

```http
POST /catalog/v1/searchItems HTTP/1.1
Host: creatorsapi.amazon
Content-Type: application/json
Authorization: Bearer Atza|IwEBI…
x-marketplace: www.amazon.com.br

{ ... corpo JSON ... }
```

> Para v2.x adicione o sufixo da versão: `Authorization: Bearer Atza|… , Version 2.1`.

---

## 5. Endpoint base e operações

Endpoint global único:

```
https://creatorsapi.amazon/catalog/v1/
```

> O TLD é `.amazon` mesmo (não é typo nem dev domain — a Amazon controla o TLD `.amazon` e usa para serviços internos modernos).

Operações suportadas (paridade com a PA-API v5, com renomeação para `lowerCamelCase`):

| Operação | Método | Path | Para que serve |
|---|---|---|---|
| `searchItems` | POST | `/catalog/v1/searchItems` | Busca por keyword/categoria — descobrir SKUs |
| `getItems` | POST | `/catalog/v1/getItems` | Detalhes de até 10 ASINs por chamada |
| `getVariations` | POST | `/catalog/v1/getVariations` | Variações de um item-pai (sabores, gramaturas) |
| `getBrowseNodes` | POST | `/catalog/v1/getBrowseNodes` | Taxonomia de categorias (a confirmar — operação carregada da PA-API v5; documente após primeiro uso) |

Todos os endpoints aceitam JSON no body, todos retornam JSON.

### 5.1. `searchItems` — payload

```json
{
  "keywords": "whey protein isolado",
  "searchIndex": "HealthPersonalCare",
  "itemCount": 10,
  "itemPage": 1,
  "partnerTag": "comparasuple-20",
  "partnerType": "Associates",
  "resources": [
    "itemInfo.title",
    "itemInfo.byLineInfo",
    "itemInfo.features",
    "itemInfo.productInfo",
    "images.primary.large",
    "images.variants.large",
    "offers.listings.price",
    "offers.listings.availability.message",
    "offers.listings.merchantInfo",
    "offers.listings.savingBasis",
    "offers.summaries.lowestPrice",
    "browseNodeInfo.browseNodes"
  ]
}
```

**Limites:** `itemCount` máximo 10, `itemPage` máximo 10 → 100 itens por keyword no total.

**Filtros opcionais úteis:**
- `browseNodeId` — escopa em uma categoria específica.
- `brand` — filtra por marca.
- `minPrice` / `maxPrice` — em centavos (R$ 100,00 → `10000`).
- `condition` — `New` (default), `Used`, `Refurbished`, `Collectible`.
- `sortBy` — `Relevance` (default), `Price:LowToHigh`, `Price:HighToLow`, `AvgCustomerReviews`, `NewestArrivals`.

### 5.2. `getItems` — payload

```json
{
  "itemIds": ["B07ABC1234", "B08DEF5678", "B09GHI9012"],
  "itemIdType": "ASIN",
  "partnerTag": "comparasuple-20",
  "partnerType": "Associates",
  "resources": [
    "itemInfo.title",
    "itemInfo.byLineInfo",
    "itemInfo.features",
    "itemInfo.productInfo",
    "images.primary.large",
    "offers.listings.price",
    "offers.listings.availability.message",
    "offers.listings.savingBasis",
    "offers.summaries.lowestPrice",
    "offers.summaries.offerCount",
    "customerReviews.count",
    "customerReviews.starRating"
  ]
}
```

**Limite:** até **10 ASINs por chamada** (use sempre o máximo — economiza quota).

> ⚠️ `customerReviews.count` e `customerReviews.starRating` continuam retornando apenas a **URL** do widget de reviews, não o conteúdo. Para mostrar resenha textual no comparador, precisa de outra fonte.

### 5.3. `getVariations` — payload

```json
{
  "asin": "B07PARENT0",
  "partnerTag": "comparasuple-20",
  "partnerType": "Associates",
  "resources": [
    "itemInfo.title",
    "itemInfo.productInfo",
    "offers.listings.price",
    "variationSummary.priceRange.lowestPrice"
  ]
}
```

Retorna a lista de ASINs-filhos com diferenças (sabor, peso). Para o comparador de suplementos, **trate cada variação como SKU independente**.

---

## 6. Resources — controle granular

Como na PA-API v5, você pede explicitamente os campos que quer no array `resources`. Os nomes são os mesmos, **só mudou o casing**:

| Resource (Creators API, camelCase) | O que traz | Crítico p/ MVP? |
|---|---|---|
| `itemInfo.title` | Título completo | ✓ |
| `itemInfo.byLineInfo` | Marca, fabricante | ✓ |
| `itemInfo.features` | Bullets de descrição (lista) — onde geralmente está a tabela nutricional | ✓ |
| `itemInfo.productInfo` | Peso, dimensões, cor, tamanho | ✓ — pra extrair gramatura |
| `itemInfo.classifications` | Categoria, binding | ✓ |
| `itemInfo.contentInfo` | Páginas, idioma, formato | médio |
| `itemInfo.technicalInfo` | Specs técnicas | médio |
| `images.primary.large` | URL da imagem principal | ✓ |
| `images.variants.large` | URLs das imagens secundárias | ✓ |
| `offers.listings.price` | Preço atual + moeda | ✓ |
| `offers.listings.savingBasis` | Preço "de" (riscado) | ✓ |
| `offers.listings.availability.message` | "Em estoque", etc. | ✓ |
| `offers.listings.merchantInfo` | Quem vende (Amazon, terceiro) | ✓ |
| `offers.listings.deliveryInfo.isPrimeEligible` | Prime sim/não | médio |
| `offers.summaries.lowestPrice` | Menor preço entre todas as ofertas — **importante para a regra do TOS** (item 9.1) | ✓ |
| `offers.summaries.offerCount` | Quantos vendedores têm o item | médio |
| `customerReviews.count` / `.starRating` | URLs (não conteúdo) | médio |
| `browseNodeInfo.browseNodes` | Categoria do produto | ✓ |
| `parentASIN` | ASIN-pai (se for variação) | ✓ |

**Regra prática:** comece pedindo o mínimo. Cada resource extra cresce a resposta.

---

## 7. Quotas e rate limiting

### 7.1. O que é público

A Amazon **não documentou publicamente as quotas exatas da Creators API** até a redação deste guia. Os números abaixo vêm de duas fontes:

1. **Continuidade com a PA-API v5** (provável mas não confirmado): 1 TPS / 8.640 TPD inicial, escalando com receita gerada.
2. **Default das bibliotecas comunitárias**: `python-amazon-paapi` usa `throttling=1` (1 req/s) como default seguro. Sugere que o limite real é dessa ordem de grandeza.

### 7.2. Recomendações conservadoras (até a Amazon publicar números oficiais)

- Trate como **1 req/s sustentado** e prepare backoff agressivo.
- **Cache de token OAuth** (1h) — não bata o endpoint de auth a cada chamada.
- **Lote de 10 ASINs** em todo `getItems` — esse é o ganho de quota mais óbvio.
- **Throttler na app** antes da chamada (bibliotecas: `pyrate-limiter` em Python, `bottleneck` em Node).
- **Métricas observáveis**: requests/min, taxa de 429, taxa de 503.

### 7.3. Erros relacionados a quota

| Status HTTP | Significado | O que fazer |
|---|---|---|
| `200` com `errors` no body | Erro semântico (parâmetro inválido, ASIN não existe) | Não retentar — corrigir |
| `401` | Token expirado / inválido | Renovar token e retentar 1 vez |
| `403` | Credencial sem permissão para a operação ou marketplace | Verificar registro |
| `429` | Throttling (TPS estourado) | Backoff exponencial, retry |
| `503` | Throttling de quota diária ou serviço sob pressão | Pausar com janela longa |

---

## 8. Formato de resposta

JSON, com a mesma estrutura semântica da PA-API v5 (só com casing diferente):

```json
{
  "searchResult": {
    "totalResultCount": 1284,
    "searchURL": "https://www.amazon.com.br/s?k=whey+protein+isolado&...",
    "items": [
      {
        "asin": "B07ABC1234",
        "detailPageURL": "https://www.amazon.com.br/dp/B07ABC1234?tag=comparasuple-20&...",
        "itemInfo": {
          "title": {
            "displayValue": "Whey Protein Isolado 900g - Sabor Baunilha - Growth Supplements",
            "label": "Title",
            "locale": "pt_BR"
          },
          "byLineInfo": {
            "brand": { "displayValue": "Growth Supplements" },
            "manufacturer": { "displayValue": "Growth Supplements" }
          },
          "features": {
            "displayValues": [
              "27g de proteína por dose (30g)",
              "Sem adição de açúcar",
              "Aprovado pela ANVISA",
              "Lote testado em laboratório independente"
            ]
          },
          "productInfo": {
            "itemDimensions": {
              "weight": { "displayValue": 0.9, "unit": "kg" }
            }
          }
        },
        "images": {
          "primary": {
            "large": { "url": "https://m.media-amazon.com/images/I/61abc.jpg", "height": 500, "width": 500 }
          }
        },
        "offers": {
          "listings": [
            {
              "id": "xyz...",
              "price": { "amount": 119.90, "currency": "BRL", "displayAmount": "R$ 119,90" },
              "savingBasis": { "amount": 159.90, "displayAmount": "R$ 159,90" },
              "availability": { "message": "Em estoque", "type": "Now" },
              "merchantInfo": { "name": "Amazon.com.br" }
            }
          ],
          "summaries": [
            { "lowestPrice": { "amount": 119.90, "currency": "BRL" }, "offerCount": 3 }
          ]
        }
      }
    ]
  }
}
```

Erros vêm como:

```json
{
  "errors": [
    { "code": "InvalidParameterValue", "message": "The itemId B0XXX is not valid for the marketplace www.amazon.com.br." }
  ]
}
```

---

## 9. TOS — o que continua valendo

As regras do Operating Agreement do Programa de Associados **continuam valendo na íntegra** — o que muda é só a camada técnica. As três cláusulas mais importantes para o ComparaSuple:

### 9.1. Comparador é permitido — com a regra do menor preço

Texto verbatim do Operating Agreement:

> *"...if you choose to display prices for any Product on your Site in any 'comparison' format ... together with prices for the same or similar products offered through any web site or other means other than an Amazon Site, you must display **both the lowest 'new' price and, if we provide it to you, the lowest 'used' price** at which the Product is available on the Amazon Site."*

**Implicação técnica:** sempre peça `offers.summaries.lowestPrice` no array `resources` e exiba esse valor — não só `offers.listings[0].price` da listagem padrão. Caso contrário, você pode estar mostrando a primeira oferta visível mas escondendo uma melhor (de terceiro vendedor, por exemplo).

### 9.2. Cache 24h para conteúdo não-imagem

> *"You may store other Product Advertising Content that does not consist of images for caching purposes for **up to 24 hours**, but if you do so you must immediately thereafter refresh and re-display the Product Advertising Content by making a call to **Creators API**, PA API or retrieving a new Data Feed..."*

**Implicação técnica:**
- Job de refresh roda no mínimo 1×/dia.
- Salve `fetched_at` em cada registro de produto/preço.
- Na UI, esconda preço se `fetched_at > now - 24h` e mostre fallback ("ver na Amazon").
- **Imagens:** **não armazenar localmente** — usar URL `m.media-amazon.com` direto.

### 9.3. Price tracking proibido sem aprovação ⚠️

> *"Unless otherwise agreed by Amazon, your Site **must not have price tracking and/or price alerting functionality**."*

**Implicação para o ComparaSuple:** a feature **"Histórico de preço — gráfico 90 dias + alerta por e-mail"** (P1 da seção 5.2 do business plan) **não pode usar dados da Amazon**. Caminhos:

- **Opção A (recomendada):** histórico/alerta apenas para preços de **Mercado Livre, Netshoes, Growth** (fontes não-Amazon). Na coluna Amazon, exibir apenas preço atual + último update.
- **Opção B:** solicitar aprovação explícita à Amazon (cláusula diz "unless otherwise agreed"). Difícil para conta nova.
- **Opção C:** descartar do MVP.

### 9.4. Outras regras a observar

- **Disclosure obrigatório** em rodapé: *"Como Associado da Amazon, recebo por compras qualificadas."*
- **Não armazenar imagens fora dos servidores Amazon.**
- **Não usar dados da Creators API para alimentar features que dirijam tráfego AWAY da Amazon** (ex.: "compre no Mercado Livre, está mais barato" usando preço Amazon como base de comparação).

---

## 10. Considerações específicas para suplementos

(Carrega do guia anterior — nada mudou aqui.)

- **Tabela nutricional não vem estruturada.** Vai estar em `itemInfo.features` (texto livre) e/ou em uma das imagens secundárias. Plano: regex+heurística para extrair "Xg de proteína por dose"; OCR (Tesseract/Google Vision) das imagens de tabela como segunda camada.
- **Gramatura está em `itemInfo.productInfo.itemDimensions.weight`.** Confiável — usar para calcular `R$/kg` e (cruzando com a info de "dose" extraída) `R$/dose`.
- **Marca (`byLineInfo.brand`) é a chave de agrupamento.** Normalize: "Growth", "Growth Supplements", "GROWTH SUPP." precisam virar a mesma chave.
- **Selos (Informed Sport, Labdoor, ANVISA)** quase nunca em campo estruturado. Regex no `features` + OCR no rótulo.
- **Variações (sabor, gramatura)** — usar `getVariations` para descobrir todos os filhos e tratar cada um como SKU.
- **Browse node "Suplementos Alimentares"** — descobrir ID via `getBrowseNodes` (uma vez) e usar como filtro em `searchItems` para evitar resultado errado (barras, snacks, etc.).

---

## 11. SDKs e bibliotecas disponíveis

**Não existe SDK oficial Amazon para a Creators API até o momento.** Os SDKs `paapi5-*` da PA-API v5 **não funcionam** (auth diferente). Use bibliotecas comunitárias ou implemente o cliente HTTP direto (não é difícil — OAuth client_credentials + JSON, sem assinatura).

| Linguagem | Biblioteca | Repositório | Status |
|---|---|---|---|
| Python | `python-amazon-paapi` (sergioteula) | https://github.com/sergioteula/python-amazon-paapi | Atualizada para Creators API |
| PHP | `apaapi` (Jakiboy) | https://github.com/Jakiboy/apaapi | Atualizada para Creators API |
| .NET | `Nager.AmazonCreatorsApi` | https://github.com/nager/Nager.AmazonCreatorsApi | Especificamente para Creators API |
| Elixir | `amazon_creators_api` | https://hexdocs.pm/amazon_creators_api/ | Atualizada |
| Node.js | — | (sem biblioteca consolidada confirmada) | Implementar com `axios`/`undici` direto |
| WordPress | AAWP, AffiliateX | (plugins) | Migrados |

> Para o stack Node sugerido no business plan, **implementar HTTP direto é a opção mais previsível** (200 linhas de código). Para Python (mais maduro para data work), **usar `python-amazon-paapi` é o atalho**.

---

## 12. Exemplo end-to-end em Python

Usando `python-amazon-paapi` (mais rápido) — veja seção 11 sobre instalação.

```python
# pip install python-amazon-paapi
from amazon_paapi import AmazonApi
import os, time, logging

api = AmazonApi(
    key=os.environ["AMAZON_CREDENTIAL_ID"],
    secret=os.environ["AMAZON_CREDENTIAL_SECRET"],
    tag=os.environ["AMAZON_PARTNER_TAG"],   # ex.: "comparasuple-20"
    country="BR",                           # marketplace amazon.com.br
    throttling=1.5,                         # 1 req a cada 1.5s — folga sobre o limite
)

# ----- 1. SearchItems: descobrir SKUs novos -----
results = api.search_items(
    keywords="whey protein isolado",
    search_index="HealthPersonalCare",
    item_count=10,
)

novos_asins = []
for item in results.items:
    novos_asins.append(item.asin)
    print(f"{item.asin} | {item.item_info.title.display_value} | "
          f"{item.offers.listings[0].price.display_amount if item.offers else '-'}")

# ----- 2. GetItems em lote (até 10 por chamada) -----
def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

todos_asins = ["B07ABC1234", "B08DEF5678", ...]  # do seu banco
for batch in chunks(todos_asins, 10):
    try:
        items = api.get_items(items=batch)
        for it in items:
            preco = it.offers.listings[0].price.amount if it.offers else None
            menor_preco = (it.offers.summaries[0].lowest_price.amount
                           if it.offers and it.offers.summaries else None)
            # salvar em tabela `prices` (asin, source='amazon', price, lowest_price, captured_at=now())
            print(it.asin, preco, menor_preco)
    except Exception as e:
        logging.exception(f"falha no batch {batch}: {e}")
        time.sleep(5)  # backoff simples
```

### 12.1. Versão sem SDK (HTTP direto)

Se preferir evitar dependência (ou para Node), o fluxo OAuth é simples. Pseudo-código:

```python
import base64, requests, time

# 1. Trocar credenciais por bearer token (cachear por ~55min)
def get_token():
    resp = requests.post(
        "https://api.amazon.com/auth/o2/token",  # v3.1 - NA region (BR está aqui)
        data={
            "grant_type": "client_credentials",
            "client_id":     os.environ["AMAZON_CREDENTIAL_ID"],
            "client_secret": os.environ["AMAZON_CREDENTIAL_SECRET"],
            "scope": "creatorsapi::default",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    j = resp.json()
    return j["access_token"], time.time() + j["expires_in"] - 300  # margem 5min

# 2. Chamar a API
def search_items(token, keywords):
    resp = requests.post(
        "https://creatorsapi.amazon/catalog/v1/searchItems",
        json={
            "keywords": keywords,
            "searchIndex": "HealthPersonalCare",
            "itemCount": 10,
            "partnerTag": os.environ["AMAZON_PARTNER_TAG"],
            "partnerType": "Associates",
            "resources": [
                "itemInfo.title", "itemInfo.byLineInfo", "itemInfo.features",
                "itemInfo.productInfo", "images.primary.large",
                "offers.listings.price", "offers.listings.availability.message",
                "offers.summaries.lowestPrice", "browseNodeInfo.browseNodes",
            ],
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "x-marketplace": "www.amazon.com.br",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
```

---

## 13. Mapa de migração mental: PA-API v5 → Creators API

| Conceito PA-API v5 | Equivalente Creators API |
|---|---|
| Access Key ID | Credential ID |
| Secret Access Key | Credential Secret |
| AWS Sig v4 | OAuth 2.0 client_credentials |
| Header `Authorization: AWS4-HMAC-SHA256 …` | Header `Authorization: Bearer …` |
| Header `X-Amz-Date` | (não necessário — token já é time-bound) |
| Header `X-Amz-Target: …SearchItems` | Path `/catalog/v1/searchItems` |
| Host `webservices.amazon.com.br` | Host `creatorsapi.amazon` + header `x-marketplace: www.amazon.com.br` |
| `Marketplace` no body | Header `x-marketplace` |
| `SearchItems`, `Keywords`, `ItemCount` | `searchItems`, `keywords`, `itemCount` |
| `ItemInfo.Title` | `itemInfo.title` |
| `Offers.Listings[0].Price.DisplayAmount` | `offers.listings[0].price.displayAmount` |
| SDK `paapi5-python-sdk` | `python-amazon-paapi` (sergioteula) ou HTTP direto |
| Quota inicial 1 TPS / 8.640 TPD | A confirmar — assume similar |
| Pré-req: 3 vendas em 180d | **10 vendas qualificadas em 30d** |

---

## 14. Próximos passos para implementação

Sequência sugerida — ajustada ao novo cenário:

1. **Imediatamente** — abrir conta Associados BR (não tem barreira), cadastrar domínio.
2. **Mês 1, semana 1** — implementar **Mercado Livre API** primeiro (sem barreira de vendas) + links de afiliado Amazon "manuais" (sem API, só `?tag=comparasuple-20`) para começar a gerar vendas.
3. **Mês 1-3** — gerar tráfego mínimo via SEO + tráfego pago de teste, com objetivo de chegar nas **10 vendas qualificadas Amazon nos últimos 30 dias**.
4. **Quando atingir as 10 vendas/30d** — aplicar para Creators API (Associates Central → Tools → Creators API).
5. **Aprovação concedida** — gerar credenciais v3.1 (NA), implementar módulo `creators_api_client/`:
   - Token cache (memória ou Redis).
   - Wrapper para `searchItems` (com paginação) e `getItems` (com lote de 10).
   - Throttling (1 req/s seguro).
   - Backoff exponencial em 429/503.
   - Logging estruturado (qtd. requests, latência, erros).
6. **Schema Postgres**:
   - `products(asin PK, marca, titulo, ean, gramatura_g, dose_g, proteina_por_dose_g, …)`
   - `prices(id, asin FK, source enum['amazon','ml','netshoes','growth'], price BRL, lowest_price BRL, captured_at)`
   - `images(asin FK, url, ord)` — só URL, sem download.
7. **Pipeline de ingestão**:
   - Job diário de keywords-âncora → `searchItems` → grava ASINs novos em `products`.
   - Job diário de refresh → `getItems` em lote de 10 → grava snapshot em `prices`.
   - Pipeline de normalização (regex em `features`, OCR em imagens nutricionais).
8. **Histórico/alertas (P1):** implementar **só para fontes não-Amazon** por causa do TOS.

---

## 15. Checklist antes de codar contra a Creators API

- [ ] Conta de Associado BR aprovada
- [ ] Acumuladas ≥10 vendas qualificadas em 30 dias (gate de acesso)
- [ ] Aplicação para Creators API enviada e aprovada
- [ ] Credenciais geradas (v3.1 — região NA)
- [ ] Marketplace confirmado no painel — provável `www.amazon.com.br`
- [ ] `.env` configurado com `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET`, `AMAZON_PARTNER_TAG`
- [ ] Stack escolhido (Python + `python-amazon-paapi` ou Node + HTTP puro)
- [ ] Postgres provisionado (Supabase ou Railway)
- [ ] Camada de cache para token OAuth (memória ou Redis)
- [ ] Disclosure de afiliado no rodapé do site
- [ ] Disclaimer "preço sujeito a alteração — atualizado em XX/XX/XXXX HH:MM" ao lado de cada preço
- [ ] Feature de price tracking/alerta **desabilitada** para coluna Amazon (TOS)
- [ ] Job de refresh agendado para rodar no mínimo 1×/dia (cláusula 24h)

---

## 16. Pontos a confirmar (a doc oficial é parca em alguns aspectos)

Itens que recomendo verificar diretamente no painel da Creators API após a aprovação, porque a documentação pública é incompleta hoje:

1. **Valor exato do header `x-marketplace` para o BR** — provavelmente `www.amazon.com.br`, mas pode aparecer como Marketplace ID alfanumérico.
2. **Quota inicial e curva de crescimento** — Amazon não publicou números oficiais; assumir 1 TPS / 8.640 TPD por segurança.
3. **`getBrowseNodes` está disponível?** — alta probabilidade (paridade com PA-API v5), mas confirmar.
4. **Operações novas** — Creators API pode expor recursos que a PA-API v5 não tinha (ex.: dados de "Posts" / conteúdo de criadores). Vale conferir o catálogo completo no painel.
5. **Validade real do token** — `expires_in: 3600` é o esperado, mas confirmar empiricamente.

---

## 17. Referências

- [Documentação oficial Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/)
- [Amazon Associates Operating Agreement (US — texto autoritativo das cláusulas de TOS)](https://affiliate-program.amazon.com/help/operating/policies)
- [Portal de Associados BR](https://associados.amazon.com.br/help/operating/agreement/)
- [Análise da migração PA-API v5 → Creators API (DEV.to)](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek)
- [Amazon Creators API: What Changed and How to Switch (KeywordRush)](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)
- [`python-amazon-paapi` (Python, atualizada p/ Creators API)](https://github.com/sergioteula/python-amazon-paapi)
- [`apaapi` (PHP, Creators API)](https://github.com/Jakiboy/apaapi)
- [`Nager.AmazonCreatorsApi` (.NET)](https://github.com/nager/Nager.AmazonCreatorsApi)
