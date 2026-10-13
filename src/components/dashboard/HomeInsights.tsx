'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchHistorySince, updateHistoryEntry } from '@/lib/services/history'
import { fetchInventory } from '@/lib/services/inventory'
import { fetchWeekPlanner, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import type { CookingHistory, Inventory, WeeklyPlanner } from '@/types'
import { LOCATIONS } from '@/types'
import { CenterModal, LoadingState } from '@/components/ui/freedomus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AlarmClock, Archive, ChartColumn, Flame, Loader2, Star, Timer, type LucideIcon } from 'lucide-react'

type MealKey = 'desayuno' | 'almuerzo' | 'cena'

// Mismos colores que el Planificador; paleta validada (CVD + contraste) sobre blanco
const MEALS: { key: MealKey; label: string; color: string }[] = [
  { key: 'desayuno', label: 'Desayuno', color: '#c2410c' },
  { key: 'almuerzo', label: 'Almuerzo', color: '#2f7a4a' },
  { key: 'cena', label: 'Cena', color: '#7b4fa3' },
]
const isMeal = (m: string): m is MealKey => m === 'desayuno' || m === 'almuerzo' || m === 'cena'

const pad = (n: number) => String(n).padStart(2, '0')
const formatHour = (h: number) => { const m = Math.round(h * 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}` }
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function lastSevenDays(): Date[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - 6 + i); return d })
}

const MEAL_ORDER: MealKey[] = ['desayuno', 'almuerzo', 'cena']
const mealByHour = (d: Date): MealKey => { const h = d.getHours(); return h < 11 ? 'desayuno' : h < 17 ? 'almuerzo' : 'cena' }

// Comida de cada registro: la guardada al cocinar (meal_type) si existe. Si no
// (registros antiguos o manuales), se deduce por día:
// 1. Si la receta estaba en el planificador ese día, esa comida; si no, la de su hora.
// 2. Dentro del día las comidas van en orden (desayuno → almuerzo → cena): si el planificador
//    contradice ese orden (p. ej. "desayuno" cocinado después del almuerzo), manda la hora.
function resolveMeals(history: CookingHistory[], plans: WeeklyPlanner[]): Map<string, MealKey> {
  const byDay = new Map<string, CookingHistory[]>()
  history.forEach(h => {
    const k = dayKey(new Date(h.cooked_at))
    byDay.set(k, [...(byDay.get(k) ?? []), h])
  })
  const result = new Map<string, MealKey>()
  byDay.forEach(entries => {
    let prev = 0
    entries
      .sort((a, b) => a.cooked_at.localeCompare(b.cooked_at))
      .forEach(h => {
        const d = new Date(h.cooked_at)
        const week = formatWeekStart(getWeekStart(d))
        const dow = (d.getDay() + 6) % 7
        const planned = plans.find(p => p.week_start_date === week && p.day_of_week === dow && p.recipe_id === h.recipe_id)
        // La comida guardada al cocinar es definitiva; las deducidas respetan el orden del día
        if (h.meal_type && isMeal(h.meal_type)) {
          prev = Math.max(prev, MEAL_ORDER.indexOf(h.meal_type))
          result.set(h.id, h.meal_type)
          return
        }
        const tentative = planned && isMeal(planned.meal_type) ? planned.meal_type : mealByHour(d)
        const idx = MEAL_ORDER.indexOf(tentative) >= prev
          ? MEAL_ORDER.indexOf(tentative)
          : Math.max(prev, MEAL_ORDER.indexOf(mealByHour(d)))
        prev = idx
        result.set(h.id, MEAL_ORDER[idx])
      })
  })
  return result
}

function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return Math.ceil((new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
}

function InfoCard({ icon: Icon, title, subtitle, href, className, children }: {
  icon: LucideIcon; title: string; subtitle?: string; href?: string; className?: string; children: React.ReactNode
}) {
  const header = (
    <div className="flex items-center gap-3">
      <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-white/70 text-forest">
        <Icon className="size-5 stroke-[1.9]" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-[21px] leading-tight font-bold">{title}</p>
        {subtitle && <p className="text-[13px] text-ink-2">{subtitle}</p>}
      </div>
    </div>
  )
  return (
    <section className={cn('flex min-h-[170px] flex-col gap-4 rounded-[28px] p-5 shadow-tile', className)}>
      {href ? <Link href={href} className="w-fit hover:opacity-80">{header}</Link> : header}
      {children}
    </section>
  )
}

type MealPoint = { hour: number; names: string[] } | null

// Gráfica de líneas: X = día, Y = hora del día; una línea por comida (se corta si falta un día)
function MealTimesChart({ days, bars, onSelectDay }: { days: Date[]; bars: MealPoint[][]; onSelectDay?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 240, L = 48, R = 16, T = 12, B = 40
  const plotW = Math.max(0, width - L - R), plotH = H - T - B
  const n = days.length
  const x = (i: number) => L + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2)

  // Dominio ajustado a los datos (±1 h, mínimo 6 h), alineado a las marcas del eje
  const values = bars.flat().filter((p): p is NonNullable<MealPoint> => !!p).map(p => p.hour)
  const rawLo = values.length ? Math.max(0, Math.min(...values) - 1) : 6
  const rawHi = values.length ? Math.min(24, Math.max(...values) + 1) : 24
  const step = rawHi - rawLo > 12 ? 4 : 2
  const lo = Math.floor(rawLo / step) * step
  const hi = Math.max(lo + 6, Math.min(24, Math.ceil(rawHi / step) * step))
  // Eje invertido: el día empieza arriba (desayuno) y termina abajo (cena)
  const y = (h: number) => T + ((h - lo) / (hi - lo)) * plotH
  const ticks: number[] = []
  for (let h = lo; h <= hi; h += step) ticks.push(h)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }} aria-hidden="true" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="block">
          {/* Franjas alternas por día y separadores blancos */}
          {days.slice(0, -1).map((_, i) => (
            <rect key={i} x={x(i)} y={T} width={x(i + 1) - x(i)} height={plotH} fill={i % 2 ? '#e4ebdc' : '#f1f5ec'} />
          ))}
          {days.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={T} y2={T + plotH} stroke="#fff" strokeWidth={2} />)}

          {/* Eje Y */}
          {ticks.map(h => (
            <text key={h} x={L - 10} y={y(h)} textAnchor="end" dominantBaseline="middle" className="fill-ink-5 text-[11px]">{pad(h)}:00</text>
          ))}

          {/* Línea vertical del día bajo el cursor */}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + plotH} stroke="#17251c" strokeOpacity={0.25} strokeWidth={1.5} />}

          {/* Líneas y puntos por comida */}
          {MEALS.map((m, mi) => {
            const pts = days.map((_, di) => bars[di][mi])
            let d = ''
            pts.forEach((p, di) => {
              if (!p) return
              d += `${di > 0 && pts[di - 1] ? 'L' : 'M'}${x(di)},${y(p.hour)} `
            })
            return (
              <g key={m.key}>
                <path d={d} fill="none" stroke={m.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, di) => p && (
                  <circle key={di} cx={x(di)} cy={y(p.hour)} r={hover === di ? 5.5 : 4} fill={m.color} stroke="#fff" strokeWidth={2} />
                ))}
              </g>
            )
          })}

          {/* Eje X: días */}
          {days.map((d, i) => {
            const isToday = d.getTime() === today.getTime()
            return (
              <g key={i}>
                <text x={x(i)} y={T + plotH + 16} textAnchor="middle" className="fill-ink-5 text-[11px] uppercase">
                  {d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
                </text>
                {isToday && <circle cx={x(i)} cy={T + plotH + 30} r={10} fill="#17251c" />}
                <text x={x(i)} y={T + plotH + 30} textAnchor="middle" dominantBaseline="middle"
                  className={cn('text-[11.5px] font-semibold', isToday ? 'fill-lime' : 'fill-foreground')}>{d.getDate()}</text>
              </g>
            )
          })}

          {/* Zonas de hover (más anchas que los puntos) */}
          {days.map((_, i) => {
            const half = (n > 1 ? plotW / (n - 1) : plotW) / 2
            return <rect key={i} x={x(i) - half} y={0} width={half * 2} height={H} fill="transparent" onMouseEnter={() => setHover(i)}
              onClick={() => onSelectDay?.(i)} className={onSelectDay ? 'cursor-pointer' : undefined} />
          })}
        </svg>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-xl bg-forest px-3 py-2 text-xs text-[#f3f7ec] shadow-tile"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
        >
          <p className="mb-1 font-semibold capitalize">{days[hover].toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}</p>
          {MEALS.map((m, mi) => {
            const p = bars[hover][mi]
            return (
              <p key={m.key} className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="text-white/70">{m.label}</span>
                <span className="ml-auto pl-3 font-semibold">{p ? formatHour(p.hour) : '—'}</span>
              </p>
            )
          })}
          {onSelectDay && <p className="mt-1.5 text-[11px] text-lime">Clic para ajustar horas</p>}
        </div>
      )}
    </div>
  )
}

export default function HomeInsights() {
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<CookingHistory[]>([])
  const [plans, setPlans] = useState<WeeklyPlanner[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [days] = useState(lastSevenDays)
  // TEMPORAL (pruebas): ajustar la hora de las comidas de un día desde la gráfica
  const [editDay, setEditDay] = useState<number | null>(null)
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})
  const [savingTimes, setSavingTimes] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) { setLoading(false); return }
      try {
        const weeks = [...new Set(days.map(d => formatWeekStart(getWeekStart(d))))]
        const [hist, inv, ...weekPlans] = await Promise.all([
          fetchHistorySince(uid, days[0]),
          fetchInventory(uid),
          ...weeks.map(w => fetchWeekPlanner(uid, w)),
        ])
        setHistory(hist); setInventory(inv); setPlans(weekPlans.flat())
      } catch (err) {
        console.error('HomeInsights load failed', err)
      } finally { setLoading(false) }
    })
  }, [days])

  // ── Hora de las comidas (últimos 7 días) ──
  const mealOf = resolveMeals(history, plans)
  const cells = new Map<string, { hours: number[]; names: string[] }>()
  history.forEach(h => {
    const d = new Date(h.cooked_at)
    const key = `${dayKey(d)}|${mealOf.get(h.id)}`
    const cell = cells.get(key) ?? { hours: [], names: [] }
    cell.hours.push(d.getHours() + d.getMinutes() / 60)
    cell.names.push(h.recipe?.name ?? 'Receta')
    cells.set(key, cell)
  })
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const bars = days.map(d => MEALS.map(m => {
    const cell = cells.get(`${dayKey(d)}|${m.key}`)
    return cell ? { hour: avg(cell.hours), names: cell.names } : null
  }))
  const mealAverages = MEALS.map((m, i) => {
    const hours = bars.map(day => day[i]?.hour).filter((h): h is number => h !== undefined)
    return hours.length ? avg(hours) : null
  })

  // ── Resumen de la semana ──
  const rated = history.filter(h => h.rating != null)
  const avgRating = rated.length ? avg(rated.map(h => h.rating!)) : null
  const minutes = history.reduce((s, h) => s + (h.actual_time_minutes ?? 0), 0)

  // ── Inventario ──
  const expiring = inventory
    .filter(i => i.expiration_date && daysUntil(i.expiration_date) <= 7)
    .sort((a, b) => a.expiration_date!.localeCompare(b.expiration_date!))
  const byLocation = LOCATIONS.map(loc => ({ loc, count: inventory.filter(i => i.location === loc).length }))

  // TEMPORAL (pruebas)
  const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayEntries = editDay === null ? [] : history
    .filter(h => dayKey(new Date(h.cooked_at)) === dayKey(days[editDay]))
    .map(h => ({ h, meal: MEALS.find(m => m.key === mealOf.get(h.id))! }))

  function openDayEditor(i: number) {
    setEditDay(i)
    setTimeDrafts(Object.fromEntries(history
      .filter(h => dayKey(new Date(h.cooked_at)) === dayKey(days[i]))
      .map(h => [h.id, toTimeInput(new Date(h.cooked_at))])))
  }

  async function saveDayTimes() {
    setSavingTimes(true)
    try {
      const changed = dayEntries.filter(({ h }) => timeDrafts[h.id] && timeDrafts[h.id] !== toTimeInput(new Date(h.cooked_at)))
      const updated = await Promise.all(changed.map(({ h }) => {
        const [hh, mm] = timeDrafts[h.id].split(':').map(Number)
        const d = new Date(h.cooked_at); d.setHours(hh, mm, 0, 0)
        return updateHistoryEntry(h.id, { cooked_at: d.toISOString() })
      }))
      setHistory(prev => prev.map(h => updated.find(u => u.id === h.id) ?? h))
      setEditDay(null)
    } catch (err) {
      console.error('updateHistoryEntry failed', err)
      alert('No se pudieron guardar las horas.')
    } finally { setSavingTimes(false) }
  }

  return (
    <>
      {/* Caducan pronto */}
      <InfoCard icon={AlarmClock} title="Caducan pronto" subtitle="Próximos 7 días" href="/dashboard/inventory" className="bg-peach lg:row-span-2">
        {loading ? <LoadingState className="py-6" /> : expiring.length === 0 ? (
          <p className="mt-auto text-[13.5px] text-ink-2">Nada caduca esta semana. Todo en buen estado.</p>
        ) : (
          <div className="mt-auto flex flex-col gap-2">
            {expiring.slice(0, 5).map(item => {
              const d = daysUntil(item.expiration_date!)
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.product?.name ?? '—'}</p>
                    <p className="text-xs text-ink-2">{item.quantity} {item.unit} · {item.location}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', d <= 2 ? 'bg-danger-soft text-danger' : 'bg-white text-ink-2')}>
                    {d < 0 ? 'Caducado' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `${d} días`}
                  </span>
                </div>
              )
            })}
            {expiring.length > 5 && <p className="px-1 text-xs text-ink-2">+{expiring.length - 5} más en el inventario</p>}
          </div>
        )}
      </InfoCard>

      {/* Resumen de los últimos 7 días */}
      <InfoCard icon={Flame} title="Últimos 7 días" href="/dashboard/history" className="bg-butter">
        {loading ? <LoadingState className="py-4" /> : (
          <div className="mt-auto flex flex-col gap-2">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em]">{history.length}</span>
              <span className="text-[13.5px] text-ink-2">{history.length === 1 ? 'comida cocinada' : 'comidas cocinadas'}</span>
            </p>
            <div className="flex flex-wrap gap-2 text-[12.5px] text-ink-2">
              <span className="flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-0.5"><Timer className="size-3" />{minutes} min</span>
              <span className="flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-0.5"><Star className="size-3 fill-star text-star" />{avgRating != null ? avgRating.toFixed(1) : '–'} media</span>
            </div>
          </div>
        )}
      </InfoCard>

      {/* Inventario por ubicación */}
      <InfoCard icon={Archive} title="Inventario" subtitle={loading ? undefined : `${inventory.length} productos`} href="/dashboard/inventory" className="bg-sky">
        {loading ? <LoadingState className="py-4" /> : (
          <div className="mt-auto grid grid-cols-3 gap-2">
            {byLocation.map(({ loc, count }) => (
              <div key={loc} className="flex flex-col rounded-2xl bg-white/60 px-3 py-2">
                <span className="font-display text-2xl leading-none font-extrabold">{count}</span>
                <span className="mt-1 truncate text-[11.5px] text-ink-2">{loc}</span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Hora de las comidas */}
      <InfoCard icon={ChartColumn} title="Hora de las comidas" subtitle="A qué hora se cocinó cada comida · últimos 7 días" className="bg-card sm:col-span-2 lg:col-span-4">
        {loading ? <LoadingState className="py-10" /> : (
          <div className="flex flex-col gap-4">
            {/* Leyenda + promedios */}
            <div className="flex flex-wrap gap-2">
              {MEALS.map((m, i) => (
                <div key={m.key} className="flex items-center gap-2 rounded-full bg-sage px-3 py-1.5 text-[13px]">
                  <span className="size-2.5 rounded-full" style={{ background: m.color }} />
                  <span className="text-ink-3">{m.label}</span>
                  <span className="font-semibold text-foreground">{mealAverages[i] != null ? `media ${formatHour(mealAverages[i]!)}` : 'sin datos'}</span>
                </div>
              ))}
            </div>

            <MealTimesChart days={days} bars={bars} onSelectDay={openDayEditor} />

            {/* Vista de tabla para lectores de pantalla */}
            <table className="sr-only">
              <caption>Hora a la que se cocinó cada comida en los últimos 7 días</caption>
              <thead><tr><th>Día</th>{MEALS.map(m => <th key={m.key}>{m.label}</th>)}</tr></thead>
              <tbody>
                {days.map((d, di) => (
                  <tr key={d.getTime()}>
                    <th>{d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}</th>
                    {bars[di].map((bar, mi) => <td key={mi}>{bar ? formatHour(bar.hour) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </InfoCard>

      {/* TEMPORAL (pruebas): editor de horas del día */}
      {editDay !== null && (
        <CenterModal
          eyebrow="Pruebas"
          title="Ajustar horas"
          subtitle={days[editDay].toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          onClose={() => setEditDay(null)}
          footer={dayEntries.length > 0 ? <>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setEditDay(null)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={saveDayTimes} disabled={savingTimes}>
              {savingTimes && <Loader2 className="animate-spin" />} Guardar horas
            </Button>
          </> : undefined}
        >
          {dayEntries.length === 0 ? (
            <p className="text-sm text-ink-5">
              No hay comidas registradas este día. Puedes registrarlas desde <Link href="/dashboard/history" className="font-semibold text-leaf hover:underline">Historial</Link>.
            </p>
          ) : dayEntries.map(({ h, meal }) => (
            <div key={h.id} className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: meal.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-5">{meal.label}</p>
                <p className="truncate text-[15px] font-semibold">{h.recipe?.name ?? 'Receta'}</p>
              </div>
              <Input type="time" className="w-32" value={timeDrafts[h.id] ?? ''}
                onChange={e => setTimeDrafts(t => ({ ...t, [h.id]: e.target.value }))} />
            </div>
          ))}
        </CenterModal>
      )}
    </>
  )
}
