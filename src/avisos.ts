// ═══════════════════════════════════════════════════════════════════════
//  AVISOS — el mensaje que ve la gente al entrar después de un cambio
// ═══════════════════════════════════════════════════════════════════════
//
//  CÓMO SE USA
//  Antes de hacer el commit, agregá una entrada ARRIBA DE TODO en la lista.
//  Al desplegar, a cada persona le va a aparecer una sola vez al abrir la app.
//  Después queda en la campanita del login para poder releerla.
//
//  Si el cambio no vale la pena contarlo (un arreglo chico, un typo), no
//  agregues nada: sin entrada nueva, nadie ve ningún aviso.
//
//  EL `id` ES LO QUE MANDA
//  Es lo que decide si alguien ya lo vio o no, así que tiene que ser único
//  y NO se puede reutilizar. Si cambiás el texto de una entrada ya publicada
//  sin cambiarle el id, a quien ya la vio no le vuelve a aparecer.
//  Formato sugerido: fecha + tema, ej. '2026-10-06-lectura-de-fotos'.
//
//  `bloqueante: true` oscurece la pantalla y no deja entrar hasta leerlo.
//  Reservalo para lo que la gente TIENE que saber antes de usar la app; para
//  lo informativo, dejalo en false y aparece en la campanita sin molestar.
//
//  OJO CON EL NOMBRE
//  Esto son avisos de la APLICACIÓN. No confundir con las "Novedades" de la
//  app, que son las incidencias de los vehículos (ver pages/Novedades.tsx).
// ═══════════════════════════════════════════════════════════════════════

export interface Aviso {
  id: string;
  fecha: string;
  titulo: string;
  detalle: string[];
  bloqueante?: boolean;
}

export const AVISOS: Aviso[] = [
  {
    id: '2026-11-25-puesta-en-marcha-y-capacitacion v1',
    fecha: '25/11/2026',
    titulo: 'La app ya está en funcionamiento de forma oficial',
    bloqueante: true,
    detalle: [
      '¡Hola! 👋 Somos de DIBIAGI, sector Implementación y Desarrollo.',
      'A partir de ahora la app queda habilitada formalmente para el uso de todos los días: la carga de gastos y el aviso de novedades de las unidades se hacen desde acá.',
      'ANTES DE EMPEZAR, ENTRÁ ACÁ:',
      'https://capacity-chof.vercel.app/',
      'QUÉ TENÉS QUE HACER EN ESE SITIO:',
      '-Crearte una cuenta con tus datos.',
      '-Mirar los videos de capacitación. Son cortos y te muestran, paso a paso y con las pantallas reales, cómo cargar un gasto y cómo informar una novedad.',
      '-Si después de ver los videos te queda alguna duda, llamanos al sector y te la resolvemos.',
      'POR QUÉ IMPORTA: los videos muestran los dos errores más comunes, que son cargar varios tickets juntos en una sola foto y no verificar que el importe leído coincida con el ticket. Verlos te ahorra tener que rehacer la rendición después.',
      'Ante cualquier problema, comunicate con el sector de Implementación y Desarrollo.',
    ],
  },
];
