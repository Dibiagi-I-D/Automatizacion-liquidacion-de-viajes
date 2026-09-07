/* ══════════════════════════════════════════════════════════════════════
   003 — Estado de finalización de la hoja de ruta
   Base de destino: dibiagi_admin_db

   QUÉ HACE
   Agrega la columna  registro_tipo  a dbo.gastos_viaje.

   POR QUÉ
   Cuando a un chofer le aparece una hoja de ruta nueva mientras todavía
   le faltan gastos por cargar en la anterior, las dos quedan visibles.
   El chofer marca "finalizar" en la vieja cuando ya no le queda nada
   pendiente, y recién ahí desaparece de su pantalla.

   Ese hecho se guarda como una FILA MARCADORA dentro de gastos_viaje
   (registro_tipo = 'FINALIZACION'), no como tabla aparte.

     'GASTO'         → fila real de gasto (valor por defecto)
     'FINALIZACION'  → marcador: el chofer cerró esa hoja en SU interfaz

   ⚠️  IMPORTANTE
   La finalización es solo de la interfaz del chofer. NO cierra la hoja en
   Softland (USR_GTVIAH_CERRAD sigue igual) y NO afecta al panel /admin:
   los gastos siguen visibles, aprobables y exportables a CORMVI.

   ⚠️  Toda consulta que lea gastos debe filtrar  registro_tipo = 'GASTO'
   o los marcadores se colarían en totales y en el export.

   CÓMO EJECUTARLO
     1. SSMS → seleccionar la base  dibiagi_admin_db
     2. Ejecutar este script completo
   (El backend también lo aplica solo al arrancar, vía adminDbService.)
   ══════════════════════════════════════════════════════════════════════ */

SET NOCOUNT ON;

/* ── Guarda de seguridad ─────────────────────────────────────────────── */
IF DB_NAME() <> 'dibiagi_admin_db'
BEGIN
    RAISERROR('ABORTADO: este script debe ejecutarse sobre dibiagi_admin_db. Base actual: %s', 16, 1, @@SERVERNAME);
    SET NOEXEC ON;
END
GO

IF OBJECT_ID('dbo.gastos_viaje', 'U') IS NULL
BEGIN
    RAISERROR('ABORTADO: no existe dbo.gastos_viaje. Ejecutá primero 001_crear_tablas_admin.sql', 16, 1);
    SET NOEXEC ON;
END
GO

/* ── Columna registro_tipo ───────────────────────────────────────────── */
IF COL_LENGTH('dbo.gastos_viaje', 'registro_tipo') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje
        ADD registro_tipo NVARCHAR(16) NOT NULL
            CONSTRAINT DF_gv_registro_tipo DEFAULT ('GASTO');

    PRINT 'Agregada: dbo.gastos_viaje.registro_tipo (filas existentes quedan como GASTO)';
END
ELSE
    PRINT 'Ya existía: dbo.gastos_viaje.registro_tipo (sin cambios)';
GO

/* ── Índice para resolver rápido "¿esta hoja está finalizada?" ───────── */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_gastos_viaje_registro_tipo')
BEGIN
    CREATE INDEX IX_gastos_viaje_registro_tipo
        ON dbo.gastos_viaje (registro_tipo, nro_viaje);

    PRINT 'Creado: IX_gastos_viaje_registro_tipo';
END
ELSE
    PRINT 'Ya existía: IX_gastos_viaje_registro_tipo';
GO

SET NOEXEC OFF;
GO

/* ── Verificación ────────────────────────────────────────────────────── */
SELECT
    registro_tipo,
    COUNT(*) AS filas
FROM dbo.gastos_viaje
GROUP BY registro_tipo;
GO
