/* ══════════════════════════════════════════════════════════════════════
   005 — Los dos períodos, corregibles
   Base de destino: dibiagi_admin_db

   QUÉ HACE
     dbo.cabecera_viaje  + periodo           INT          NULL
     dbo.gastos_viaje    + periodo_liquidar  NVARCHAR(6)  NULL
     dbo.gastos_viaje    + periodo           INT          NULL

   POR QUÉ
   En Softland la rendición tiene DOS meses distintos, y se parecen bastante
   como para confundirlos:

     período a liquidar (USR_CORMVI_PERLIQ) → cuándo se le paga al chofer.
                         Sale de la fecha de llegada, con la regla del día 15:
                         llegó hasta el 15 → ese mes; después → el siguiente.
     período            (USR_CORMVI_PERIOD) → el mes en que se carga la
                         rendición.

   Medido sobre las líneas RRFF reales: coinciden en el 55% y difieren en el
   45%, y el de pago es siempre igual o posterior al de carga (18 excepciones
   sobre 23.400, que son errores de carga).

   Las dos son de la CABECERA: en Softland todas las líneas del viaje llevan
   el mismo par. Por eso el valor general vive en cabecera_viaje.

   Las columnas de gastos_viaje son la EXCEPCIÓN: si una línea puntual tiene
   que ir con otro período, se fija ahí. Un NULL significa "heredar el de la
   cabecera", que es el caso normal.

   ⚠️  No toca DIBIAG. Todo queda en dibiagi_admin_db.

   CÓMO EJECUTARLO
     El backend las agrega solo al arrancar (adminDbService.ensureSchema).
     Este script es para hacerlo a mano si hiciera falta:
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

IF COL_LENGTH('dbo.cabecera_viaje', 'periodo') IS NULL
BEGIN
    ALTER TABLE dbo.cabecera_viaje ADD periodo INT NULL;
    PRINT 'cabecera_viaje.periodo agregada.';
END
ELSE PRINT 'cabecera_viaje.periodo ya existía.';
GO

IF COL_LENGTH('dbo.gastos_viaje', 'periodo_liquidar') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje ADD periodo_liquidar NVARCHAR(6) NULL;
    PRINT 'gastos_viaje.periodo_liquidar agregada.';
END
ELSE PRINT 'gastos_viaje.periodo_liquidar ya existía.';
GO

IF COL_LENGTH('dbo.gastos_viaje', 'periodo') IS NULL
BEGIN
    ALTER TABLE dbo.gastos_viaje ADD periodo INT NULL;
    PRINT 'gastos_viaje.periodo agregada.';
END
ELSE PRINT 'gastos_viaje.periodo ya existía.';
GO
