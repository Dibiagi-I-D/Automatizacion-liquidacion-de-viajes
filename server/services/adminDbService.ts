import sql from 'mssql'

/**
 * ════════════════════════════════════════════════════════════════════
 * SERVICIO DE BASE DE DATOS DE ADMINISTRACIÓN — dibiagi_admin_db
 * ════════════════════════════════════════════════════════════════════
 *
 * ⚠️  IMPORTANTE — AISLAMIENTO DE LA BASE PRINCIPAL
 *
 * Este servicio escribe ÚNICAMENTE en la base `DB_ADMIN` (dibiagi_admin_db).
 * NUNCA debe usarse para escribir en `DB_DATABASE` (DIBIAG), que es la base
 * productiva de Softland y es de SOLO LECTURA para esta aplicación.
 *
 * Garantías de aislamiento:
 *  1. Usa su propio ConnectionPool (`new sql.ConnectionPool`), NO el pool
 *     global de `sql.connect()` que usa sqlServerService para DIBIAG.
 *     Si se usara el pool global, mssql devolvería la conexión de DIBIAG.
 *  2. `database: process.env.DB_ADMIN` — la conexión no puede ver DIBIAG.
 *  3. Ninguna sentencia de este archivo nombra tablas de Softland
 *     (USR_GT*, CORMVI, STMPDH, etc.).
 *  4. El bootstrap sólo hace CREATE si la tabla no existe. Nunca DROP,
 *     nunca ALTER destructivo, nunca TRUNCATE.
 * ════════════════════════════════════════════════════════════════════
 */

const adminConfig: sql.config = {
  server: process.env.DB_SERVER || 'ServerSQL2022',
  database: process.env.DB_ADMIN || 'dibiagi_admin_db',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 20000,
  requestTimeout: 30000,
}

class AdminDbService {
  private pool: sql.ConnectionPool | null = null
  private connecting: Promise<sql.ConnectionPool> | null = null
  private schemaReady = false

  /**
   * Devuelve el pool dedicado a dibiagi_admin_db.
   * Usa `new sql.ConnectionPool` a propósito: `sql.connect()` maneja un pool
   * GLOBAL único y devolvería la conexión a DIBIAG creada por sqlServerService.
   */
  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool?.connected) return this.pool
    if (this.connecting) return this.connecting

    this.connecting = (async () => {
      const pool = new sql.ConnectionPool(adminConfig)
      pool.on('error', (err) => console.error('[AdminDB] Error del pool:', err.message))
      await pool.connect()

      // Verificación de seguridad: confirmar a qué base nos conectamos
      const check = await pool.request().query('SELECT DB_NAME() AS db')
      const dbName: string = check.recordset[0]?.db
      const expected = adminConfig.database

      if (dbName?.toUpperCase() !== String(expected).toUpperCase()) {
        await pool.close()
        throw new Error(
          `[AdminDB] ABORTADO: se esperaba la base "${expected}" pero la conexión ` +
          `abrió "${dbName}". No se ejecuta ninguna escritura.`
        )
      }
      if (dbName?.toUpperCase() === 'DIBIAG') {
        await pool.close()
        throw new Error('[AdminDB] ABORTADO: la conexión apunta a DIBIAG (solo lectura).')
      }

      console.log(`✅ [AdminDB] Conectado a "${dbName}"`)
      this.pool = pool
      return pool
    })()

    try {
      return await this.connecting
    } finally {
      this.connecting = null
    }
  }

  /**
   * Crea las tablas si no existen. Idempotente y no destructivo.
   * Se ejecuta una vez por proceso, de forma perezosa.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return
    const pool = await this.getPool()

    await pool.request().batch(`
      IF OBJECT_ID('dbo.gastos_viaje', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.gastos_viaje (
          id                      NVARCHAR(64)   NOT NULL CONSTRAINT PK_gastos_viaje PRIMARY KEY,
          nro_viaje               INT            NOT NULL,
          fecha                   DATETIME2(3)   NULL,
          pais                    NVARCHAR(8)    NULL,
          tipo                    NVARCHAR(200)  NULL,
          tipo_producto           NVARCHAR(32)   NULL,
          codigo_articulo         NVARCHAR(32)   NULL,
          formalidad              NVARCHAR(16)   NULL,
          codigo_proveedor        NVARCHAR(64)   NULL,
          importe                 DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_importe DEFAULT (0),
          cantidad                DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_cantidad DEFAULT (1),
          cantidad_cormvi         DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_cantcormvi DEFAULT (-1),
          coeficiente_viaje       DECIMAL(18,6)  NULL,
          valor_item_seleccionado DECIMAL(18,4)  NULL,
          valor_caja_camion       DECIMAL(18,4)  NULL,
          descripcion             NVARCHAR(500)  NULL,
          chofer                  NVARCHAR(200)  NULL,
          legajo_chofer           NVARCHAR(64)   NULL,
          empresa_chofer          NVARCHAR(64)   NULL,
          patente_tractor         NVARCHAR(64)   NULL,
          rendicion               NVARCHAR(64)   NULL,
          created_at              DATETIME2(3)   NOT NULL CONSTRAINT DF_gv_created DEFAULT (SYSUTCDATETIME()),
          updated_at              DATETIME2(3)   NULL
        );
        CREATE INDEX IX_gastos_viaje_nro_viaje ON dbo.gastos_viaje (nro_viaje);
      END
    `)

    await pool.request().batch(`
      IF OBJECT_ID('dbo.aprobaciones_viaje', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.aprobaciones_viaje (
          nro_viaje        INT            NOT NULL CONSTRAINT PK_aprobaciones_viaje PRIMARY KEY,
          aprobado_por     NVARCHAR(200)  NULL,
          fecha_aprobacion DATETIME2(3)   NOT NULL CONSTRAINT DF_av_fecha DEFAULT (SYSUTCDATETIME()),
          total_importe    DECIMAL(18,4)  NOT NULL CONSTRAINT DF_av_total DEFAULT (0)
        );
      END
    `)

    this.schemaReady = true
    console.log('✅ [AdminDB] Esquema verificado (gastos_viaje, aprobaciones_viaje)')
  }

  /** Request listo para usar, con el esquema ya garantizado. */
  async request(): Promise<sql.Request> {
    await this.ensureSchema()
    const pool = await this.getPool()
    return pool.request()
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close()
      this.pool = null
      this.schemaReady = false
    }
  }
}

export default new AdminDbService()
export { sql }
