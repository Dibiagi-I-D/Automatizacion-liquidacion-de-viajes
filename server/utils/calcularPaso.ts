/**
 * LÓGICA DE NEGOCIO CENTRAL
 * 
 * Calcula el paso de un gasto según las reglas:
 * - PASO 1: Gastos en Argentina con importe menor a $100.000 ARS
 * - PASO 2: Gastos en Chile o Uruguay (cualquier importe) + Gastos en Argentina con importe >= $100.000 ARS
 */
export function calcularPaso(pais: string, importe: number): 1 | 2 {
  if (pais === 'ARG' && importe < 100000) {
    return 1
  }
  return 2
}
