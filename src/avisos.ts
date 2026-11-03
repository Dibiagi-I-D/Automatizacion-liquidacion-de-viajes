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
    id: '2026-11-03-lectura-de-fotos-restablecida v1',
    fecha: '03/11/2026',
    titulo: 'Ya pueden volver a usar la app con normalidad',
    bloqueante: true,
    detalle: [
      '¡Hola! 👋 Somos de DIBIAGI, sector Implementación y Desarrollo. Les traemos una buena noticia:',
      'YA ESTÁ RESUELTO:',
      '-La lectura automática de fotos vuelve a funcionar. Cuando saquen la foto del ticket, los datos se completan solos como antes.',
      'QUÉ TIENEN QUE HACER:',
      '-Carguen los gastos como siempre, sacando la foto de cada ticket.',
      '-Si juntaron tickets en papel estos días, pueden cargarlos ahora.',
      '-Revisen igual que el importe y la fecha hayan quedado bien antes de guardar. Si algo salió mal, corríjanlo a mano.',
      'PARA TODOS: gracias por la paciencia durante estos días. Ante cualquier duda, comuníquense con el sector.',
    ],
  },
  {
    id: '2026-10-06-lectura-de-fotos v1',
    fecha: '06/10/2026',
    titulo: 'La lectura automática de fotos está pausada',
    // Resuelto el 03/11/2026: queda en la campanita como historial, pero ya
    // no traba la entrada — ver el aviso de arriba.
    bloqueante: false,
    detalle: [
      '¡Hola! 👋 Somos de DIBIAGI, sector Implementación y Desarrollo. Les contamos una novedad importante sobre la app:',
      'QUÉ ESTÁ PASANDO:',
      '-Por el momento las fotos que saquen NO se van a poder analizar automáticamente. Tenemos que ajustar los créditos de la inteligencia artificial que se encarga de leer los tickets.',
      'QUÉ TIENEN QUE HACER MIENTRAS TANTO:',
      '-Sigan juntando los tickets como lo venían haciendo antes. No cambia nada en ese sentido.',
      '-Por favor vuelvan a entrar a la aplicación más tarde. Cuando vean el aviso de que ya está listo, pueden seguir usándola con normalidad.',
      'PARA TODOS: ante cualquier duda o consulta, no duden en comunicarse con el sector. Gracias por la paciencia.',
    ],
  },
];
