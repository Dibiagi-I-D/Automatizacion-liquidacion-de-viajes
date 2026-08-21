/* ═══════════════════════════════════════════════════════════════════════
   AGREGAR FOTO DEL TICKET — dbo.gastos_viaje
   Base de destino: dibiagi_admin_db
   ═══════════════════════════════════════════════════════════════════════

   ⚠️  NO EJECUTAR SOBRE 'DIBIAG'. La guarda de abajo aborta si te
   equivocaste de base.

   Idempotente: si las columnas ya existen, no hace nada.
   Sólo agrega columnas nuevas — no modifica ni borra datos existentes.

   Cómo ejecutarlo:
     1. SSMS → seleccionar la base  dibiagi_admin_db
     2. Pegar y ejecutar (F5)
   ═══════════════════════════════════════════════════════════════════════ */

SET NOCOUNT ON;

/* ── Guarda de seguridad ─────────────────────────────────────────────── */
IF DB_NAME() <> 'dibiagi_admin_db'
BEGIN
    RAISERROR('ABORTADO: este script debe ejecutarse sobre dibiagi_admin_db.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ── La tabla base tiene que existir ─────────────────────────────────── */
IF OBJECT_ID('dbo.gastos_viaje', 'U') IS NULL
BEGIN
    RAISERROR('ABORTADO: falta dbo.gastos_viaje. Ejecutá primero 001_crear_tablas_admin.sql', 16, 1);
    SET NOEXEC ON;
END
GO

/* ══════════════════════════════════════════════════════════════════════
   foto       — imagen del ticket en binario (VARBINARY, no base64:
                ocupa ~33% menos y no hay que decodificar para servirla)
   foto_mime  — 'image/jpeg', 'image/png', etc.
   foto_subida_at — cuándo se adjuntó
   ══════════════════════════════════════════════════════════════════════ */

IF COL_LENGTH('dbo.gastos_viaje', 'foto') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje ADD foto VARBINARY(MAX) NULL;
    PRINT 'Agregada: gastos_viaje.foto';
END
ELSE
    PRINT 'Ya existía: gastos_viaje.foto';
GO

IF COL_LENGTH('dbo.gastos_viaje', 'foto_mime') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje ADD foto_mime NVARCHAR(64) NULL;
    PRINT 'Agregada: gastos_viaje.foto_mime';
END
ELSE
    PRINT 'Ya existía: gastos_viaje.foto_mime';
GO

IF COL_LENGTH('dbo.gastos_viaje', 'foto_subida_at') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje ADD foto_subida_at DATETIME2(3) NULL;
    PRINT 'Agregada: gastos_viaje.foto_subida_at';
END
ELSE
    PRINT 'Ya existía: gastos_viaje.foto_subida_at';
GO

SET NOEXEC OFF;
GO

/* ── Verificación ────────────────────────────────────────────────────── */
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'gastos_viaje'
  AND COLUMN_NAME IN ('foto', 'foto_mime', 'foto_subida_at')
ORDER BY COLUMN_NAME;
GO
