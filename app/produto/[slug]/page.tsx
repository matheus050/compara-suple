import { Star, Heart, Bell, ChevronRight } from 'lucide-react'
import Header from '@/components/Header'

// ─── Mock data ────────────────────────────────────────────────────────────────

const produto = {
  slug: 'atlas-whey-iso-900g-baunilha',
  marca: 'Atlas Nutrition',
  nome: 'Whey Protein Isolado 900g · Baunilha',
  rating: 4.7,
  avaliacoes: 1284,
  sku: 'ATL-WIS-900-BAU',
  preco_original: 189.90,
  preco_atual: 169.90,
  desconto: 11,
  proteina_por_dose: 27,
  doses: 30,
  preco_por_dose: 5.66,
  score: 9.2,
}

interface Loja {
  avatar: string
  avatarColor: string
  nome: string
  stars: number
  parcelas: string
  preco: number
  frete: number | null
  total: number
  diff: number | null
  entrega: string
  estoque: string
  estoqueColor: string
  melhorPreco?: boolean
}

const lojas: Loja[] = [
  {
    avatar: 'N', avatarColor: 'bg-green-600',
    nome: 'NutriPrime', stars: 4, parcelas: '10× sem juros',
    preco: 169.90, frete: null, total: 169.90, diff: null,
    entrega: '2–4 dias', estoque: 'Em estoque', estoqueColor: 'text-green-600',
    melhorPreco: true,
  },
  {
    avatar: 'S', avatarColor: 'bg-gray-500',
    nome: 'SuplementaJá', stars: 5, parcelas: '6× sem juros',
    preco: 174.50, frete: 12.90, total: 187.40, diff: 17.50,
    entrega: '3–5 dias', estoque: 'Em estoque', estoqueColor: 'text-gray-600',
  },
  {
    avatar: 'LA', avatarColor: 'bg-orange-500',
    nome: 'Loja Atleta', stars: 4, parcelas: '12× sem juros',
    preco: 179.00, frete: null, total: 179.00, diff: 9.10,
    entrega: '1–3 dias', estoque: 'Em estoque', estoqueColor: 'text-gray-600',
  },
  {
    avatar: 'B', avatarColor: 'bg-purple-600',
    nome: 'BodyMax', stars: 4, parcelas: '5× sem juros',
    preco: 184.90, frete: 9.90, total: 194.80, diff: 24.90,
    entrega: '4–7 dias', estoque: 'Últimas 4 unid.', estoqueColor: 'text-orange-500',
  },
  {
    avatar: 'MS', avatarColor: 'bg-blue-600',
    nome: 'MaxFit Shop', stars: 4, parcelas: 'À vista pix',
    preco: 189.90, frete: 14.90, total: 204.80, diff: 34.90,
    entrega: '5–8 dias', estoque: 'Sob encomenda', estoqueColor: 'text-gray-500',
  },
]

interface NutriRow { label: string; valor: string }

const nutricao: NutriRow[] = [
  { label: 'Valor energético', valor: '110 kcal' },
  { label: 'Proteínas', valor: '27 g' },
  { label: 'Carboidratos', valor: '1,2 g' },
  { label: 'Açúcares', valor: '0,5 g' },
  { label: 'Gorduras totais', valor: '0,8 g' },
  { label: 'Sódio', valor: '90 mg' },
  { label: 'BCAA', valor: '5,9 g' },
  { label: 'L-glutamina', valor: '4,1 g' },
]

// SVG chart points: 90-day price history (day → price in R$)
const chartPoints = [
  [0, 195], [8, 192], [18, 189.9], [28, 184], [38, 189.9],
  [48, 178], [58, 182], [68, 177], [78, 173], [88, 170], [90, 169.9],
]
const CHART_W = 600
const CHART_H = 150
const PRICE_MIN = 166
const PRICE_MAX = 199
const DAY_MAX = 90

function toSvg(day: number, price: number): [number, number] {
  const x = (day / DAY_MAX) * CHART_W
  const y = CHART_H - ((price - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * (CHART_H - 16) - 8
  return [Math.round(x), Math.round(y)]
}

const linePts = chartPoints.map(([d, p]) => toSvg(d, p).join(',')).join(' ')
const areaPts = [
  ...chartPoints.map(([d, p]) => toSvg(d, p).join(',')),
  `${CHART_W},${CHART_H}`, `0,${CHART_H}`,
].join(' ')

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.5
  const empty = 5 - full - (hasHalf ? 1 : 0)
  const cls = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5'

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={i} className={`${cls} fill-amber-400 text-amber-400`} />
      ))}
      {hasHalf && (
        <span className={`relative inline-block ${cls}`}>
          <Star className={`absolute inset-0 ${cls} text-amber-200`} />
          <span className="absolute inset-0 overflow-hidden" style={{ width: '60%' }}>
            <Star className={`${cls} fill-amber-400 text-amber-400`} />
          </span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className={`${cls} text-amber-200`} />
      ))}
    </div>
  )
}

function StoreStars({ count }: { count: number }) {
  return (
    <span className="text-amber-400 text-xs tracking-tight">
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function generateStaticParams() {
  return [{ slug: produto.slug }]
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <Header />

      {/* Breadcrumb */}
      <nav className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-1 text-xs text-gray-500 flex-wrap">
        <a href="/" className="hover:text-green-600 transition-colors">Suplementos</a>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <a href="/categoria/proteinas" className="hover:text-green-600 transition-colors">Proteínas</a>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <a href="/categoria/whey-protein" className="hover:text-green-600 transition-colors">Whey Protein</a>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <span className="text-gray-800 font-medium">Atlas Whey Iso 900g Baunilha</span>
      </nav>

      <main className="max-w-7xl mx-auto px-4 pb-12">

        {/* ── Main product section ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-8 mb-10">

          {/* Left — image + thumbnails */}
          <div>
            <div className="flex gap-2 mb-3 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">
                ● Menor preço 90d
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-700">
                -{produto.desconto}% vs. mês anterior
              </span>
            </div>

            {/* Main image */}
            <div className="bg-gray-100 rounded-2xl aspect-square flex items-center justify-center mb-3 border border-gray-200">
              <span className="text-gray-400 text-sm font-medium select-none">
                atlas iso 900g · product render
              </span>
            </div>

            {/* Thumbnails */}
            <div className="grid grid-cols-4 gap-2">
              {['thumb_01', 'thumb_02', 'thumb_03', 'thumb_04'].map((label) => (
                <button
                  key={label}
                  className="bg-gray-100 rounded-xl aspect-square flex items-center justify-center border-2 border-transparent hover:border-green-600 transition-colors"
                >
                  <span className="text-gray-400 text-[10px] font-medium select-none">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right — product details */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold tracking-widest text-green-600 uppercase mb-1">
                {produto.marca}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 leading-tight">
                {produto.nome}
              </h1>
            </div>

            {/* Rating row */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StarRating rating={produto.rating} size="md" />
              <span className="font-semibold text-gray-800">{produto.rating}</span>
              <span className="text-gray-400">({produto.avaliacoes.toLocaleString('pt-BR')} avaliações)</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400 text-xs">SKU {produto.sku}</span>
            </div>

            {/* Store badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Menor preço encontrado em 5 lojas</span>
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">N</div>
            </div>

            {/* Pricing */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 line-through text-base">
                  R${produto.preco_original.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-600 text-white">
                  -{produto.desconto}%
                </span>
              </div>
              <p className="text-4xl font-bold text-green-600">
                R${produto.preco_atual.toFixed(2).replace('.', ',')}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                ou 10× R$16,99 sem juros · frete grátis
              </p>
            </div>

            {/* CTA row */}
            <div className="flex gap-2">
              <button className="flex-1 py-3.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
                Comprar na NutriPrime →
              </button>
              <button className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors">
                <Heart className="w-5 h-5" />
              </button>
              <button className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 hover:border-green-600 hover:text-green-600 transition-colors">
                <Bell className="w-5 h-5" />
              </button>
            </div>

            {/* Trust seals */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>✓ Compra segura</span>
              <span>✓ Link de afiliado</span>
              <span>✓ Atualizado há 12 min</span>
            </div>

            {/* Metrics grid */}
            <div className="flex border border-gray-100 rounded-xl overflow-hidden">
              {[
                { label: 'PROTEÍNA/DOSE', value: `${produto.proteina_por_dose} g` },
                { label: 'DOSES', value: `${produto.doses} porções` },
                { label: 'R$/DOSE', value: `${produto.preco_por_dose.toFixed(2).replace('.', ',')} reais` },
                { label: 'CUSTO-BENEFÍCIO', value: `${produto.score}/10` },
              ].map((m, i) => (
                <div
                  key={m.label}
                  className={`flex-1 p-3 text-center ${i > 0 ? 'border-l border-gray-100' : ''}`}
                >
                  <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 leading-tight mb-1">
                    {m.label}
                  </p>
                  <p className="text-sm font-bold text-gray-800 leading-tight">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Store comparison table ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-10">
          <div className="p-5 border-b border-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Comparar em 5 lojas</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Preços atualizados automaticamente a cada 30 minutos · ordem por preço total
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  ⚙ Filtrar
                </button>
                <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  Ordenar por: Total ▾
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['LOJA', 'PREÇO', 'FRETE', 'TOTAL', 'ENTREGA', 'AÇÃO'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lojas.map((loja, i) => (
                  <tr
                    key={loja.nome}
                    className={`border-b border-gray-50 last:border-0 ${loja.melhorPreco ? 'bg-green-50' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    {/* Loja */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${loja.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {loja.avatar}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-800">{loja.nome}</span>
                            {loja.melhorPreco && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-600 text-white">
                                MENOR PREÇO
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <StoreStars count={loja.stars} />
                            <span className="text-[10px] text-gray-400">· {loja.parcelas}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Preço */}
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                      R${loja.preco.toFixed(2).replace('.', ',')}
                    </td>

                    {/* Frete */}
                    <td className="px-4 py-3 text-sm">
                      {loja.frete === null
                        ? <span className="text-green-600 font-semibold">Grátis</span>
                        : <span className="text-gray-600">R${loja.frete.toFixed(2).replace('.', ',')}</span>
                      }
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-gray-800">
                        R${loja.total.toFixed(2).replace('.', ',')}
                      </p>
                      {loja.diff !== null && (
                        <p className="text-[10px] text-gray-400">
                          +R${loja.diff.toFixed(2).replace('.', ',')}
                        </p>
                      )}
                    </td>

                    {/* Entrega */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-600">{loja.entrega}</p>
                      <p className={`text-[10px] font-semibold ${loja.estoqueColor}`}>{loja.estoque}</p>
                    </td>

                    {/* Ação */}
                    <td className="px-4 py-3">
                      <a
                        href={`/go/${produto.slug}-${i}`}
                        className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                          loja.melhorPreco
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'border border-gray-200 text-gray-700 hover:border-green-600 hover:text-green-600'
                        }`}
                      >
                        Comprar →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-5 py-3 text-[10px] text-gray-400 border-t border-gray-50">
            Preços e disponibilidade podem variar. ComparaSuple pode receber comissão de afiliado nas lojas listadas, sem custo extra para você.
          </p>
        </div>

        {/* ── Lower section ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Price history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-0.5">Histórico de preço</h2>
            <p className="text-xs text-gray-400 mb-4">Menor preço da NutriPrime nos últimos 90 dias</p>

            {/* Tabs */}
            <div className="flex gap-1 mb-5">
              {['30d', '90d', '6m', '1a', 'Tudo'].map(tab => (
                <button
                  key={tab}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    tab === '90d'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Metric row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Atual', value: 'R$169,90', color: 'text-green-600' },
                { label: 'Mínimo 90d', value: 'R$169,90', color: 'text-gray-800' },
                { label: 'Máximo 90d', value: 'R$195,00', color: 'text-gray-800' },
                { label: 'Variação 30d', value: '↘ R$8,10', color: 'text-green-600' },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{m.label}</p>
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* SVG chart */}
            <div className="rounded-xl overflow-hidden bg-gray-50 border border-gray-100 mb-4">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="w-full"
                style={{ height: 140 }}
                preserveAspectRatio="none"
              >
                {/* Area fill */}
                <polygon
                  points={areaPts}
                  fill="#16a34a"
                  fillOpacity="0.08"
                />
                {/* Line */}
                <polyline
                  points={linePts}
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Current price dot */}
                <circle cx={CHART_W} cy={toSvg(90, 169.9)[1]} r="5" fill="#16a34a" />
                <circle cx={CHART_W} cy={toSvg(90, 169.9)[1]} r="9" fill="#16a34a" fillOpacity="0.2" />
              </svg>
            </div>

            {/* Analysis */}
            <div className="flex gap-2 items-start p-3 bg-green-50 rounded-xl mb-4">
              <span className="text-green-600 shrink-0">✓</span>
              <p className="text-xs text-green-800 leading-relaxed">
                Bom momento para comprar. O preço está 11% abaixo da média do trimestre e atingiu o menor valor em 90 dias hoje.
              </p>
            </div>

            <button className="w-full py-2.5 border-2 border-green-600 text-green-600 rounded-xl text-sm font-semibold hover:bg-green-50 transition-colors flex items-center justify-center gap-2">
              <Bell className="w-4 h-4" />
              Avisar quando baixar
            </button>
          </div>

          {/* Nutritional info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-0.5">Informação nutricional</h2>
            <p className="text-xs text-gray-400 mb-4">Por dose (30g)</p>

            <table className="w-full">
              <tbody>
                {nutricao.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-3 py-2.5 text-sm text-gray-600 rounded-l-lg">{row.label}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-gray-800 text-right rounded-r-lg">{row.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── CTA card ─────────────────────────────────────────────────────────── */}
      <section className="bg-green-900 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center gap-5">
          <span className="text-4xl">⚖</span>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg font-bold text-white mb-1">Compare com outras whey</h3>
            <p className="text-green-200 text-sm leading-relaxed">
              Adicione até 3 produtos lado-a-lado para comparar proteína, preço por dose e score.
            </p>
          </div>
          <a
            href="/comparar"
            className="shrink-0 px-6 py-3 bg-white text-green-900 font-bold text-sm rounded-xl hover:bg-green-50 transition-colors whitespace-nowrap"
          >
            Abrir comparador →
          </a>
        </div>
      </section>
    </div>
  )
}
