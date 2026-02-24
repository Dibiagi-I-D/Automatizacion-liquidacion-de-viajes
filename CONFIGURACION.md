# 🚀 Configuración Completa del Proyecto

## ✅ Cambios Realizados

### 1. **Configuración de SQL Server** (`.env`)
Se actualizó el archivo `.env` con tus credenciales de SQL Server:

```env
DB_SERVER=ServerSQL2022
DB_DATABASE=DIBIAG (base de datos Softland)
DB_ADMIN=dibiagi_admin_db (base de datos de usuarios)
DB_USER=sa
DB_PASSWORD=Password1!
DB_PORT=1433
DATABASE_URL="sqlserver://ServerSQL2022:1433;database=dibiagi_admin_db;..."
```

### 2. **Schema de Prisma** (`prisma/schema.prisma`)
Se cambió el provider de PostgreSQL a SQL Server:

```prisma
datasource db {
  provider = "sqlserver"  // ← Cambio aquí
  url      = env("DATABASE_URL")
}
```

### 3. **Servicio de SQL Server** (`server/services/sqlServerService.ts`)
Se creó un servicio completo para conectar y consultar SQL Server con métodos como:
- `obtenerTractores()` - Obtiene tractores activos de Softland
- `obtenerChoferPorLegajo(legajo)` - Busca un chofer
- `obtenerViajesPorChofer(legajo, fechaInicio, fechaFin)` - Obtiene viajes
- `existeTractor(interno)` - Verifica si existe un tractor
- `query(sql, params)` - Método genérico para consultas personalizadas

### 4. **Rutas de API para Softland** (`server/routes/softland.ts`)
Se crearon endpoints para consumir datos de Softland:
- `GET /api/softland/tractores` - Lista de tractores
- `GET /api/softland/chofer/:legajo` - Datos del chofer
- `GET /api/softland/viajes/:legajo?fechaInicio&fechaFin` - Viajes del chofer
- `GET /api/softland/verificar-tractor/:interno` - Verifica tractor
- `GET /api/softland/resumen-gastos/:legajo?mes&anio` - Resumen de gastos
- `POST /api/softland/consulta-personalizada` - Consulta SQL custom

### 5. **Guía de API REST** (`GUIA_API_REST.md`)
Documento completo con ejemplos de cómo consumir APIs desde:
- Frontend (React con axios)
- Backend (Node.js con fetch/axios)
- Conexión directa a SQL Server

---

## 📝 Pasos para Ejecutar el Proyecto

### **Paso 1: Instalar dependencias faltantes**

```powershell
npm install mssql
npm install @types/mssql --save-dev
```

### **Paso 2: Generar cliente Prisma con SQL Server**

```powershell
npx prisma generate
```

### **Paso 3: Crear las tablas en SQL Server**

```powershell
npx prisma db push
```

**IMPORTANTE:** Esto creará las tablas `Chofer` y `Gasto` en la base de datos `dibiagi_admin_db`.

### **Paso 4: Registrar las rutas de Softland**

Edita `server/index.ts` y agrega:

```typescript
import softlandRoutes from './routes/softland';

// ... después de las otras rutas ...
app.use('/api/softland', softlandRoutes);
```

### **Paso 5: Iniciar el servidor**

```powershell
npm run dev
```

---

## 🔌 Endpoints Disponibles

### **Autenticación**
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario
- `GET /api/auth/me` - Usuario actual

### **Gestión de Gastos (BD Admin)**
- `GET /api/gastos` - Listar gastos
- `POST /api/gastos` - Crear gasto
- `PUT /api/gastos/:id` - Actualizar gasto
- `DELETE /api/gastos/:id` - Eliminar gasto

### **Integración con Softland (BD DIBIAG)** ✨ NUEVO
- `GET /api/softland/tractores` - Tractores de Softland
- `GET /api/softland/chofer/:legajo` - Datos del chofer
- `GET /api/softland/viajes/:legajo` - Viajes del chofer
- `GET /api/softland/verificar-tractor/:interno` - Verificar tractor
- `GET /api/softland/resumen-gastos/:legajo` - Resumen gastos

---

## 💡 Ejemplo de Uso

### **Desde el Frontend (React)**

```typescript
import api from '../api/client';

// Obtener tractores de Softland
const obtenerTractores = async () => {
  try {
    const response = await api.get('/api/softland/tractores');
    console.log(response.data.data); // Array de tractores
  } catch (error) {
    console.error('Error:', error);
  }
};

// Verificar si existe un chofer
const verificarChofer = async (legajo: string) => {
  try {
    const response = await api.get(`/api/softland/chofer/${legajo}`);
    if (response.data.success) {
      console.log('Chofer encontrado:', response.data.data);
    }
  } catch (error) {
    console.error('Chofer no existe');
  }
};
```

### **Desde Postman/Thunder Client**

```http
GET http://localhost:3001/api/softland/tractores
Authorization: Bearer tu_token_jwt_aqui
```

---

## 🗄️ Estructura de Bases de Datos

### **Base de Datos: `dibiagi_admin_db`** (Nueva - Gestionada por Prisma)
Contiene las tablas de la aplicación:
- `Chofer` - Choferes registrados en la app
- `Gasto` - Gastos de combustible, peajes, etc.

### **Base de Datos: `DIBIAG`** (Softland - Solo lectura)
Contiene los datos del sistema Softland:
- `Tractores` - Vehículos
- `Choferes` - Personal
- `Viajes` - Histórico de viajes
- Otras tablas según tu sistema Softland

---

## ⚠️ Notas Importantes

1. **Dos Conexiones Diferentes:**
   - Prisma → `dibiagi_admin_db` (escritura/lectura)
   - mssql → `DIBIAG` (solo lectura para consultar Softland)

2. **Seguridad:**
   - Todos los endpoints de Softland requieren autenticación JWT
   - Las consultas personalizadas solo permiten SELECT
   - Nunca expongas credenciales de BD en el código

3. **Nombres de Tablas:**
   - Verifica que los nombres de tablas en Softland coincidan
   - Ajusta las consultas SQL según tu estructura real

4. **Testing:**
   - Prueba primero la conexión con consultas simples
   - Verifica que el servidor SQL Server esté accesible
   - Revisa los logs del servidor para errores

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'mssql'"
```powershell
npm install mssql
```

### Error: "Login failed for user 'sa'"
- Verifica usuario y contraseña en `.env`
- Asegúrate que SQL Server acepte autenticación mixta
- Verifica que el puerto 1433 esté abierto

### Error: "Prisma Client not generated"
```powershell
npx prisma generate
npx prisma db push
```

### El frontend no conecta con el backend
- Verifica que el backend esté corriendo en puerto 3001
- Revisa el proxy en `vite.config.ts`
- Comprueba que no haya errores en la consola del servidor

---

## 📚 Recursos

- [Documentación de Prisma](https://www.prisma.io/docs)
- [node-mssql](https://www.npmjs.com/package/mssql)
- [Express + TypeScript](https://expressjs.com/)
- [React + Vite](https://vitejs.dev/)

---

## 🎯 Próximos Pasos Sugeridos

1. ✅ Instalar `mssql`
2. ✅ Configurar conexión a SQL Server
3. ⏳ Probar endpoints de Softland
4. ⏳ Integrar datos de Softland en el frontend
5. ⏳ Agregar validaciones de choferes contra Softland
6. ⏳ Sincronizar tractores automáticamente
7. ⏳ Crear reportes combinando ambas BDs

---

**¿Necesitas ayuda con algún paso específico?** 🚀
