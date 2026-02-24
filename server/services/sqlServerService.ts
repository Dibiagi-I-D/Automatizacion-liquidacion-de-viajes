import sql from 'mssql';

// Configuración para la base de datos Softland (DIBIAG)
const softlandConfig: sql.config = {
  server: process.env.DB_SERVER || 'ServerSQL2022',
  database: process.env.DB_DATABASE || 'DIBIAG',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Password1!',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

class SqlServerService {
  private pool: sql.ConnectionPool | null = null;

  /**
   * Conectar al servidor SQL Server
   */
  async connect(): Promise<sql.ConnectionPool> {
    try {
      if (!this.pool) {
        this.pool = await sql.connect(softlandConfig);
        console.log('✅ Conectado a SQL Server (Softland)');
      }
      return this.pool;
    } catch (error) {
      console.error('❌ Error al conectar con SQL Server:', error);
      throw error;
    }
  }

  /**
   * Cerrar la conexión
   */
  async close(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
        console.log('🔌 Conexión cerrada');
      }
    } catch (error) {
      console.error('Error al cerrar conexión:', error);
    }
  }

  /**
   * Ejecutar una consulta SELECT genérica
   */
  async query<T = any>(queryString: string, params?: Record<string, any>): Promise<T[]> {
    try {
      const pool = await this.connect();
      const request = pool.request();

      // Agregar parámetros si existen
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          request.input(key, value);
        });
      }

      const result = await request.query(queryString);
      return result.recordset;
    } catch (error) {
      console.error('Error en consulta SQL:', error);
      throw error;
    }
  }

  /**
   * Obtener tractores desde Softland
   */
  async obtenerTractores() {
    const query = `
      SELECT 
        IdTractor,
        Interno,
        Legajo,
        Activo
      FROM Tractores 
      WHERE Activo = 1
      ORDER BY Interno
    `;
    return this.query(query);
  }

  /**
   * Obtener chofer por legajo
   */
  async obtenerChoferPorLegajo(legajo: string) {
    const query = `
      SELECT 
        *
      FROM Choferes 
      WHERE Legajo = @legajo
    `;
    const result = await this.query(query, { legajo });
    return result[0] || null;
  }

  /**
   * Obtener viajes de un chofer en un rango de fechas
   */
  async obtenerViajesPorChofer(legajo: string, fechaInicio: Date, fechaFin: Date) {
    const query = `
      SELECT 
        v.*,
        c.Nombre as NombreChofer
      FROM Viajes v
      INNER JOIN Choferes c ON v.LegajoChofer = c.Legajo
      WHERE v.LegajoChofer = @legajo 
      AND v.FechaViaje BETWEEN @fechaInicio AND @fechaFin
      ORDER BY v.FechaViaje DESC
    `;
    return this.query(query, { legajo, fechaInicio, fechaFin });
  }

  /**
   * Verificar si existe un tractor por interno
   */
  async existeTractor(interno: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as total
      FROM Tractores 
      WHERE Interno = @interno AND Activo = 1
    `;
    const result = await this.query<{ total: number }>(query, { interno });
    return result[0]?.total > 0;
  }

  /**
   * Ejemplo de consulta personalizada
   * Puedes adaptarla según tu estructura de BD Softland
   */
  async obtenerResumenGastos(legajo: string, mes: number, anio: number) {
    const query = `
      SELECT 
        TipoGasto,
        SUM(Importe) as TotalImporte,
        COUNT(*) as CantidadGastos
      FROM GastosChoferes
      WHERE Legajo = @legajo
      AND MONTH(Fecha) = @mes
      AND YEAR(Fecha) = @anio
      GROUP BY TipoGasto
    `;
    return this.query(query, { legajo, mes, anio });
  }
}

// Exportar una instancia única (singleton)
export default new SqlServerService();
