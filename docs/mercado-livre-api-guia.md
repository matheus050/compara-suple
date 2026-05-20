# Mercado Livre API + Programa de Afiliados — Guia para o ComparaSuple

> Documento técnico de referência para integrar o comparador de suplementos com a API pública do Mercado Livre (catálogo, busca, preços) e com o Programa de Afiliados (monetização).
> Versão: 1.0 — Maio/2026

---

## 1. Visão geral — duas coisas distintas que precisam andar juntas

O Mercado Livre expõe **dois sistemas separados** que vamos consumir:

| Sistema | O que é | Onde mora |
|---|---|---|
| **API pública de catálogo** (`api.mercadolibre.com`) | REST/JSON, retorna busca, ficha de produto, preço, estoque, categorias | Endpoints públicos — leitura sem auth para dados não-sensíveis |
| **Programa de Afiliados** (`afiliados.mercadolivre.com.br`) | Onde você cadastra, gera links rastreados, vê comissão, recebe pagamento | Portal próprio, conta separada da Developer |

A integração técnica do **catálogo** é simples (REST, sem auth para o que precisamos). A monetização via **afiliado** é separada — link gerado via portal ou construído por convenção de URL.

**Por que o ML vem antes da Amazon no roadmap:** o Mercado Livre **não tem barreira de venda mínima** (Amazon Creators API exige 10 vendas/30d). É a forma mais rápida de subir um catálogo de preços real, gerar conversões e financiar a entrada na Amazon depois.

---

## 2. Pré-requisitos

### 2.1. Para usar a API de catálogo

**Praticamente nada.** Os endpoints públicos de busca e ficha de produto **não exigem autenticação** quando consultados em modo leitura. Você precisa apenas:

- Conexão HTTP/HTTPS para `api.mercadolibre.com`
- Tratar a resposta JSON

### 2.2. Para registrar uma aplicação (opcional, mas recomendado)

Se for fazer chamadas em alto volume ou usar features que pedem auth (gerenciamento de itens, dados privados de seller, webhooks, e algumas features de afiliados em escala), registre uma aplicação:

- **Acesso ao DevCenter:** https://developers.mercadolivre.com.br/devcenter
- Botão **"Criar nova aplicação"** → preencher dados.
- A conta usada precisa **bater exatamente** com os dados pessoais cadastrados (a Amazon Brasil também exige isso). Se sua conta foi criada como pessoa física, a aplicação precisa ser pessoa física.
- Recebe **App ID** (público) e **Client Secret** (privado).

### 2.3. Para o Programa de Afiliados

Cadastro **separado** do DevCenter:

- Portal: **https://www.mercadolivre.com.br/l/afiliados-primeiros-passos**
- Requisitos: **18 anos**, **CPF ou CNPJ**, dados de Mercado Pago para receber pagamento.
- Aprovação geralmente é rápida (algumas horas a poucos dias).
- **Não exige tração mínima como a Amazon Creators API** — é um diferencial enorme para projeto novo.

---

## 3. API de catálogo — autenticação

### 3.1. Endpoints públicos (90% do que vamos usar)

Os endpoints abaixo respondem **sem header de autenticação**:

- `GET /sites/{site_id}/search` — busca
- `GET /items/{item_id}` — ficha do produto
- `GET /items?ids={id1,id2,...}` — multi-get
- `GET /sites/{site_id}/categories` — categorias raiz
- `GET /categories/{category_id}` — detalhe de categoria
- `GET /sites/{site_id}` — info do site (moedas, configurações)

**Site ID que importa para o ComparaSuple:** **`MLB`** (Brasil).

Outros sites (referência): `MLA` Argentina, `MLM` México, `MLC` Chile, `MCO` Colômbia, `MLU` Uruguai, `MPE` Peru.

### 3.2. Quando OAuth é necessário

Só precisa do fluxo OAuth para:

- Escrita (criar/editar item, gerenciar pedidos) — **não é nosso caso**.
- Leitura de dados **privados** do seller (vendas, métricas, mensagens) — **não é nosso caso**.
- Algumas features avançadas do Afiliados em alto volume (a confirmar).

Se chegar a precisar (ex.: gerar link de afiliado via API se a Amazon liberar isso para nós), o fluxo é:

1. **Authorization Code grant** — usuário é redirecionado para autorizar.
2. Endpoints:
   - Auth (BR): `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id={APP_ID}&redirect_uri={CALLBACK}`
   - Token: `POST https://api.mercadolibre.com/oauth/token`
3. Resposta:
   ```json
   {
     "access_token": "APP_USR-...",
     "token_type": "bearer",
     "expires_in": 21600,
     "scope": "offline_access read write",
     "user_id": 12345,
     "refresh_token": "TG-..."
   }
   ```
4. **Validade:** access token 6 horas, refresh token 6 meses, refresh token é **single-use** (cada refresh devolve um novo).
5. Header em chamadas autenticadas: `Authorization: Bearer {access_token}`.

**Para o MVP do comparador:** não vamos usar OAuth no início. Tudo público.

---

## 4. Endpoints úteis para o comparador

### 4.1. `GET /sites/MLB/search` — busca por keyword

**Exemplo de request (whey protein no Brasil):**

```http
GET /sites/MLB/search?q=whey%20protein&limit=50&offset=0 HTTP/1.1
Host: api.mercadolibre.com
```

**Query parameters mais úteis:**

| Parâmetro | Exemplo | Para que serve |
|---|---|---|
| `q` | `whey%20protein%20isolado` | Termo de busca |
| `category` | `MLB1574` | Restringe a uma categoria (descobrir IDs com `/sites/MLB/categories`) |
| `seller_id` | `123456789` | Restringe a um vendedor específico |
| `limit` | `50` | Resultados por página (default 50, máx geralmente 50) |
| `offset` | `0` | Para paginação (offset máximo costuma ser 1.000) |
| `sort` | `price_asc`, `price_desc`, `relevance` | Ordenação |
| `condition` | `new`, `used` | Filtro de condição |
| `shipping_cost` | `free` | Só com frete grátis |
| `official_store_id` | `123` | Só de uma loja oficial específica |
| `price` | `100-300` | Faixa de preço |

**Resposta (estrutura simplificada):**

```json
{
  "site_id": "MLB",
  "query": "whey protein",
  "paging": { "total": 12345, "primary_results": 1000, "offset": 0, "limit": 50 },
  "results": [
    {
      "id": "MLB1234567890",
      "title": "Whey Protein Isolado Growth 900g Sabor Baunilha",
      "condition": "new",
      "thumbnail": "https://http2.mlstatic.com/.../I_NQ_NP_2X_...jpg",
      "price": 119.90,
      "original_price": 159.90,
      "currency_id": "BRL",
      "available_quantity": 50,
      "sold_quantity": 3287,
      "permalink": "https://produto.mercadolivre.com.br/MLB-1234567890-whey-...",
      "category_id": "MLB1574",
      "seller": {
        "id": 123456789,
        "nickname": "GROWTHSUPLEMENTOS",
        "car_dealer": false,
        "real_estate_agency": false
      },
      "shipping": {
        "free_shipping": true,
        "logistic_type": "fulfillment",
        "mode": "me2",
        "tags": ["mandatory_free_shipping"]
      },
      "attributes": [
        { "id": "BRAND", "name": "Marca", "value_name": "Growth Supplements" },
        { "id": "FLAVOR", "name": "Sabor", "value_name": "Baunilha" },
        { "id": "NET_WEIGHT", "name": "Peso líquido", "value_name": "900 g" },
        { "id": "GTIN", "name": "Código universal de produto", "value_name": "7898680...." }
      ],
      "installments": { "quantity": 12, "amount": 11.86, "rate": 18.5, "currency_id": "BRL" }
    }
  ],
  "available_filters": [...],
  "filters": [...],
  "sort": { "id": "relevance", "name": "Mais relevantes" },
  "available_sorts": [...]
}
```

**Cuidados de paginação:**
- `offset` máximo é normalmente **1.000** (resposta vem vazia se passar disso).
- Para varrer mais de 1.000 itens em uma keyword, **quebre por categoria ou faixa de preço**.

### 4.2. `GET /items/{item_id}` — ficha completa de um produto

```http
GET /items/MLB1234567890 HTTP/1.1
Host: api.mercadolibre.com
```

**Resposta (campos relevantes para suplementos — selecionados):**

```json
{
  "id": "MLB1234567890",
  "site_id": "MLB",
  "title": "Whey Protein Isolado Growth 900g Sabor Baunilha",
  "subtitle": null,
  "seller_id": 123456789,
  "category_id": "MLB1574",
  "official_store_id": 4321,
  "price": 119.90,
  "base_price": 119.90,
  "original_price": 159.90,
  "currency_id": "BRL",
  "initial_quantity": 100,
  "available_quantity": 50,
  "sold_quantity": 3287,
  "buying_mode": "buy_it_now",
  "listing_type_id": "gold_pro",
  "condition": "new",
  "permalink": "https://produto.mercadolivre.com.br/MLB-1234567890-...",
  "thumbnail": "https://http2.mlstatic.com/.../I_NQ_NP_2X_...jpg",
  "pictures": [
    { "id": "...", "url": "https://http2.mlstatic.com/.../I_2X_...jpg",
      "secure_url": "https://...", "size": "1200x1200", "max_size": "1500x1500" },
    ...
  ],
  "attributes": [
    { "id": "BRAND", "value_name": "Growth Supplements" },
    { "id": "FLAVOR", "value_name": "Baunilha" },
    { "id": "NET_WEIGHT", "value_name": "900 g" },
    { "id": "PACKAGE_TYPE", "value_name": "Pote" },
    { "id": "DIETARY_RESTRICTIONS", "value_name": "Sem glúten" },
    { "id": "GTIN", "value_name": "7898680XXXXXX" },
    { "id": "ITEM_CONDITION", "value_name": "Novo" },
    ...
  ],
  "shipping": { "free_shipping": true, "mode": "me2", "logistic_type": "fulfillment" },
  "tags": ["good_quality_picture", "good_quality_thumbnail", "extended_warranty_eligible"],
  "warranty": "Garantia do vendedor: 30 dias",
  "catalog_product_id": "MLB1234567",
  "domain_id": "MLB-PROTEIN_POWDERS",
  "parent_item_id": null,
  "differential_pricing": null,
  "deal_ids": [],
  "automatic_relist": false,
  "date_created": "2024-03-15T14:32:00.000Z",
  "last_updated": "2026-05-09T08:11:00.000Z"
}
```

**Cuidados:**
- A descrição **não** vem nesse endpoint. Buscar separado: `GET /items/{id}/description`.
- Atributos seguem o **catálogo do ML** — `BRAND`, `FLAVOR`, `NET_WEIGHT`, `GTIN` são chaves estáveis. Use elas como ponte para deduplicar produtos entre lojas.

### 4.3. `GET /items?ids=A,B,C` — multi-get (atualização em lote)

Usar para o job diário de refresh de preços — economiza requests:

```http
GET /items?ids=MLB123,MLB456,MLB789&attributes=id,price,available_quantity,sold_quantity,permalink HTTP/1.1
Host: api.mercadolibre.com
```

- **Limite por chamada:** **20 IDs** (a confirmar; a doc oficial menciona esse número, mas vale validar empiricamente).
- O parâmetro `attributes` permite pedir só os campos que interessam (resposta menor, mais rápida).

Resposta vem como array `[{ "code": 200, "body": {...item1...} }, { "code": 200, "body": {...item2...} }]`.

### 4.4. `GET /sites/MLB/categories` e `GET /categories/{id}`

Descobrir IDs de categoria úteis para suplementos:

- **Suplementos Alimentares** vive em `MLB1246` (Esportes e Fitness > Suplementação Esportiva — confirmar empiricamente; pode haver variação).
- Categoria filhas: Whey Protein, Creatina, Hipercalóricos, Pré-treino, Termogênicos, Vitaminas e Minerais, Aminoácidos, etc. Cada uma tem seu próprio ID.

Estratégia recomendada: **uma vez** no setup, baixar a árvore completa de categorias e armazenar em uma tabela `ml_categories` com `id`, `name`, `parent_id`, `path_from_root`. Usar esses IDs como filtro `category=` em `/sites/MLB/search`.

### 4.5. `GET /sites/MLB`

Devolve config geral do site BR (moeda, métodos de pagamento aceitos, categorias raiz). Usar uma vez na inicialização.

---

## 5. Quotas e rate limits

### 5.1. Limite oficial conhecido

- **1.500 requests por minuto, por aplicação** (~25 req/s).
- **Resposta de quota estourada:** HTTP `429`, body vazio.
- **Sem quota diária explícita** documentada.
- Endpoints públicos (sem auth) também são throttled — provavelmente por IP em vez de por app.

Comparativo prático:

| Quota | Amazon (PA-API v5 / Creators API) | Mercado Livre |
|---|---|---|
| TPS | 1 (cresce com receita) | ~25 (1.500/min, fixo) |
| TPD | 8.640 (cresce com receita) | sem teto diário documentado |
| Barreira de acesso | 3 vendas/180d (v5) ou 10/30d (Creators) | nenhuma |

**Para o ComparaSuple:** mesmo com 4.000 SKUs e refresh a cada 6h, ficamos bem dentro do limite. O ML é folgado por design.

### 5.2. Boas práticas mesmo assim

- **Cache local agressivo** (Postgres + Redis para hot path).
- **Throttler na app** com folga (10-15 req/s sustentado em vez de 25).
- **Backoff exponencial** em 429.
- **Multi-get sempre** que possível (até 20 IDs).
- **Compressão**: a API responde a `Accept-Encoding: gzip`.

### 5.3. Erros relevantes

| Status | Significado | O que fazer |
|---|---|---|
| `200` | OK | Processar normalmente |
| `400` | Parâmetro inválido | Não retentar — corrigir |
| `401` | Token expirado / inválido (rotas autenticadas) | Renovar via refresh_token |
| `403` | Sem permissão (escopo insuficiente) | Reauth com scope correto |
| `404` | Item / recurso não existe | Marcar SKU como inativo |
| `429` | Rate limit estourado | Backoff exponencial |
| `5xx` | Erro do ML | Retry com backoff |

---

## 6. Programa de Afiliados — monetização

### 6.1. Como funciona

Você gera um **link rastreado** para um produto. Quando alguém clica e compra dentro da janela de cookie, você recebe **comissão** sobre o valor da venda. Pagamento cai em **Mercado Pago**, não em conta bancária direta.

### 6.2. Comissões por categoria (faixa típica BR)

| Categoria | Comissão típica |
|---|---|
| Moda, Beleza, Cuidados Pessoais | 14–16% |
| Casa, Móveis, Decoração | 12–14% |
| Eletrônicos, Áudio, Vídeo | 9–11% |
| Ferramentas e Construção | 8–10% |
| **Esportes e Fitness / Suplementos** | **~8–12%** *(a confirmar no painel — ML não publica tabela canônica; valor varia por categoria-folha e por campanhas)* |

**Para o ComparaSuple:** o ML costuma pagar **mais que a Amazon BR em saúde** (Amazon paga ~3-4% em saúde). Isso muda a economia da ponte de monetização — provável que ML traga mais receita por venda do que Amazon, mesmo com mesmo ticket.

### 6.3. Janela de cookie (atribuição)

⚠️ **Há informação conflitante nas fontes:**
- Algumas dizem **24 horas** de janela de atribuição.
- Outras dizem **30 dias**.

A leitura mais provável é: **24 horas** para o cookie de clique → conversão (igual à Amazon). Os "30 dias" mencionados em algumas fontes podem se referir ao prazo de **invalidação** (devolução, cancelamento) que reduz a comissão.

**Confirmar no painel** após cadastro. Documente o valor real aqui depois.

### 6.4. Pagamento

- Crédito vai para **Mercado Pago** vinculado à conta.
- **Mínimo de saque:** R$ 30.
- **Prazo de liberação:** até **60 dias** após a venda (período de proteção contra estorno/devolução).

### 6.5. Restrições e práticas proibidas

Conforme as políticas (e prática comum do programa):

- **+18 anos**, com CPF ou CNPJ.
- Proibido **cashback** direto sobre a comissão (devolver dinheiro do cookie ao usuário).
- Proibido **tráfego pago em palavras-chave da marca** (Google Ads para "Mercado Livre" etc.) sem autorização.
- Proibido **promessas falsas** ("compre por R$ 1") ou click-baiting agressivo.
- Proibido publicar links em **plataformas de conteúdo proibido** (adulto, ilegal, etc.).
- A Amazon proíbe price tracking; o **Mercado Livre não tem cláusula equivalente explícita**, então a feature de "histórico de preço + alerta" é viável para preços ML (essa é uma diferença prática importante vs. Amazon).

### 6.6. Geração de link — manual vs API

**Caminho oficial padrão (manual):**
1. Logar no portal de afiliados.
2. Buscar o produto.
3. Clicar em **Gerar link**.
4. Copiar o link encurtado/rastreado.

**Caminho programático:**

Existem **três níveis** de informação cruzada nas fontes:

1. **Nível básico (sempre funciona):** anexar parâmetros de tracking ao `permalink` retornado pelo `/items/{id}`. Padrões observados:
   - `?affiliate=SEU_CODIGO`
   - `?afiliado=SEU_CODIGO`
   - Combinado com `matt_word` / `matt_tool` (parâmetros UTM-like do ML)

2. **Nível "API não oficial":** vários sites comunitários afirmam que **não existe API pública** para gerar links em massa no programa padrão (ver discussão no Reclame Aqui).

3. **Nível "API para alta-volume":** outras fontes mencionam que o ML libera acesso à **API de afiliados** para sites com volume comprovado (comparadores, blogs grandes, bots Telegram). Não há documentação pública até o que conseguimos verificar.

**Recomendação prática para o ComparaSuple:**
- **MVP:** gerar links por convenção de URL — pegar `permalink` do item e anexar `?affiliate={SEU_CODIGO}`. Validar empiricamente que o tracking funciona (clicar, comprar com outra conta, conferir no painel).
- **Pós-tração:** abrir ticket no painel pedindo acesso à API de afiliados quando atingir volume.

> **Importante:** se o anexo de query string não rastrear corretamente, a alternativa segura é gerar o link uma vez no painel para cada SKU âncora, salvar no Postgres, e fazer o site sempre apontar para o link salvo. Mais trabalhoso mas determinístico.

---

## 7. Considerações específicas para suplementos

- **Categoria-âncora:** **Esportes e Fitness > Suplementação Esportiva** (prefixo `MLB1574` / `MLB1246` ou similar — confirmar com `/sites/MLB/categories`).
- **Atributos estáveis** que o ML padroniza para suplementos: `BRAND`, `FLAVOR`, `NET_WEIGHT`, `PACKAGE_TYPE`, `DIETARY_RESTRICTIONS`, `GTIN`, `WITH_LACTOSE`, `IS_VEGAN`. Esses **vêm estruturados** (diferente da Amazon, onde tudo está em texto livre). É uma vantagem grande — **menos parsing, menos OCR**.
- **GTIN/EAN é a chave de deduplicação** entre ML, Amazon e outras lojas. Quando o GTIN está presente, dá para casar o mesmo produto entre fontes.
- **Catálogo unificado do ML (`catalog_product_id`):** vários vendedores anunciando o mesmo produto compartilham o mesmo `catalog_product_id`. Para o comparador, isso é ouro — pegar o `catalog_product_id` e listar todas as ofertas (`/products/{id}/items` se existir, ou via search).
- **`sold_quantity`** é um sinal forte de popularidade — usar como ranking secundário no comparador.
- **`official_store_id`** identifica se o anúncio é de loja oficial da marca (ex.: Growth oficial vs. revendedor). Loja oficial geralmente significa preço e qualidade mais confiáveis.

---

## 8. Exemplo end-to-end em Python

Sem SDK necessário (REST puro):

```python
# pip install httpx
import httpx, time, logging
from typing import Iterable

ML_BASE = "https://api.mercadolibre.com"
SITE = "MLB"

# Throttler simples — segurar em ~10 req/s para dar folga sobre o limite de 25/s
class RateLimiter:
    def __init__(self, max_per_sec: float):
        self.min_interval = 1.0 / max_per_sec
        self.last = 0.0
    def wait(self):
        now = time.monotonic()
        delta = now - self.last
        if delta < self.min_interval:
            time.sleep(self.min_interval - delta)
        self.last = time.monotonic()

throttle = RateLimiter(max_per_sec=10)

def search_items(keyword: str, category: str | None = None, page: int = 0) -> dict:
    """Busca itens — retorna até 50 por chamada."""
    throttle.wait()
    params = {"q": keyword, "limit": 50, "offset": page * 50}
    if category:
        params["category"] = category
    r = httpx.get(f"{ML_BASE}/sites/{SITE}/search", params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def get_items_batch(ids: Iterable[str], attributes: str | None = None) -> list[dict]:
    """Multi-get — máx 20 ids por chamada."""
    ids_list = list(ids)
    if len(ids_list) > 20:
        raise ValueError("máx 20 ids por chamada")
    throttle.wait()
    params = {"ids": ",".join(ids_list)}
    if attributes:
        params["attributes"] = attributes
    r = httpx.get(f"{ML_BASE}/items", params=params, timeout=15)
    r.raise_for_status()
    return r.json()  # [{ code, body }, ...]

def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

# ----- Pipeline de ingestão diária -----
AFFILIATE_CODE = "comparasuple-ml"  # do painel de afiliados, depois de cadastrar

# 1. Descobrir SKUs novos
keywords = ["whey protein isolado", "creatina monohidratada",
            "multivitaminico", "omega 3", "pre treino"]

novos = set()
for kw in keywords:
    for page in range(0, 4):  # 4 páginas × 50 = 200 SKUs
        try:
            res = search_items(kw, category="MLB1246")  # suplementação esportiva
            for item in res["results"]:
                novos.add(item["id"])
            if len(res["results"]) < 50:
                break
        except httpx.HTTPStatusError as e:
            logging.exception(f"falha em '{kw}' p{page}: {e}")
            time.sleep(5)

logging.info(f"{len(novos)} ASINs candidatos a inserir/atualizar")

# 2. Refresh em lote dos itens já no banco
todos_ids: list[str] = [...]  # do seu banco
attrs = "id,title,price,original_price,available_quantity,sold_quantity,permalink,attributes,pictures,seller,shipping,catalog_product_id,domain_id"

for batch in chunks(todos_ids, 20):
    try:
        resp = get_items_batch(batch, attributes=attrs)
        for entry in resp:
            if entry["code"] != 200:
                continue
            item = entry["body"]
            # Construir link de afiliado a partir do permalink
            permalink = item["permalink"]
            sep = "&" if "?" in permalink else "?"
            affiliate_url = f"{permalink}{sep}affiliate={AFFILIATE_CODE}"
            # salvar em prices(asin=item['id'], source='ml', price=item['price'],
            #                   captured_at=now(), affiliate_url=affiliate_url)
            print(item["id"], item["price"], affiliate_url)
    except httpx.HTTPStatusError as e:
        logging.exception(f"falha no batch {batch}: {e}")
        time.sleep(5)
```

---

## 9. Comparação lado a lado: Mercado Livre × Amazon

| Aspecto | Mercado Livre | Amazon (Creators API) |
|---|---|---|
| Auth para leitura pública | **Não precisa** | OAuth 2.0 obrigatório |
| Barreira de entrada | **Nenhuma** | 10 vendas qualificadas/30d |
| Rate limit | **1.500/min (~25/s)** | ~1/s estimado |
| Quota diária | sem teto explícito | limitada (8.640/d na PA-API v5) |
| Site BR | `MLB` | header `x-marketplace: www.amazon.com.br` |
| Atributos do produto | **Estruturados** (BRAND, FLAVOR, NET_WEIGHT, GTIN, …) | Texto livre em `itemInfo.features` (precisa parsing/OCR) |
| Comissão típica em suplementos | **8–12%** *(estimado)* | 3–4% (categoria saúde) |
| Cookie de atribuição | 24h *(a confirmar)* | 24h |
| Histórico de preço/alertas | **Permitido** | **Proibido** sem aprovação |
| Geração de link | Permalink + tracking via convenção, ou API (alta volume) | URL com `?tag=` |
| Comparador lado a lado | Não há cláusula proibitiva equivalente | Permitido com regra do `lowestPrice` |

**Tradução para o produto:** ML é mais permissivo, paga melhor em saúde e tem dados mais limpos. **A coluna ML do comparador deve ser a coluna principal**, e a Amazon entra como segunda fonte quando estiver disponível.

---

## 10. Próximos passos para implementação

Sequência sugerida (revisada considerando que ML vem primeiro):

### Mês 1 — fundação Mercado Livre

1. **Semana 1**
   - Cadastrar conta no Programa de Afiliados ML.
   - Registrar aplicação no DevCenter (mesmo sem precisar de OAuth ainda — gera o `App ID` para futuro).
   - Confirmar formato exato do link de afiliado e janela de cookie no painel.

2. **Semana 2**
   - Implementar módulo `ml_client/` em Python com:
     - `search_items(keyword, category, page)` retornando lista normalizada.
     - `get_items_batch(ids[≤20])`.
     - Throttler (10 req/s seguro).
     - Retry com backoff em 429/5xx.
     - Cliente para `/categories/{id}` (uma vez no setup).

3. **Semana 3**
   - Schema Postgres:
     - `products(id PK, source enum, marca, titulo, ean, gramatura_g, dose_g, …)`
     - `prices(id, product_id FK, price BRL, original_price BRL, captured_at, source, affiliate_url)`
     - `categories(id PK, source, name, parent_id, path_from_root)`
   - Baixar árvore de categorias `MLB` e armazenar.

4. **Semana 4**
   - Job de ingestão diário:
     - Para cada keyword-âncora ("whey", "creatina", etc.) → `search_items`.
     - Insere SKUs novos em `products`.
     - Para SKUs já cadastrados → `get_items_batch` (lote de 20).
     - Snapshot em `prices`.
   - Lançar landing-pré-cadastro com 2-3 guias SEO (alinhado com semana 4 do roadmap original do business plan).

### Mês 2-3 — escala ML + ponte para Amazon

5. Pipeline de **deduplicação por GTIN** entre vendedores ML diferentes.
6. Adicionar **scraping leve** de Netshoes/Growth para enriquecer.
7. Subir **links de afiliado Amazon manuais** (sem API, só `?tag=`) para começar a gerar as 10 vendas/30d que destrancam a Creators API.

### Mês 4+ — Amazon Creators API

8. Quando atingir as 10 vendas/30d na Amazon, aplicar para Creators API e plugar a coluna Amazon estruturada (ver `amazon-creators-api-guia.md`).

---

## 11. Checklist antes de codar

- [ ] Cadastro no Programa de Afiliados ML aprovado
- [ ] Código de afiliado anotado (vai em todo link)
- [ ] Aplicação criada no DevCenter (App ID + Secret guardados em `.env`)
- [ ] Confirmado: o link `permalink + ?affiliate=CODIGO` rastreia conversão (testar empiricamente)
- [ ] Janela de cookie confirmada no painel (24h ou 30d)
- [ ] Comissão de **Esportes/Suplementos** confirmada no painel
- [ ] Postgres provisionado
- [ ] Throttler implementado (10 req/s seguro)
- [ ] Cache local com TTL (não há regra de 24h como Amazon, mas é bom para performance)
- [ ] Dados de Mercado Pago configurados na conta de afiliado para receber pagamento

---

## 12. Pontos a confirmar (a doc oficial bloqueia scraping; verificação no portal é o caminho)

Itens que recomendo validar diretamente no portal de afiliados ou no DevCenter, porque as fontes secundárias divergem:

1. **Janela exata de cookie** — 24h ou 30d (provável 24h).
2. **Comissão exata para Esportes e Fitness > Suplementação** (estimado 8–12%, verificar tabela do painel).
3. **Limite real de IDs** no multi-get `/items?ids=…` (citado como 20, validar empiricamente).
4. **Existe API oficial de afiliados** para gerar links em massa? Se sim, qual o processo de habilitação?
5. **Categoria-folha exata** para "Suplementos Alimentares" no MLB — confirmar via `/sites/MLB/categories` e navegar até o nó correto.
6. **Restrição sobre price tracking** — não vimos cláusula explícita do ML, mas vale ler os Termos de Uso do programa de afiliados antes de lançar a feature de histórico/alerta.

---

## 13. Referências

- [Documentação oficial do Mercado Livre Developers (BR)](https://developers.mercadolivre.com.br/)
- [Items & Searches (oficial)](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas)
- [Authentication and Authorization (oficial)](https://developers.mercadolivre.com.br/en_us/authentication-and-authorization)
- [Termos do Programa de Afiliados e Criadores](https://www.mercadolivre.com.br/ajuda/30228)
- [Portal do Afiliado ML](https://www.mercadolivre.com.br/l/afiliados-portal-do-afiliado)
- [Como gerar seus links de afiliado](https://www.mercadolivre.com.br/l/afiliados-gere-seus-links)
- [Como integrar a API do Mercado Livre (DEV.to)](https://dev.to/fiamon/como-integrar-a-api-do-mercado-livre-3ikn)
- [Programa de Afiliados Mercado Livre — guia 2026 (Afiliar)](https://afiliar.com.br/programa-de-afiliados-mercado-livre/)
- [Mercado Livre Search API — Unwrangle (referência de schema)](https://docs.unwrangle.com/mercado-livre-search-api/)
