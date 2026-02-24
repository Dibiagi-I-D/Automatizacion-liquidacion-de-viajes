# Sistema de Gestión de Gastos - Transporte Logístico

Sistema web mobile-first para gestión de gastos de choferes de transporte logístico internacional (Argentina, Chile, Uruguay).

## 🚀 Stack Tecnológico

### Frontend
- **React** 18.3.1
- **TypeScript** 5.6.2
- **Vite** 6.0.1
- **Tailwind CSS** 3.4.16
- **React Router** 6.27.0
- **Framer Motion** 11.15.0

### Backend
- **Node.js** con Express 4.19.2
- **TypeScript** 5.6.2
- **Prisma** 5.20.0 (ORM)
- **PostgreSQL** (Base de datos)
- **JWT** para autenticación

## 📋 Lógica de Negocio

Los gastos se clasifican automáticamente en dos pasos:

- **PASO 1**: Gastos en Argentina con importe < $100.000 ARS
- **PASO 2**: Gastos en Chile o Uruguay (cualquier importe) + Gastos en Argentina con importe ≥ $100.000 ARS

El cálculo del paso se realiza **exclusivamente en el backend** para garantizar la integridad de los datos.

## 🛠️ Instalación Local

### Prerrequisitos
- Node.js 18+ 
- PostgreSQL 14+
- npm o yarn

### 1. Clonar el repositorio
```bash
git clone <url-del-repo>
cd gastos-logistica
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales de PostgreSQL:
```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/gastos_logistica?schema=public"
JWT_SECRET="tu-secret-jwt-super-seguro"
PORT=3000
NODE_ENV="development"
```

### 4. Configurar la base de datos
```bash
# Generar cliente de Prisma
npm run db:generate

# Aplicar migraciones
npm run db:push

# (Opcional) Crear datos de ejemplo
npm run db:seed
```

Si ejecutaste el seed, podrás usar estas credenciales para probar:
- **Legajo**: 12345
- **Interno**: INT-001

### 5. Correr el proyecto en desarrollo

**Terminal 1 - Backend:**
```bash
npm run server:dev
```
El servidor estará en `http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
npm run dev
```
La app estará en `http://localhost:5173`

## 🌐 Deploy en Render

### Opción 1: Deploy Automático (Recomendado)

1. Subir el proyecto a GitHub
2. En Render.com, crear un nuevo "Blueprint"
3. Conectar el repositorio
4. Render detectará automáticamente el `render.yaml` y creará:
   - Base de datos PostgreSQL
   - Backend API
   - Frontend estático

### Opción 2: Deploy Manual

#### 1. Crear Base de Datos PostgreSQL
- En Render Dashboard → "New" → "PostgreSQL"
- Nombre: `gastos-logistica-db`
- Plan: Free
- Copiar la "Internal Database URL"

#### 2. Deployar Backend
- En Render Dashboard → "New" → "Web Service"
- Conectar repositorio
- Configuración:
  - **Name**: gastos-logistica-api
  - **Runtime**: Node
  - **Build Command**: `npm install && npm run db:generate && npm run server:build`
  - **Start Command**: `npm run server:start`
  - **Environment Variables**:
    - `DATABASE_URL`: (Internal URL de la DB)
    - `JWT_SECRET`: (generar uno seguro)
    - `PORT`: 3000
    - `NODE_ENV`: production

#### 3. Deployar Frontend
- En Render Dashboard → "New" → "Static Site"
- Conectar repositorio
- Configuración:
  - **Name**: gastos-logistica-frontend
  - **Build Command**: `npm install && npm run build`
  - **Publish Directory**: `dist`
  - **Environment Variables**:
    - `VITE_API_URL`: `https://gastos-logistica-api.onrender.com/api`
  - **Rewrite Rules**: `/*` → `/index.html` (para React Router)

### 4. Ejecutar Migraciones en Producción

Conectarse a la DB desde Render Shell o localmente:
```bash
# Configurar DATABASE_URL con la URL de producción
npx prisma db push
npx prisma db seed  # Opcional: crear primer chofer
```

## 🔐 Crear Primer Chofer (Producción)

**Opción A: Usando el seed**
```bash
npm run db:seed
```

**Opción B: Directamente en Prisma Studio**
```bash
npx prisma studio
```
Crear un registro en la tabla `Chofer` con legajo e interno.

**Opción C: Por API (sin autenticación requerida en /login)**
El primer chofer se crea automáticamente al hacer login con credenciales nuevas.

## 📱 Uso de la Aplicación

### Login
1. Ingresar legajo (numérico)
2. Ingresar interno/patente del camión
3. El sistema creará o actualizará el chofer automáticamente

### Nuevo Gasto
1. Seleccionar fecha
2. Elegir país (🇦🇷 🇨🇱 🇺🇾)
3. Seleccionar tipo de gasto
4. Ingresar importe
5. (Opcional) Agregar descripción
6. **Indicador visual en tiempo real** muestra PASO 1 o PASO 2
7. Click en "Agregar Gasto"

### Rendición
- Ver lista de todos los gastos con badges de Paso 1/2
- Totales fijos al fondo:
  - Subtotal Paso 1
  - Subtotal Paso 2
  - Total General
- Botón "Nueva Rendición" para limpiar todos los gastos

### Navegación
- Bottom tab bar fija: Nuevo Gasto | Rendición | Salir
- Touch targets mínimo 48px (mobile-optimized)

## 🧪 Testing

```bash
# Linter
npm run lint

# Build test
npm run build
npm run preview
```

## 📦 Estructura del Proyecto

```
gastos-logistica/
├── prisma/
│   └── schema.prisma          # Modelo de base de datos
├── server/
│   ├── index.ts               # Servidor Express
│   ├── middleware/
│   │   └── auth.ts            # Middleware de autenticación JWT
│   ├── routes/
│   │   ├── auth.ts            # Rutas de autenticación
│   │   └── gastos.ts          # Rutas de gastos
│   ├── utils/
│   │   └── calcularPaso.ts    # Lógica de negocio central
│   └── seed.ts                # Seed de datos
├── src/
│   ├── api/
│   │   └── client.ts          # Cliente HTTP
│   ├── components/
│   │   ├── BottomNav.tsx
│   │   └── ProtectedRoute.tsx
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── GastosContext.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── NuevoGasto.tsx
│   │   └── Rendicion.tsx
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts               # Tipos TypeScript
│   └── index.css
├── .env.example
├── render.yaml                # Configuración de deploy
├── package.json
└── README.md
```

## 🔒 Seguridad

- JWT guardado en **memoria** (no en localStorage)
- Validaciones en backend para todos los inputs
- CORS configurado
- Tipos estrictos en TypeScript
- Sanitización de datos en Prisma

## 📝 Endpoints API

```
POST   /api/auth/login          # Login (crea chofer si no existe)
GET    /api/gastos              # Obtener gastos del chofer
POST   /api/gastos              # Crear nuevo gasto
DELETE /api/gastos              # Eliminar todos los gastos (nueva rendición)
GET    /health                  # Health check
```

## 🎨 Diseño

- Mobile-first
- Dark theme industrial
- Touch targets mínimo 48px
- Safe area insets para iOS
- Feedback visual en todas las acciones
- Animaciones con Framer Motion

## 📄 Licencia

Privado - Uso interno

---

**Desarrollado con el stack del proyecto de referencia portfolio_desarrollador**
