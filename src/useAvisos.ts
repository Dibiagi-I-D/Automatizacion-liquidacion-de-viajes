import { useState, useCallback } from 'react'
import { AVISOS, type Aviso } from './avisos'

// Lleva la cuenta de qué avisos ya vio esta persona.
//
// Se guarda en localStorage y no en el servidor a propósito: el aviso aparece
// en el login, o sea antes de saber quién está entrando.
//
// Consecuencia a tener en cuenta: la marca es por navegador y por dispositivo.
// Si un chofer usa el celular de otro, el aviso le vuelve a aparecer — y si
// comparten uno, el segundo no lo ve. Para un aviso operativo como este es un
// mal menor; mostrarlo de más es preferible a que alguien no se entere.

const CLAVE = 'gastos_avisos_vistos'

const leerVistos = (): string[] => {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || '[]')
    return Array.isArray(guardado) ? guardado : []
  } catch {
    // localStorage bloqueado o dato corrupto: se trata como "no vio nada"
    return []
  }
}

export function useAvisos() {
  const [vistos, setVistos] = useState<string[]>(leerVistos)

  const sinLeer: Aviso[] = AVISOS.filter((a) => !vistos.includes(a.id))
  // Solo frena la entrada el que está marcado como bloqueante
  const hayBloqueante = sinLeer.some((a) => a.bloqueante)

  const marcarTodosVistos = useCallback(() => {
    const ids = AVISOS.map((a) => a.id)
    setVistos(ids)
    try {
      localStorage.setItem(CLAVE, JSON.stringify(ids))
    } catch {
      // Si no se puede guardar, el aviso volverá a aparecer. Molesta, no rompe.
    }
  }, [])

  return { avisos: AVISOS, sinLeer, hayBloqueante, marcarTodosVistos }
}
