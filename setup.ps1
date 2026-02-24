# Script de Instalación y Configuración
# Ejecutar en PowerShell

Write-Host "🚀 Instalando dependencias para SQL Server..." -ForegroundColor Cyan

# Instalar mssql
npm install mssql

Write-Host "`n✅ Dependencias instaladas!" -ForegroundColor Green

Write-Host "`n🔧 Generando cliente Prisma..." -ForegroundColor Cyan

# Generar cliente Prisma
npx prisma generate

Write-Host "`n✅ Cliente Prisma generado!" -ForegroundColor Green

Write-Host "`n📦 Creando tablas en la base de datos..." -ForegroundColor Cyan

# Crear tablas en SQL Server
npx prisma db push

Write-Host "`n✅ Tablas creadas en SQL Server!" -ForegroundColor Green

Write-Host "`n🎉 ¡Configuración completada!" -ForegroundColor Green
Write-Host "`nPuedes iniciar el servidor con: npm run dev" -ForegroundColor Yellow
