// Test del endpoint viaje-activo-public
const patente = process.argv[2] || 'TEST';
const base = process.argv[3] || 'http://localhost:3001';
const url = `${base}/api/drivers/viaje-activo-public?patente=${patente}`;

console.log(`Testeando: ${url}`);

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log(JSON.stringify(data, null, 2));
} catch (e) {
  console.log('ERROR:', e.cause?.code || e.message);
  console.log('Tip: asegurate de que el server esta corriendo en otra terminal con: npx tsx server/index.ts');
}
