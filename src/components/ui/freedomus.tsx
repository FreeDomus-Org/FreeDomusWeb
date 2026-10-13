// Piezas de UI del diseño FreeDomus (Claude Design) reutilizadas en todo el dashboard
import * as React from 'react'
import { Loader2, Search, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Eyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('font-mono text-xs tracking-[0.08em] text-leaf uppercase', className)} {...props} />
}

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-2 pt-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h1 className="font-display text-[32px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[40px]">{title}</h1>
        {subtitle && <p className="text-sm text-ink-5">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  )
}

/** Píldora de filtro: activa en bosque/lima, inactiva blanca (sobre el lienzo) o salvia (dentro de paneles). */
export function Chip({ active, tone = 'white', className, ...props }: React.ComponentProps<'button'> & { active?: boolean; tone?: 'white' | 'soft' }) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
        active ? 'bg-forest text-lime' : tone === 'white' ? 'bg-card text-ink-3 hover:bg-card/70' : 'bg-sage text-ink-3 hover:bg-sage-deep',
        className,
      )}
      {...props}
    />
  )
}

export function ChipRow({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap gap-1.5 px-1', className)} {...props} />
}

export function SearchField({ className, tone = 'white', ...props }: React.ComponentProps<'input'> & { tone?: 'white' | 'soft' }) {
  return (
    <div className={cn('flex h-[38px] w-full max-w-[340px] items-center gap-2.5 rounded-full px-3.5', tone === 'white' ? 'bg-card shadow-field' : 'bg-sage', className)}>
      <Search className="size-[18px] shrink-0 text-ink-4" />
      <input type="text" className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-ink-5" {...props} />
    </div>
  )
}

export function Field({ label, hint, className, children }: { label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold', className)}>
      <span className="flex items-baseline gap-2">{label}{hint && <span className="text-xs font-normal text-ink-4">{hint}</span>}</span>
      {children}
    </label>
  )
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  // La flecha viene de los estilos globales de <select> (globals.css)
  return (
    <select
      className={cn('h-11 w-full min-w-0 rounded-[14px] border-0 bg-input pr-10 pl-4 text-[15px] font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/25', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function TextArea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn('min-h-[110px] w-full resize-none rounded-[14px] border-0 bg-input px-4 py-3 text-[15px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/25', className)}
      {...props}
    />
  )
}

/** Botón redondo de icono: salvia (editar), rojo suave (borrar) o blanco. */
export function IconAction({ tone = 'soft', size = 'md', className, ...props }: React.ComponentProps<'button'> & { tone?: 'soft' | 'danger' | 'white' | 'dark'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      className={cn(
        'grid shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        size === 'sm' ? 'size-8' : size === 'md' ? 'size-9' : 'size-[38px]',
        tone === 'soft' && 'bg-sage text-foreground hover:bg-sage-deep',
        tone === 'danger' && 'bg-danger-soft text-danger hover:bg-[#ffd3cd]',
        tone === 'white' && 'bg-card text-foreground hover:bg-card/70',
        tone === 'dark' && 'bg-forest text-lime hover:bg-forest/90',
        className,
      )}
      {...props}
    />
  )
}

/** Panel lateral derecho (formularios de alta/edición). */
export function SidePanel({ eyebrow, title, subtitle, onClose, footer, wide, children }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; footer?: React.ReactNode; wide?: boolean; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-forest/45" onClick={onClose} />
      <aside className={cn('relative flex h-full w-full flex-col bg-card text-foreground shadow-drawer sm:rounded-l-[28px]', wide ? 'max-w-[500px]' : 'max-w-[440px]')}>
        <div className="flex items-center justify-between gap-4 px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-4 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2 className="mt-0.5 font-display text-[26px] leading-tight font-extrabold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-5">{subtitle}</p>}
          </div>
          <IconAction size="lg" onClick={onClose} aria-label="Cerrar"><X className="stroke-[2.4]" /></IconAction>
        </div>
        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-5 pt-1 pb-6 sm:px-7">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-canvas px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-7">{footer}</div>}
      </aside>
    </div>
  )
}

/** Modal centrado para acciones cortas. */
export function CenterModal({ eyebrow, title, subtitle, onClose, footer, children, className }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-forest/45" onClick={onClose} />
      <div className={cn('relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-[28px] bg-card text-foreground shadow-drawer', className)}>
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-3">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2 className="mt-0.5 font-display text-[22px] leading-tight font-extrabold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-5">{subtitle}</p>}
          </div>
          <IconAction size="lg" onClick={onClose} aria-label="Cerrar"><X className="stroke-[2.4]" /></IconAction>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-canvas px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 py-10 text-center text-[15px] text-ink-5', className)}>{children}</div>
}

export function LoadingState({ className }: { className?: string }) {
  return <div className={cn('flex justify-center py-12', className)}><Loader2 className="size-6 animate-spin text-leaf" /></div>
}

/** Fila de 5 estrellas; con onChange se vuelve interactiva. */
export function Stars({ value, onChange, size = 18 }: { value: number | null; onChange?: (n: number | null) => void; size?: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const on = (value ?? 0) >= n
        const icon = <Star style={{ width: size, height: size }} className={cn('stroke-[1.6]', on ? 'fill-star text-star' : onChange ? 'text-ink-6' : 'fill-disabled text-disabled')} />
        return onChange
          ? <button key={n} type="button" className="cursor-pointer" onClick={() => onChange(value === n ? null : n)}>{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </div>
  )
}

export function StatTile({ value, label, tone = 'white' }: { value: React.ReactNode; label: React.ReactNode; tone?: 'white' | 'danger' | 'lime' | 'sky' }) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-[20px] px-4 py-3.5',
      tone === 'white' && 'bg-card', tone === 'danger' && 'bg-danger-soft', tone === 'lime' && 'bg-lime', tone === 'sky' && 'bg-sky')}>
      <span className={cn('font-display text-[28px] leading-none font-extrabold',
        tone === 'white' && 'text-forest', tone === 'danger' && 'text-danger', tone === 'lime' && 'text-lime-ink', tone === 'sky' && 'text-sky-ink')}>{value}</span>
      <span className="text-[12.5px] text-ink-2">{label}</span>
    </div>
  )
}
