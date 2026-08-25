import { BANDERAS, TotalPorPais, formatMonto } from '../types'

interface Props {
  totales: TotalPorPais[]
  /** 'lg' para el total principal de una pantalla, 'sm' para totales dentro de una tarjeta */
  size?: 'lg' | 'sm'
  /** Texto cuando no hay ningún gasto todavía */
  vacio?: string
  className?: string
}

/**
 * Muestra un total por cada moneda presente, nunca uno unificado.
 * Los importes de distintos países no son sumables entre sí, así que
 * cada uno se presenta como una fila independiente con su bandera y moneda.
 */
export default function TotalesPorMoneda({ totales, size = 'sm', vacio = 'Sin gastos', className = '' }: Props) {
  if (totales.length === 0) {
    return <p className={`text-gray-600 ${size === 'lg' ? 'text-sm' : 'text-xs'} ${className}`}>{vacio}</p>
  }

  const esGrande = size === 'lg'

  return (
    <div className={`flex flex-col ${esGrande ? 'gap-2' : 'gap-1'} ${className}`}>
      {totales.map(t => (
        <div key={t.pais} className="flex items-baseline justify-between gap-3">
          <span className={`flex items-center gap-1.5 text-gray-500 ${esGrande ? 'text-xs' : 'text-[11px]'}`}>
            <span aria-hidden="true">{BANDERAS[t.pais]}</span>
            <span className="font-medium tracking-wide">{t.moneda}</span>
            <span className="text-gray-600">· {t.cantidad}</span>
          </span>
          <span
            className={`font-semibold text-emerald-400 tabular-nums ${esGrande ? 'text-xl' : 'text-sm'}`}
          >
            $ {formatMonto(t.total)}
          </span>
        </div>
      ))}
    </div>
  )
}
