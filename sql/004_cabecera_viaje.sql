/* ══════════════════════════════════════════════════════════════════════
   004 — Cabecera del viaje
   Base de destino: dibiagi_admin_db

   QUÉ HACE
   Crea la tabla  dbo.cabecera_viaje : una fila por viaje con la fecha de
   salida, la fecha de llegada y el período a liquidar.

   POR QUÉ
   En Softland una rendición tiene cabecera (CORMVH) y líneas (CORMVI), y
   esas tres fechas son de la cabecera: todas las líneas del viaje heredan
   las mismas. El panel las calculaba a partir de la fecha de cada ticket,
   que Softland no guarda en ningún lado.

   Ahora se calculan igual que en Softland:
     salida            → USR_GTVIAH_FSALID de la hoja de ruta
     llegada           → primera ENTRADA del tractor en portería (USR_GTPOCU)
                         después de la salida. Coincide con lo que carga
                         administración en el 87,8% de las rendiciones.
     período liquidar  → dbo.usr_fn_devuelvePeriodo(llegada), la misma
                         función que usa la regla 49 de GRTQVI

   Esta tabla guarda SOLO las correcciones manuales. Un NULL en una columna
   significa "usar el valor calculado". Si un viaje no tiene fila, todo es
   calculado.

   ⚠️  No toca DIBIAG. Todo queda en dibiagi_admin_db.

   CÓMO EJECUTARLO
     El backend la crea solo al arrancar (adminDbService.ensureSchema).
     Este script es para crearla a mano si hiciera falta:
       1. SSMS → seleccionar la base  dibiagi_admin_db
       2. Ejecutar este script completo
     Es idempotente: se puede correr varias veces sin efecto.
   ══════════════════════════════════════════════════════════════════════ */

IF DB_NAME() <> 'dibiagi_admin_db'
BEGIN
    RAISERROR('Este script se ejecuta en dibiagi_admin_db, no en %s.', 16, 1, DB_NAME());
    RETURN;
END
GO

IF OBJECT_ID('dbo.cabecera_viaje', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cabecera_viaje (
        nro_viaje         INT            NOT NULL CONSTRAINT PK_cabecera_viaje PRIMARY KEY,
        fecha_salida      DATE           NULL,
        fecha_llegada     DATE           NULL,
        periodo_liquidar  NVARCHAR(6)    NULL,
        actualizado_por   NVARCHAR(100)  NULL,
        updated_at        DATETIME2(3)   NOT NULL CONSTRAINT DF_cv_updated DEFAULT (SYSUTCDATETIME())
    );
    PRINT 'Tabla dbo.cabecera_viaje creada.';
END
ELSE
    PRINT 'dbo.cabecera_viaje ya existía, no se modificó.';
GO
