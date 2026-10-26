/**
 * Compara la lectura de tickets de Claude contra la de Gemini.
 *
 * Usa las fotos que ya están guardadas en dibiagi_admin_db y contrasta lo que
 * devuelve cada modelo contra lo que quedó cargado en el gasto, que es el dato
 * que administración dio por bueno.
 *
 * Uso:   npx tsx scripts/comparar-ocr.ts [cantidad]
 *
 * No escribe nada: solo lee las fotos y llama a los modelos.
 */
import 'dotenv/config'
import adminDb from '../server/services/adminDbService.js'

const API = `http://localhost:${process.env.PORT || 3001}/api/ocr/scan`
const CANTIDAD = Number(process.argv[2]) || 8

async function leer(imagenBase64: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imagenBase64 }),
  })
  const data: any = await res.json()
  return data.datos || {}
}

async function main() {
  const rq = await adminDb.request()
  const filas = (await rq.query(`
    SELECT TOP ${CANTIDAD} id, nro_viaje, importe, fecha, pais, tipo_producto,
           codigo_articulo, codigo_proveedor, formalidad, foto, foto_mime
    FROM dbo.gastos_viaje
    WHERE registro_tipo = 'GASTO' AND foto IS NOT NULL
    ORDER BY created_at DESC
  `)).recordset

  console.log(`Comparando ${filas.length} tickets con OCR_PROVIDER=${process.env.OCR_PROVIDER}\n`)

  let igualImporte = 0, igualFecha = 0, igualProveedor = 0, igualConcepto = 0

  for (const f of filas) {
    const base64 = `data:${f.foto_mime || 'image/jpeg'};base64,${Buffer.from(f.foto).toString('base64')}`
    const leido = await leer(base64)

    // La fecha viene como Date de SQL Server: hay que formatearla, no cortarla
    // con slice(0,10) — eso devuelve "Mon Oct 05" y nada coincide nunca.
    const fechaGuardada = f.fecha instanceof Date
      ? f.fecha.toISOString().slice(0, 10)
      : String(f.fecha || '').slice(0, 10)

    const guardadoConcepto = `${f.tipo_producto}/${f.codigo_articulo}`
    const leidoConcepto = `${leido.tipoProducto}/${leido.codigoArticulo}`
    const mismoImporte = Math.abs(Number(leido.importe || 0) - Number(f.importe)) < 0.5
    const mismaFecha = String(leido.fecha || '') === fechaGuardada
    const mismoProv = String(leido.codigoProveedor || '') === String(f.codigo_proveedor || '').trim()
    const mismoConc = leidoConcepto === guardadoConcepto

    if (mismoImporte) igualImporte++
    if (mismaFecha) igualFecha++
    if (mismoProv) igualProveedor++
    if (mismoConc) igualConcepto++

    // Un gasto guardado en 0 no sirve como referencia: nadie lo controló
    const sinReferencia = Number(f.importe) === 0
    console.log(`viaje ${f.nro_viaje}  ${f.id}${sinReferencia ? '   (guardado en 0: no sirve de referencia)' : ''}`)
    console.log(`  importe    guardado ${f.importe}  leido ${leido.importe}  ${mismoImporte ? 'OK' : '<-- DIFIERE'}`)
    console.log(`  fecha      guardado ${fechaGuardada}  leido ${leido.fecha}  ${mismaFecha ? 'OK' : '<-- DIFIERE'}`)
    console.log(`  proveedor  guardado ${f.codigo_proveedor}  leido ${leido.codigoProveedor}  ${mismoProv ? 'OK' : '<-- DIFIERE'}`)
    console.log(`  concepto   guardado ${guardadoConcepto}  leido ${leidoConcepto}  ${mismoConc ? 'OK' : '<-- DIFIERE'}`)
    console.log()
  }

  const n = filas.length
  console.log('─'.repeat(50))
  console.log(`Coincidencias sobre ${n} tickets:`)
  console.log(`  importe    ${igualImporte}/${n}`)
  console.log(`  fecha      ${igualFecha}/${n}`)
  console.log(`  proveedor  ${igualProveedor}/${n}`)
  console.log(`  concepto   ${igualConcepto}/${n}`)
  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
