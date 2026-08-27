/**
 * CATÁLOGO DE PROVEEDORES SOFTLAND
 *
 * En CORMVI la columna PROVEEDOR (`CORMVI_NROCTA`) es un número de cuenta, no
 * un nombre. Pero el OCR devuelve la razón social que reconoce en el ticket, y
 * así quedó guardado en `dbo.gastos_viaje.codigo_proveedor`.
 *
 * Este catálogo traduce de un lado al otro: en pantalla se muestra el número
 * con el nombre debajo, y al copiar a Softland viaja únicamente el número.
 *
 * Debe mantenerse sincronizado con la tabla de proveedores del prompt de
 * server/routes/ocr.ts.
 */

export interface Proveedor {
  codigo: string        // Nº de cuenta en Softland (CORMVI_NROCTA)
  nombre: string        // Razón social / descripción
  concepto?: string     // Categoría típica, solo informativa
}

export const PROVEEDORES: Proveedor[] = [
  { codigo: '103', nombre: 'Dirección Nacional de Migraciones', concepto: 'TARIFA-2'  },
  { codigo: '03',  nombre: 'Autopistas del Sol / Ausol',        concepto: 'TARIFA-5'  },
  { codigo: '404', nombre: 'SENASA - Servicio Desinfección',    concepto: 'TARIFA-10' },
  { codigo: '8',   nombre: 'Red de Peajes Varios',              concepto: 'TARIFA-5'  },
  { codigo: '13',  nombre: 'Túnel Cristo Redentor Concesión',   concepto: 'TARIFA-1'  },
  { codigo: '177', nombre: 'ATA / Despachantes de Aduana',      concepto: 'HONPRO-4'  },
  { codigo: '142', nombre: 'Gestores / Profesionales Varios',   concepto: 'HONPRO-6'  },
  { codigo: '00',  nombre: 'Proveedores Informales Genéricos',  concepto: 'TARIFA-14' },
  { codigo: '410', nombre: 'Concesionaria Peaje Mendoza',       concepto: 'TARIFA-5'  },
  { codigo: '210', nombre: 'Gomerías / Servicios Neumáticos',   concepto: 'NEUMAT-3'  },
  { codigo: '305', nombre: 'Iscamen - Control Fitosanitario',   concepto: 'TARIFA-7'  },
  { codigo: '500', nombre: 'Restaurantes / Comidas en ruta',    concepto: 'TARIFA-12' },
  { codigo: '600', nombre: 'Estacionamientos',                  concepto: 'TARIFA-13' },
  { codigo: '700', nombre: 'Docwell / Alquileres',              concepto: 'HONPRO-5'  },
  { codigo: '800', nombre: 'Servicios Aduaneros Varios',        concepto: 'HONPRO-3'  },
]

/** Normaliza para comparar: sin acentos, sin signos, en minúsculas. */
function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PORCODIGO = new Map(PROVEEDORES.map(p => [normalizar(p.codigo), p]))
const PORNOMBRE = new Map(PROVEEDORES.map(p => [normalizar(p.nombre), p]))

/**
 * Resuelve lo que haya guardado en `codigoProveedor` —un número o una razón
 * social— y devuelve las dos formas.
 *
 * Si el valor no está en el catálogo se devuelve tal cual: puede ser un número
 * de cuenta válido que todavía no cargamos acá, y no hay que perderlo.
 */
export function resolverProveedor(valor: unknown): { codigo: string; nombre: string; conocido: boolean } {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return { codigo: '', nombre: '', conocido: false }

  const clave = normalizar(bruto)

  const porCodigo = PORCODIGO.get(clave)
  if (porCodigo) return { codigo: porCodigo.codigo, nombre: porCodigo.nombre, conocido: true }

  const porNombre = PORNOMBRE.get(clave)
  if (porNombre) return { codigo: porNombre.codigo, nombre: porNombre.nombre, conocido: true }

  // Coincidencia parcial: el OCR a veces devuelve el nombre recortado o con
  // agregados ("Autopistas del Sol S.A." en vez de "Autopistas del Sol / Ausol")
  const parcial = PROVEEDORES.find(p => {
    const n = normalizar(p.nombre)
    return n.includes(clave) || clave.includes(n.split(' ')[0] + ' ' + (n.split(' ')[1] || ''))
  })
  if (parcial) return { codigo: parcial.codigo, nombre: parcial.nombre, conocido: true }

  // Si es puramente numérico lo tomamos como código de cuenta sin catalogar
  if (/^\d+$/.test(bruto)) return { codigo: bruto, nombre: '', conocido: false }

  return { codigo: '', nombre: bruto, conocido: false }
}

/** Solo el número de cuenta, que es lo que va a la columna PROVEEDOR de CORMVI. */
export function codigoProveedorSoftland(valor: unknown): string {
  return resolverProveedor(valor).codigo
}
