# Amazon PA-API 5.0 — Guia de Integração para o ComparaSuple

> Documento técnico de referência para integrar o comparador de suplementos com a Product Advertising API 5.0 do Amazon.com.br.
> Versão: 1.0 — Maio/2026

---

## 1. Visão geral

A **Product Advertising API (PA-API) 5.0** é a API oficial do programa de Associados Amazon. Ela expõe, em JSON, dados de catálogo do marketplace (título, ASIN, descrição, imagens, preço, disponibilidade, ofertas de vendedores, browse nodes, variações).

No nosso caso de uso (comparador de suplementos):

- **Por que usar:** é a única forma legalmente endossada de extrair preço e ficha de produto da Amazon BR sem entrar em conflito com TOS de scraping. Toda a "ponte" de afiliado (que é parte do nosso modelo de receita) já vem embutida — basta passar o `PartnerTag`.
- **O que ela NÃO entrega:** tabela nutricional estruturada (whey, creatina, etc.). Esses campos só vêm como texto livre dentro de `ItemInfo.Features` ou `ItemInfo.ProductInfo`. Vamos precisar fazer parsing/normalização do nosso lado.
- **Versão atual:** 5.0. A 4.0 foi descontinuada em mar/2020. Toda documentação aqui é da 5.0.

---

## 2. Pré-requisitos

Antes de escrever uma única linha de código:

### 2.1. Conta de Associado Amazon Brasil

1. Criar conta em https://associados.amazon.com.br/.
2. Cadastrar o site `comparasuple.com.br` (ou domínio escolhido) na lista de fontes.
3. Aguardar aprovação inicial do site.
4. **Regra crítica das 3 vendas em 180 dias:** após aprovação, você precisa gerar **pelo menos 3 vendas qualificadas em 180 dias** para manter a conta ativa e o acesso à PA-API. Se não gerar, a conta é descredenciada e a API é cortada.

> **Implicação para o roadmap:** não dá para abrir conta de afiliado e ficar 6 meses só desenvolvendo. O caminho prático é abrir a conta perto do go-live (mês 2 do roadmap), quando já houver tráfego mínimo para gerar as 3 vendas.

### 2.2. Acesso à PA-API

A PA-API só é liberada **após** as 3 primeiras vendas qualificadas — esse é o ponto mais importante, e a maioria dos artigos antigos não menciona isso. Ou seja:

1. Conta criada → links de afiliado simples já funcionam.
2. **Primeiras 3 vendas** → libera o painel de PA-API e geração de chaves.
3. A partir daí, o acesso é mantido enquanto a conta gerar receita continuamente.

**Workaround durante o desenvolvimento:** usar o [scratchpad](https://webservices.amazon.com.br/paapi5/scratchpad/index.html) com chaves de uma conta já madura (sua ou de um sócio que já seja Associado), ou começar a integração via Mercado Livre API (não tem essa restrição) e adicionar Amazon depois.

### 2.3. Marketplace e endpoint BR

| Item | Valor |
|---|---|
| Host | `webservices.amazon.com.br` |
| Region | `us-east-1` (sim — mesmo para o BR) |
| Marketplace | `www.amazon.com.br` |
| Service | `ProductAdvertisingAPI` |

---

## 3. Geração das credenciais

No painel do Associado, em **Tools → Product Advertising API → Manage Your Credentials**:

- **Access Key ID** — público, vai no header.
- **Secret Access Key** — secreto, usado para assinar a requisição. **Não voltam a ser exibidas após criadas** — se perder, é rotacionar.
- **Partner Tag (Associate Tag)** — algo como `comparasuple-20`. Vai em todo request e é o que atribui a comissão para você.

**Onde guardar:** variáveis de ambiente (`.env` local, secret manager em produção). Nunca no repositório.

```env
PAAPI_ACCESS_KEY=AKPAXXXXXXXXXXXXXXXX
PAAPI_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAAPI_PARTNER_TAG=comparasuple-20
PAAPI_HOST=webservices.amazon.com.br
PAAPI_REGION=us-east-1
PAAPI_MARKETPLACE=www.amazon.com.br
```

---

## 4. Autenticação — AWS Signature Version 4

A PA-API usa **AWS Sig v4**, o mesmo esquema de assinatura do S3, DynamoDB, etc. Cada request precisa ser assinado individualmente.

### 4.1. Componentes da assinatura

A assinatura é um HMAC-SHA256 calculado sobre uma string que combina:

1. **Canonical Request** — método HTTP (sempre `POST`), path (`/paapi5/searchitems` ou `/paapi5/getitems`), query string vazia, headers canônicos, signed headers, payload hash.
2. **String to Sign** — `AWS4-HMAC-SHA256 \n {timestamp} \n {credential scope} \n {hash do canonical request}`.
3. **Signing Key** — derivada em quatro passos do `secret key` + data + region + service.
4. **Signature** — HMAC-SHA256(signing key, string to sign), em hex.

### 4.2. Headers obrigatórios

```
Host: webservices.amazon.com.br
Content-Type: application/json; charset=utf-8
X-Amz-Date: 20260510T143000Z
X-Amz-Target: com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems
Content-Encoding: amz-1.0
Authorization: AWS4-HMAC-SHA256 Credential={access_key}/20260510/us-east-1/ProductAdvertisingAPI/aws4_request, SignedHeaders=content-encoding;host;x-amz-date;x-amz-target, Signature={hex_signature}
```

> O `X-Amz-Target` muda conforme o endpoint: `SearchItems`, `GetItems`, `GetVariations`, `GetBrowseNodes`.

### 4.3. **Recomendação prática**

**Não implemente Sig v4 na unha.** É a maior fonte de bugs em integrações com PA-API (qualquer caracter diferente no payload muda o hash e invalida tudo). Use o SDK oficial:

| Linguagem | Pacote | Repositório |
|---|---|---|
| Python | `paapi5-python-sdk` | https://github.com/amzn/paapi5-python-sdk |
| Node.js | `paapi5-nodejs-sdk` | https://github.com/amzn/paapi5-nodejs-sdk |
| Java | `paapi5-java-sdk` | https://github.com/amzn/paapi5-java-sdk |
| PHP | `paapi5-php-sdk` | https://github.com/amzn/paapi5-php-sdk |

O SDK cuida da assinatura, retry e parse de resposta. Só vale escrever Sig v4 na mão se você precisar usar uma stack que não tem SDK (raro).

---

## 5. Endpoints úteis para o ComparaSuple

A PA-API 5.0 tem 4 operações principais. Para o nosso caso, **SearchItems** e **GetItems** cobrem 95% do uso.

### 5.1. `SearchItems` — busca por palavra-chave/categoria

**Quando usar:**
- Descobrir SKUs novos no catálogo (ex.: rodar diariamente "whey isolado" e ver se entrou produto novo).
- Popular o catálogo inicial — primeiros 200-400 SKUs do MVP.
- Cobertura de long-tail (ex.: "creatina monohidratada 300g").

**Limites:**
- Retorna no **máximo 10 itens por página**, com até **10 páginas** (= 100 itens por busca, no máximo).
- Cada página é um request separado e consome quota.

**Payload mínimo:**

```json
{
  "Keywords": "whey protein isolado",
  "SearchIndex": "HealthPersonalCare",
  "ItemCount": 10,
  "ItemPage": 1,
  "PartnerTag": "comparasuple-20",
  "PartnerType": "Associates",
  "Marketplace": "www.amazon.com.br",
  "Resources": [
    "ItemInfo.Title",
    "ItemInfo.ByLineInfo",
    "ItemInfo.Features",
    "ItemInfo.ContentInfo",
    "ItemInfo.ProductInfo",
    "Images.Primary.Large",
    "Images.Variants.Large",
    "Offers.Listings.Price",
    "Offers.Listings.Availability.Message",
    "Offers.Listings.MerchantInfo",
    "Offers.Listings.SavingBasis",
    "BrowseNodeInfo.BrowseNodes"
  ]
}
```

**Filtros úteis:**
- `BrowseNodeId` — escopa a busca em uma categoria específica (ex.: ID do node "Suplementos > Proteína em Pó" no BR).
- `Brand` — filtra por marca (ex.: "Growth Supplements").
- `MinPrice` / `MaxPrice` — em centavos (R$ 100,00 → `10000`).
- `Condition` — `New` (default), `Used`, `Refurbished`, `Collectible`.
- `SortBy` — `Relevance` (default), `Price:LowToHigh`, `Price:HighToLow`, `AvgCustomerReviews`, `NewestArrivals`.

### 5.2. `GetItems` — detalhes por ASIN

**Quando usar:**
- Refresh diário de preços/ofertas dos SKUs já cadastrados.
- Ficha de produto (todos os detalhes de um ASIN específico).

**Limites:**
- Aceita até **10 ASINs por chamada** (lote). Use isso — é o ganho de quota mais óbvio.

**Payload:**

```json
{
  "ItemIds": ["B07XYZ1234", "B08ABC5678", "B09DEF9012"],
  "ItemIdType": "ASIN",
  "PartnerTag": "comparasuple-20",
  "PartnerType": "Associates",
  "Marketplace": "www.amazon.com.br",
  "Resources": [
    "ItemInfo.Title",
    "ItemInfo.ContentInfo",
    "ItemInfo.Features",
    "ItemInfo.ProductInfo",
    "Images.Primary.Large",
    "Offers.Listings.Price",
    "Offers.Listings.Availability.Message",
    "Offers.Listings.SavingBasis",
    "Offers.Summaries.LowestPrice",
    "Offers.Summaries.OfferCount",
    "CustomerReviews.Count",
    "CustomerReviews.StarRating"
  ]
}
```

> ⚠️ `CustomerReviews.Count` e `StarRating` retornam apenas a **URL** dos reviews — não o conteúdo. Para mostrar resenhas no site, ou exibir um iframe via essa URL ou parsear de outra forma (com cuidado de TOS).

### 5.3. `GetVariations` — variações de um item-pai

Útil quando um whey existe em vários sabores/tamanhos sob um ASIN-pai. Retorna lista de ASINs-filhos com diferenças (sabor, peso, embalagem). Para o comparador, **vale tratar cada variação como SKU separado** — cada uma tem preço e tabela nutricional próprios.

### 5.4. `GetBrowseNodes` — taxonomia da Amazon

Retorna informações sobre nós da árvore de categorias. Útil **uma vez**, no início, para descobrir os IDs de browse node de "Suplementos > Whey", "Suplementos > Creatina" etc., e usar esses IDs como filtro em `SearchItems`.

---

## 6. Resources — controle granular do payload

A PA-API não retorna tudo por padrão. Você **pede explicitamente** quais campos quer no array `Resources`. Pedir menos = resposta mais leve = menos parsing.

Lista (curada) das resources mais úteis para o comparador:

| Resource | O que traz | Crítico p/ MVP? |
|---|---|---|
| `ItemInfo.Title` | Título completo do produto | Sim |
| `ItemInfo.ByLineInfo` | Marca, fabricante | Sim |
| `ItemInfo.Features` | Bullets de descrição (lista) | Sim — onde geralmente está a tabela nutricional |
| `ItemInfo.ContentInfo` | Páginas, idioma, formato | Não |
| `ItemInfo.ProductInfo` | Peso, dimensões, cor, tamanho | Sim — para extrair gramatura |
| `ItemInfo.Classifications` | Categoria, binding | Sim |
| `ItemInfo.TechnicalInfo` | Specs técnicas | Médio |
| `Images.Primary.Large` | Imagem principal (URL) | Sim |
| `Images.Variants.Large` | Imagens secundárias | Sim |
| `Offers.Listings.Price` | Preço atual + moeda | Sim |
| `Offers.Listings.SavingBasis` | Preço "de" (riscado) — útil pra mostrar % desconto | Sim |
| `Offers.Listings.Availability.Message` | "Em estoque", "Apenas 3 restantes" | Sim |
| `Offers.Listings.MerchantInfo` | Quem vende (Amazon, terceiro) | Sim |
| `Offers.Listings.DeliveryInfo.IsPrimeEligible` | Prime sim/não | Médio |
| `Offers.Summaries.LowestPrice` | Menor preço entre todas as ofertas (incluindo terceiros) | Sim |
| `Offers.Summaries.OfferCount` | Quantos vendedores têm o item | Médio |
| `CustomerReviews.Count` | URL para a lista de reviews | Médio |
| `CustomerReviews.StarRating` | URL para o resumo de estrelas | Médio |
| `BrowseNodeInfo.BrowseNodes` | Categoria do produto | Sim |
| `ParentASIN` | ASIN-pai (se for variação) | Sim |

**Regra prática:** comece pedindo só o necessário. Cada resource adicional faz a resposta crescer; em volume, isso vira custo de banda/parse.

---

## 7. Quotas e limites

Esta é a parte mais incompreendida da PA-API. Vale internalizar bem antes de modelar a arquitetura.

### 7.1. Quota inicial

| Métrica | Valor |
|---|---|
| TPS (transactions per second) | **1** |
| TPD (transactions per day) | **8.640** |

Ou seja: **1 request por segundo, 8.640 por dia, partindo do zero**.

### 7.2. Como a quota cresce

A quota **não é fixa** — ela é função da receita gerada por afiliação nos últimos 30 dias:

> **+1 TPS e +864 TPD para cada US$ 4.166** em receita de produtos enviados via seus links de afiliado nos últimos 30 dias.

Em reais e em ordem de grandeza realista para o nosso roadmap:

- **Mês 1-3:** quota inicial (1 TPS / 8.640 TPD) — suficiente para 200-400 SKUs com refresh diário em lotes de 10.
- **Mês 6 (cenário realista):** se gerarmos ~R$ 5-10k/mês de vendas atribuídas, ainda estamos perto do mínimo, mas dá folga.
- **Mês 12+:** com dezenas de milhares de visitas, a quota cresce naturalmente.

**O que isso significa em design:**

- Um SKU = 1 chamada de `GetItems` no batch de 10. Para 400 SKUs com refresh diário = **40 requests/dia**. Cabe folgadamente em 8.640.
- Para 4.000 SKUs com refresh a cada 6h = **1.600 requests/dia**. Ainda cabe.
- O TPS de 1/s é o limitador real: rajadas de muitas chamadas em paralelo vão dar `429 TooManyRequests`. Implemente **fila com throttling**.

### 7.3. Erros relacionados a quota

| Status | Significado | O que fazer |
|---|---|---|
| `429` `TooManyRequests` | Estourou TPS instantâneo | Backoff exponencial, retry após 1-2s |
| `503` `RequestThrottled` | Estourou quota diária ou padrão de tráfego suspeito | Pausar até o dia seguinte |
| `400` `InvalidParameterValue` | Algum parâmetro malformado | Não retentar — corrigir payload |
| `403` `InvalidSignature` | Assinatura errada | Usar SDK em vez de implementar manualmente |
| `404` no item | ASIN não existe ou não está nesse marketplace | Marcar SKU como inativo |

### 7.4. Conta nova: cuidado especial

Contas que **nunca geraram venda** podem ver a quota cair para zero ou ter o acesso à PA-API revogado. Por isso o passo 2.2 é importante.

---

## 8. Formato de resposta

Toda resposta PA-API é JSON, com estrutura:

```json
{
  "SearchResult": {
    "TotalResultCount": 1284,
    "SearchURL": "https://www.amazon.com.br/s?k=whey+protein+isolado&...",
    "Items": [
      {
        "ASIN": "B07ABC1234",
        "DetailPageURL": "https://www.amazon.com.br/dp/B07ABC1234?tag=comparasuple-20&...",
        "ItemInfo": {
          "Title": {
            "DisplayValue": "Whey Protein Isolado 900g - Sabor Baunilha - Growth Supplements",
            "Label": "Title",
            "Locale": "pt_BR"
          },
          "ByLineInfo": {
            "Brand": { "DisplayValue": "Growth Supplements", "Label": "Brand", "Locale": "pt_BR" },
            "Manufacturer": { "DisplayValue": "Growth Supplements" }
          },
          "Features": {
            "DisplayValues": [
              "27g de proteína por dose (30g)",
              "Sem adição de açúcar",
              "Aprovado pela ANVISA",
              "Lote testado em laboratório independente"
            ]
          },
          "ProductInfo": {
            "ItemDimensions": {
              "Weight": { "DisplayValue": 0.9, "Label": "Weight", "Locale": "pt_BR", "Unit": "kg" }
            }
          }
        },
        "Images": {
          "Primary": {
            "Large": { "URL": "https://m.media-amazon.com/images/I/61abc.jpg", "Height": 500, "Width": 500 }
          }
        },
        "Offers": {
          "Listings": [
            {
              "Id": "xyz...",
              "Price": { "Amount": 119.90, "Currency": "BRL", "DisplayAmount": "R$ 119,90" },
              "SavingBasis": { "Amount": 159.90, "DisplayAmount": "R$ 159,90" },
              "Availability": { "Message": "Em estoque", "Type": "Now" },
              "MerchantInfo": { "Name": "Amazon.com.br" }
            }
          ],
          "Summaries": [
            { "LowestPrice": { "Amount": 119.90, "Currency": "BRL" }, "OfferCount": 3 }
          ]
        }
      }
    ]
  }
}
```

Em caso de erro, o body vem com `Errors`:

```json
{
  "Errors": [
    {
      "Code": "InvalidParameterValue",
      "Message": "The ItemId B0XXX is not valid for the locale pt_BR."
    }
  ]
}
```

---

## 9. Cuidados, TOS e boas práticas

### 9.1. Regras do TOS que afetam diretamente a arquitetura

1. **Preço com no máximo 24h de defasagem.** Você **não pode** exibir um preço armazenado há mais de 24 horas. Implicação: agendador roda no mínimo 1× por dia, e a UI deve esconder o preço se o cache passou de 24h (mostrar "consultar na Amazon" como fallback).
2. **Nada de comparar preço da Amazon com o de concorrentes em tempo real lado a lado.** Tecnicamente, o TOS proíbe usar a PA-API para "exibir preços de outros varejistas em comparação direta". Na prática, todo comparador faz, mas a leitura conservadora é: cite o preço como "preço Amazon", e os preços de ML/Netshoes vêm de outras fontes (APIs deles ou scraping próprio). **Nunca** use dado da PA-API para alimentar uma feature competitiva contra a própria Amazon (ex.: "compre no Mercado Livre, está mais barato").
3. **Disclosure obrigatório:** "Como Associado da Amazon, recebo por compras qualificadas." Em rodapé de site é suficiente.
4. **Não armazenar dados de imagem fora dos servidores da Amazon.** Use as URLs `m.media-amazon.com` direto — não baixe e re-hospede.
5. **Não usar a PA-API para dados que vão para terceiros** (revender dado de catálogo é proibido).

### 9.2. Boas práticas técnicas

- **Cache obrigatório.** Toda resposta vai para Postgres + camada de cache (Redis ou similar) com TTL de 12-24h para preço e TTL maior (7 dias) para metadados que mudam pouco (título, imagens).
- **Lote de 10 ASINs no `GetItems`.** É 10× mais eficiente que 10 chamadas individuais.
- **Throttling local.** Antes de chamar a API, garanta que não vai estourar o TPS. Bibliotecas: `bottleneck` (Node), `pyrate-limiter` (Python).
- **Backoff exponencial** em 429/503: começar em 1s, dobrar até 32s, desistir e logar.
- **Idempotência.** O ASIN é a chave natural. Salve `(asin, marketplace, fetched_at)`.
- **Histórico de preço.** Crie uma tabela `price_history (asin, price, currency, captured_at)` que você popula a cada chamada — é o que viabiliza o gráfico de "histórico de 90 dias" do MVP, e custa quase nada (uma INSERT por SKU/dia).
- **Observabilidade.** Conte requests/dia, latência e taxa de erro. Quando bater 80% da quota diária, alerta.
- **Failover.** Se PA-API cair, o site precisa mostrar último preço conhecido + flag visual ("preço de XX/XX/XXXX").

### 9.3. Riscos específicos do nosso modelo

- **Comissão de saúde caiu** — categoria "Health & Personal Care" hoje paga em torno de 3-4% (não os 8-15% que existem em moda/livros). Modelagem de receita do business plan já considera isso.
- **Mudanças unilaterais na tabela de comissão** — Amazon altera percentuais sem aviso. Mitigação: diversificar parceiros (ML, Netshoes, Growth) desde o dia 1.
- **Conta de afiliado pode ser suspensa** se as 3 vendas/180d não forem cumpridas. Backup plan: já ter pipeline rodando com Mercado Livre API antes de depender só da Amazon.

---

## 10. Considerações específicas para suplementos

A categoria de suplementos tem peculiaridades que afetam o que você extrai:

- **Tabela nutricional não vem estruturada.** Vai estar em `ItemInfo.Features` (texto livre) e/ou em uma das imagens secundárias. Plano: **regex+heurística** para extrair "Xg de proteína por dose" e similares; **OCR** das imagens de tabela nutricional (Tesseract/Google Vision) como segunda camada.
- **Gramatura está em `ItemInfo.ProductInfo.ItemDimensions.Weight`.** É confiável — usar para calcular `R$/kg` e `R$/dose` (precisa cruzar com a info de "dose" extraída do texto).
- **Marca (`ByLineInfo.Brand`) é a chave de agrupamento.** Mas atenção: os mesmos produtos podem aparecer com marcas grafadas diferentes ("Growth", "Growth Supplements", "GROWTH SUPP."). Vai precisar normalizar.
- **Selos (Informed Sport, Labdoor, ANVISA)** quase nunca aparecem em campo estruturado. Geralmente estão como bullet em `Features` ou na imagem do rótulo. Tratamento: regex no `Features` + OCR na imagem.
- **Variações (sabor, gramatura)** — usar `GetVariations` para descobrir todos os filhos e tratar cada um como SKU.
- **Browse node "Suplementos Alimentares"** — descobrir ID via `GetBrowseNodes` e usar como filtro em `SearchItems` para garantir que só voltam itens da categoria certa (sem cair em "barras de cereal" ou similar).

---

## 11. SDK Python — exemplo end-to-end

Stack do MVP é Node/Python. Exemplo em Python (mais maduro para data work) com o SDK oficial:

```python
# pip install paapi5-python-sdk
from paapi5_python_sdk.api.default_api import DefaultApi
from paapi5_python_sdk.models.partner_type import PartnerType
from paapi5_python_sdk.models.search_items_request import SearchItemsRequest
from paapi5_python_sdk.models.search_items_resource import SearchItemsResource
from paapi5_python_sdk.rest import ApiException
import os

api = DefaultApi(
    access_key=os.environ["PAAPI_ACCESS_KEY"],
    secret_key=os.environ["PAAPI_SECRET_KEY"],
    host="webservices.amazon.com.br",
    region="us-east-1",
)

request = SearchItemsRequest(
    partner_tag=os.environ["PAAPI_PARTNER_TAG"],
    partner_type=PartnerType.ASSOCIATES,
    marketplace="www.amazon.com.br",
    keywords="whey protein isolado",
    search_index="HealthPersonalCare",
    item_count=10,
    resources=[
        SearchItemsResource.ITEMINFO_TITLE,
        SearchItemsResource.ITEMINFO_BYLINEINFO,
        SearchItemsResource.ITEMINFO_FEATURES,
        SearchItemsResource.ITEMINFO_PRODUCTINFO,
        SearchItemsResource.IMAGES_PRIMARY_LARGE,
        SearchItemsResource.OFFERS_LISTINGS_PRICE,
        SearchItemsResource.OFFERS_LISTINGS_AVAILABILITY_MESSAGE,
        SearchItemsResource.OFFERS_SUMMARIES_LOWESTPRICE,
        SearchItemsResource.BROWSENODEINFO_BROWSENODES,
    ],
)

try:
    response = api.search_items(request)
    if response.search_result is not None:
        for item in response.search_result.items:
            print(item.asin, item.item_info.title.display_value,
                  item.offers.listings[0].price.display_amount if item.offers else "—")
    if response.errors:
        for err in response.errors:
            print("ERROR:", err.code, err.message)
except ApiException as e:
    print("API Exception:", e)
```

---

## 12. Próximos passos para implementação

Sequência sugerida (alinhada com o roadmap do business plan):

1. **Mês 1, semana 1** — abrir conta de Associado, registrar domínio, configurar credenciais em `.env`.
2. **Mês 1, semana 2** — montar módulo `paapi_client/` (wrapper Python sobre o SDK) com:
   - Função `search_items(keyword, page)` retornando lista normalizada.
   - Função `get_items(asin_list)` em lote de 10.
   - Throttling (1 TPS) e retry com backoff.
   - Logging estruturado (qtd. requests, quota usada).
3. **Mês 1, semana 3** — schema Postgres:
   - `products(asin PK, marca, titulo, ean, gramatura_g, dose_g, proteina_por_dose_g, …)`
   - `prices(id, asin FK, source enum, price, currency, captured_at)`
   - `images(asin FK, url, ord)`
4. **Mês 1, semana 4** — job de ingestão:
   - Para cada keyword-âncora ("whey", "creatina", etc.) → `search_items`.
   - Insere ASINs novos em `products`.
   - Para cada ASIN do catálogo → `get_items` em lote (refresh diário).
   - Insere snapshot em `prices`.
5. **Mês 2** — pipeline de **normalização** (parsing de `Features`, OCR de imagens nutricionais), e API interna do site (`GET /api/products`, `GET /api/products/:asin`, `GET /api/compare?ids=…`).
6. **Mês 2-3** — integrar Mercado Livre API e scraping leve de Netshoes/Growth como fontes complementares de preço (entram na mesma tabela `prices` com `source` diferente).

---

## 13. Referências

- Documentação oficial: https://webservices.amazon.com.br/paapi5/documentation/
- Scratchpad (testar requests sem código): https://webservices.amazon.com.br/paapi5/scratchpad/
- SDKs oficiais: https://webservices.amazon.com.br/paapi5/documentation/sdk.html
- Política de Associados BR: https://associados.amazon.com.br/help/operating/policies
- Tabela de comissão por categoria BR: https://associados.amazon.com.br/help/node/topic/GHNECY9XAHHQUMAM
- AWS Sig v4 (referência geral): https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html

---

## 14. Checklist antes de codar

- [ ] Conta de Associado BR aprovada
- [ ] Site cadastrado e identificado nas fontes
- [ ] Plano para gerar 3 vendas em 180 dias (tráfego pago de teste no go-live)
- [ ] PA-API liberada (pós-3-vendas) **ou** chaves emprestadas para a fase de dev
- [ ] `.env` com `PAAPI_ACCESS_KEY`, `PAAPI_SECRET_KEY`, `PAAPI_PARTNER_TAG`
- [ ] Decisão de stack: Python ou Node (sugestão: Python pelo data work mais leve)
- [ ] Postgres provisionado (Supabase ou Railway)
- [ ] Disclosure de afiliado já no template de rodapé
- [ ] Disclaimer "preço sujeito a alteração" ao lado de cada preço
