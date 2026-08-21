/* ═══════════════════════════════════════════════════════════════════════
   CREACIÓN DE TABLAS — Gastos de viaje y aprobaciones
   Base de destino: dibiagi_admin_db
   ═══════════════════════════════════════════════════════════════════════

   ⚠️  ESTE SCRIPT NO DEBE EJECUTARSE SOBRE 'DIBIAG'.
   La primera instrucción aborta automáticamente si estás parado en la
   base equivocada, así que es seguro correrlo en SSMS por accidente.

   Es idempotente: si las tablas ya existen, no hace nada.
   No contiene DROP, TRUNCATE ni ALTER destructivo.

   Cómo ejecutarlo:
     1. Abrí SQL Server Management Studio
     2. Seleccioná la base  dibiagi_admin_db  en el desplegable
     3. Pegá este script y ejecutá (F5)
   ═══════════════════════════════════════════════════════════════════════ */

SET NOCOUNT ON;

/* ── Guarda de seguridad ─────────────────────────────────────────────── */
IF DB_NAME() <> 'dibiagi_admin_db'
BEGIN
    RAISERROR('ABORTADO: este script debe ejecutarse sobre dibiagi_admin_db. Base actual: %s', 16, 1, @@SERVERNAME);
    SET NOEXEC ON;
END
GO

/* ══════════════════════════════════════════════════════════════════════
   TABLA 1 — dbo.gastos_viaje
   Un registro por gasto cargado desde la app del chofer.
   Cada columna alimenta una columna del panel /admin y del export CORMVI.
   ══════════════════════════════════════════════════════════════════════ */
IF OBJECT_ID('dbo.gastos_viaje', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.gastos_viaje (
        -- Identidad
        id                      NVARCHAR(64)   NOT NULL CONSTRAINT PK_gastos_viaje PRIMARY KEY,
        nro_viaje               INT            NOT NULL,  -- CORMVI: USR_CORMVI_NROVIA (Hoja de Viaje N°)

        -- Datos del gasto
        fecha                   DATETIME2(3)   NULL,      -- CORMVI: USR_CORMVI_FCHCAL (Fecha Salida)
        pais                    NVARCHAR(8)    NULL,      -- ARG / CHL / URY (uso interno)
        tipo                    NVARCHAR(200)  NULL,      -- Descripción legible del concepto
        descripcion             NVARCHAR(500)  NULL,      -- Texto libre / comercio

        -- Clasificación Softland
        tipo_producto           NVARCHAR(32)   NULL,      -- CORMVI: CORMVI_TIPORI    (TARIFA, HONPRO…)
        codigo_articulo         NVARCHAR(32)   NULL,      -- CORMVI: CORMVI_ARTORI    (2, 5, 10…)
        formalidad              NVARCHAR(16)   NULL,      -- CORMVI: USR_CORMVI_NLIIVA (INFORMAL→S / FORMAL→N)
        codigo_proveedor        NVARCHAR(64)   NULL,      -- CORMVI: CORMVI_NROCTA    (Proveedor)

        -- Importes
        importe                 DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_importe     DEFAULT (0),   -- USR_CORMVI_PRECIO
        cantidad                DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_cantidad    DEFAULT (1),   -- USR_CORMVI_CANTID
        cantidad_cormvi         DECIMAL(18,4)  NOT NULL CONSTRAINT DF_gv_cantcormvi  DEFAULT (-1),  -- CORMVI_CANTID (-1 débito / 1 crédito)
        coeficiente_viaje       DECIMAL(18,6)  NULL,      -- CORMVI: USR_CORMVI_COSAVI
        valor_item_seleccionado DECIMAL(18,4)  NULL,      -- CORMVI: USR_CORMVI_VAITSE
        valor_caja_camion       DECIMAL(18,4)  NULL,      -- CORMVI: USR_CORMVI_CAJCAM

        -- Chofer y vehículo
        chofer                  NVARCHAR(200)  NULL,      -- CORMVI: USR_CORMVI_NOMLEG (Nombre Empleado)
        legajo_chofer           NVARCHAR(64)   NULL,      -- CORMVI: USR_CORMVI_NROLEG
        empresa_chofer          NVARCHAR(64)   NULL,      -- CORMVI: USR_CORMVI_EMPLEG (ej: DIBIAG)
        patente_tractor         NVARCHAR(64)   NULL,      -- CORMVI: USR_CORMVI_PATTRA
        rendicion               NVARCHAR(64)   NULL,      -- CORMVI: USR_CORMVI_NROFOR

        -- Auditoría
        created_at              DATETIME2(3)   NOT NULL CONSTRAINT DF_gv_created DEFAULT (SYSUTCDATETIME()),
        updated_at              DATETIME2(3)   NULL
    );

    CREATE INDEX IX_gastos_viaje_nro_viaje ON dbo.gastos_viaje (nro_viaje);

    PRINT 'Creada: dbo.gastos_viaje';
END
ELSE
    PRINT 'Ya existía: dbo.gastos_viaje (sin cambios)';
GO

/* ══════════════════════════════════════════════════════════════════════
   TABLA 2 — dbo.aprobaciones_viaje
   Un registro por viaje aprobado desde /admin.
   ══════════════════════════════════════════════════════════════════════ */
IF OBJECT_ID('dbo.aprobaciones_viaje', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aprobaciones_viaje (
        nro_viaje        INT            NOT NULL CONSTRAINT PK_aprobaciones_viaje PRIMARY KEY,
        aprobado_por     NVARCHAR(200)  NULL,
        fecha_aprobacion DATETIME2(3)   NOT NULL CONSTRAINT DF_av_fecha DEFAULT (SYSUTCDATETIME()),
        total_importe    DECIMAL(18,4)  NOT NULL CONSTRAINT DF_av_total DEFAULT (0)
    );

    PRINT 'Creada: dbo.aprobaciones_viaje';
END
ELSE
    PRINT 'Ya existía: dbo.aprobaciones_viaje (sin cambios)';
GO

SET NOEXEC OFF;
GO

/* ── Verificación ────────────────────────────────────────────────────── */
SELECT
    t.name                AS tabla,
    COUNT(c.column_id)    AS columnas
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
WHERE t.name IN ('gastos_viaje', 'aprobaciones_viaje')
GROUP BY t.name;
GO
