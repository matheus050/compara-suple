# Coleta manual de Item IDs do Mercado Livre

> Guia prático pra montar a lista inicial de produtos do comparador.
> Versão: 1.0 — Maio/2026
> Tempo estimado: 1-2 horas (uma vez só)

---

## 1. Por que precisamos disso

A API do Mercado Livre tem uma limitação que descobrimos depois de muitos testes: ela **não permite ao nosso tipo de app listar itens à venda em massa** (endpoints `/sites/MLB/search` e `/users/{seller_id}/items/search` retornam 403 mesmo autenticado, e `/products/{catalog_id}/items` retorna 404 "no winners found").

O que **funciona**: `/items/{item_id}` — desde que a gente passe um ID específico, devolve preço, seller, estoque, permalink, tudo.

**Solução híbrida:** humanos curam a lista inicial de IDs (uma vez), e o backend automatiza o refresh diário via API.

Detalhamento técnico completo: ver `docs/mercado-livre-api-guia.md` e o thread de PRs #2 e #3.

---

## 2. O que é um Item ID

Cada anúncio no Mercado Livre tem um identificador único no formato:

```
MLB seguido de 8-13 dígitos
```

**Exemplos válidos:**
- `MLB6238755`
- `MLB1573569456`
- `MLB68864834`

O `MLB` é o prefixo do site Brasil (Mercado **L**ivre **B**rasil). Argentina seria `MLA`, México `MLM`, etc.

Cada **anúncio** tem seu próprio ID — o mesmo produto vendido por 3 sellers diferentes resulta em 3 item IDs distintos. Pra nosso comparador, queremos os IDs **dos anúncios mais relevantes** (alta vendagem, marca oficial, etc.).

---

## 3. Três jeitos de capturar o ID

### Jeito 1 — Pela URL da página do produto (mais simples)

1. Abra o produto no site do ML. A URL fica num dos dois formatos:

   **Formato A — anúncio específico:**
   ```
   https://produto.mercadolivre.com.br/MLB-1234567890-titulo-do-produto-aqui-_JM
                                          ^^^^^^^^^^^^^^^
                                          O ID está aqui (sem o hífen, fica MLB1234567890)
   ```

   **Formato B — página de catálogo (com vários sellers):**
   ```
   https://www.mercadolivre.com.br/whey-isolado-growth-900g/p/MLB6238755
                                                              ^^^^^^^^^^^
                                                              O ID está aqui
   ```

2. **Copie o ID** (com o `MLB` na frente, sem o hífen no Formato A).

3. Cole na planilha (ver seção 5).

> ⚠️ **Cuidado:** páginas de **catálogo** (`/p/MLBxxx`) são produtos agregados — não funcionam direto no `/items/{id}` da API (precisam ser convertidos pra item de seller específico). Prefira páginas de **anúncio** (`/MLB-xxxxx-`).

### Jeito 2 — Botão direito num resultado de busca

1. Faz uma busca no ML (ex.: "whey isolado growth")
2. **Botão direito** em qualquer card de produto → **"Copiar link"**
3. Cola num bloco de notas — vai aparecer URL completa
4. Extrai o `MLB...` dela

### Jeito 3 — Bookmarklet (mais rápido, pra coletar em volume)

Cria um favorito no navegador com este código JavaScript:

```javascript
javascript:(function(){const m=location.href.match(/MLB[-]?(\d+)/);if(m){const id='MLB'+m[1];navigator.clipboard.writeText(id);alert('Copiado: '+id)}else{alert('Sem ID nesta URL')}})();
```

**Como usar:**
1. Cria um novo favorito qualquer (ex.: salva qualquer página)
2. Edita o favorito: troca a URL pelo código acima
3. Renomeia pra "Copiar MLB"
4. Quando estiver numa página de produto do ML, clica nesse favorito → o ID vai pro clipboard automaticamente

Aí é só `Ctrl+V` na planilha.

---

## 4. Critérios pra escolher quais produtos incluir

A lista inicial vai virar o catálogo do MVP. Quanto melhor escolhidos, melhor o site fica de cara.

### Quantidade-alvo: **50 produtos** distribuídos assim

| Categoria | Quantidade | Por quê |
|---|---|---|
| Whey protein (isolado, concentrado, hidrolisado) | 15 | Categoria-âncora, alto volume de busca |
| Creatina monohidratada | 10 | Em alta, ticket baixo, recorrência |
| Multivitamínicos | 8 | Público amplo (não-fitness) |
| Ômega 3 | 7 | Crescimento >20% no último ano |
| Pré-treino | 5 | Nicho fitness, ticket maior |
| Termogênicos / emagrecimento | 5 | Alta sazonalidade verão |

### Critérios qualitativos (em ordem de prioridade)

1. **Marcas relevantes** — pegar variedade: Growth, Max Titanium, Integralmédica, Dux Nutrition, Black Skull, Probiótica, Atlhetica, Nutrify, Adaptogen, IronMan, Performance, Optimum Nutrition, Dymatize.
2. **Alta vendagem** — o ML mostra "+ de X vendidos" no card. Priorize os com 500+ vendas.
3. **Loja oficial** — selo "Loja oficial" significa que é o próprio fabricante vendendo. Mais confiável que revendedor.
4. **Estoque disponível** — evite produtos com "Última unidade" ou "Em breve".
5. **Variedade de tamanhos** — inclui 900g, 1kg, 2kg, 5lb (~2.27kg) — usuário compara R$/kg.
6. **Variedade de sabores** — mesmo produto em 3 sabores diferentes vira 3 entradas (cada um tem item_id próprio).

### O que evitar

- ❌ Produtos com 0 ou 1 venda (provavelmente novos/sem reputação)
- ❌ Sellers com reputação amarela/vermelha (problemas de entrega)
- ❌ Combos / kits (ficam difíceis de comparar por dose)
- ❌ Importados sem origem clara (zona cinza de qualidade)
- ❌ "Fracionados" / 100g de degustação (não representam compra real)

---

## 5. Onde colar — formato do arquivo

O backend vai consumir um arquivo JSON simples. **A primeira versão pode ser apenas uma lista de IDs:**

**Arquivo:** `data/items.json` (a ser criado na raiz do repo `compara-suple`)

```json
{
  "items": [
    "MLB6238755",
    "MLB1573569456",
    "MLB68864834",
    "MLB22211366"
  ]
}
```

### Versão enriquecida (opcional — facilita debug)

Se quiser anotar o que cada ID é (útil pra revisar depois), o formato aceita comentários inline:

```json
{
  "items": [
    { "id": "MLB6238755", "nota": "Dymatize Elite Whey 900g Baunilha" },
    { "id": "MLB1573569456", "nota": "Growth Whey Isolado 1kg Chocolate" },
    { "id": "MLB68864834", "nota": "Creatina Growth 250g" }
  ]
}
```

> O backend vai aceitar **os dois formatos** (lista simples de strings OU lista de objetos com `id` + `nota`). Use o que ficar mais confortável.

---

## 6. Fluxo recomendado (passo a passo)

Pra fazer os 50 em uma sessão de ~2h:

1. **Abre um Google Sheets / Notion** com 4 colunas: `ID | Categoria | Marca | Nota` (a Nota é opcional, ajuda revisão)
2. **Abre o ML** em outra aba
3. Pra cada categoria da tabela seção 4:
   - Busca a categoria no ML (ex.: "whey isolado")
   - Filtra por:
     - **Mais vendidos** (ordenação)
     - **Frete grátis** (se quiser priorizar)
     - **Loja oficial** (na barra lateral)
   - Vai capturando IDs dos 10-15 primeiros (com Bookmarklet do Jeito 3 fica rápido)
   - Cola cada ID + categoria + marca na planilha
4. **Revisa a planilha** no final:
   - Sem IDs duplicados
   - Variedade de marcas (não pode ser tudo Growth)
   - Variedade de tamanhos (não pode ser tudo 900g)
5. **Exporta a coluna ID** pra um arquivo JSON no formato da seção 5
6. **Cria PR adicionando `data/items.json` ao repo** — o backend vai começar a ingerir esses IDs automaticamente

---

## 7. Manutenção (depois do MVP estar no ar)

A lista vai precisar de atualização periódica:

- **Item descontinuado** (`/items/{id}` retorna 404 ou `status: closed`) → o backend já marca como `available: false`; pode ser removido manualmente da lista quando confirmado
- **Produto novo no mercado** → adicionar à lista quando notarmos
- **Marca nova relevante** → adicionar pelo menos 2-3 produtos da marca

Frequência sugerida: revisão **mensal** dos 10% piores em CTR + adição de produtos novos.

---

## 8. Checklist final antes de mandar

Antes de criar a PR com o `data/items.json`:

- [ ] Tem **pelo menos 50 IDs** no arquivo
- [ ] Distribuição por categoria bate com a tabela da seção 4
- [ ] **Nenhum ID duplicado**
- [ ] Todos os IDs no formato `MLB` + dígitos (sem hífen, sem espaços)
- [ ] Pelo menos **6 marcas diferentes** representadas
- [ ] Pelo menos **3 tamanhos diferentes** de whey (900g, 1.8kg, 5lb)
- [ ] Lista revisada por outra pessoa (ou pelo menos relida com calma)
- [ ] Arquivo `data/items.json` valida como JSON (cola em https://jsonlint.com/ pra checar)

---

## 9. Próximos passos pra mim (Gabriel/Claude)

Quando o `data/items.json` for mergeado:
- Refatorar `lib/ml/ingest.ts` pra ler de `data/items.json` em vez de fazer `/products/search`
- Trocar a lógica de "search + buy_box_winner" por "loop nos IDs + /items/{id}"
- Re-rodar o cron — agora deve popular `product` / `variant` / `offer` / `price_history` de verdade

Estimativa: ~2h de código depois que a lista chegar.
