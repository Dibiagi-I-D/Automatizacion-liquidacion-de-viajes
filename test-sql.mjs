// Explorar USR_GTVIAH y cruzar con USR_GTPOCU para encontrar el viaje activo
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: process.env.DB_SERVER || 'ServerSQL2022',
  database: process.env.DB_DATABASE || 'DIBIAG',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Password1!',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  }
};

try {
  const pool = await sql.connect(config);
  console.log('Conectado a SQL Server\n');

  // 1. Columnas de USR_GTVIAH
  console.log('=== COLUMNAS DE USR_GTVIAH ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'USR_GTVIAH' 
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? ':' + c.CHARACTER_MAXIMUM_LENGTH : ''})`));

  // 2. Ultimas hojas de ruta de AD 427 NK
  console.log('\n=== ULTIMO REGISTRO USR_GTVIAH para AD 427 NK ===');
  const hr = await pool.request().query(`
    SELECT TOP 3 
      USR_GTVIAH_CODEMP, USR_GTVIAH_NROVIA, USR_GTVIAH_CERRAD,
      USR_GTVIAH_FSALID, USR_GTVIAH_FLLEGA, USR_GTVIAH_CHOFER,
      USR_GTVIAH_PATTRA, USR_GTVIAH_PATSEM, USR_GTVIAH_ORIGEN,
      USR_GTVIAH_DESTIN, USR_GTVIAH_TEXTOS, USR_GTVIAH_ANULAD,
      USR_GTVIAH_INTTRA, USR_GTVIAH_INTSEM, USR_GTVIAH_LIQUID
    FROM USR_GTVIAH 
    WHERE USR_GTVIAH_PATTRA = 'AD 427 NK'
      AND USR_GTVIAH_ANULAD = 'N'
      AND USR_GT_DEBAJA = 'N'
    ORDER BY USR_GTVIAH_NROVIA DESC
  `);
  hr.recordset.forEach((r, i) => {
    console.log(`\n  --- Hoja ${i+1} ---`);
    Object.entries(r).forEach(([k, v]) => {
      if (v !== null && v !== '' && String(v).trim() !== '') {
        console.log(`  ${k} = ${JSON.stringify(v)}`);
      }
    });
  });

  // 3. Si no hay hojas con esa patente, probar las ultimas generales
  if (hr.recordset.length === 0) {
    console.log('\n=== Intentando sin filtro de patente, ultimos 3 ===');
    const hr2 = await pool.request().query(`
      SELECT TOP 3 USR_GTVIAH_NROVIA, USR_GTVIAH_CHOFER, USR_GTVIAH_PATTRA, 
             USR_GTVIAH_FSALID, USR_GTVIAH_CERRAD 
      FROM USR_GTVIAH 
      WHERE USR_GT_DEBAJA = 'N' AND USR_GTVIAH_ANULAD = 'N'
      ORDER BY USR_GTVIAH_NROVIA DESC
    `);
    hr2.recordset.forEach((r, i) => {
      console.log(`\n  --- Hoja ${i+1} ---`);
      Object.entries(r).forEach(([k, v]) => {
        if (v !== null && v !== '' && String(v).trim() !== '') {
          console.log(`  ${k} = ${JSON.stringify(v)}`);
        }
      });
    });
  }

  // 4. Cruce: ultimo movimiento GTPOCU + hoja de ruta más cercana en fecha
  console.log('\n=== CRUCE: Ultimo movimiento + hoja de ruta mas cercana ===');
  const cruce = await pool.request().query(`
    SELECT TOP 1
      p.USR_GTPOCU_INGSAL AS TipoMovimiento,
      p.USR_GTPOCU_FECHAC AS FechaMovimiento,
      p.USR_GTPOCU_HORACO AS HoraMovimiento,
      p.USR_GTPOCU_TRACTO AS Patente,
      p.USR_GTPOCU_CHONOM AS Chofer,
      p.USR_GTPOCU_ORIGEN AS Origen,
      p.USR_GTPOCU_DESTIN AS Destino,
      h.USR_GTVIAH_NROVIA AS NroViaje,
      h.USR_GTVIAH_CERRAD AS Cerrado,
      h.USR_GTVIAH_FSALID AS FechaSalida,
      h.USR_GTVIAH_FLLEGA AS FechaLlegada,
      h.USR_GTVIAH_ORIGEN AS OrigenHR,
      h.USR_GTVIAH_DESTIN AS DestinoHR
    FROM USR_GTPOCU p
    INNER JOIN USR_GTVIAH h 
      ON p.USR_GTPOCU_TRACTO = h.USR_GTVIAH_PATTRA
      AND h.USR_GTVIAH_ANULAD = 'N'
      AND h.USR_GT_DEBAJA = 'N'
    WHERE p.USR_GTPOCU_TRACTO = 'AD 427 NK'
      AND DATEDIFF(DAY, TRY_CONVERT(date, p.USR_GTPOCU_FECHAC), CONVERT(date, GETDATE())) <= 5
    ORDER BY p.USR_GTPOCU_FECHAC DESC, h.USR_GTVIAH_NROVIA DESC
  `);
  if (cruce.recordset.length > 0) {
    const r = cruce.recordset[0];
    Object.entries(r).forEach(([k, v]) => {
      if (v !== null && v !== '' && String(v).trim() !== '') {
        console.log(`  ${k} = ${JSON.stringify(v)}`);
      }
    });
  } else {
    console.log('  Sin resultados en el cruce');
  }

  await pool.close();
} catch (e) {
  console.log('Error:', e.message);
}
