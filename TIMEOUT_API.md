# ⏱️ Manejo de Timeouts - API Externa (Render)

## 🔴 Problema: Cold Start en Render

La API externa (`https://apirest-dibiagi.onrender.com`) está alojada en Render con un plan gratuito, lo que significa que:

- **Se duerme después de 15 minutos de inactividad**
- **Tarda hasta 60 segundos en despertar** (cold start)
- Los primeros requests fallan con timeout

---

## ✅ Solución Implementada

### **1. Backend - Timeout aumentado**

**Archivo:** `server/services/driversApiService.ts`

```typescript
timeout: 60000 // 60 segundos (antes era 15 segundos)
```

### **2. Frontend - Timeout y manejo de errores**

**Archivo:** `src/pages/Login.tsx`

```typescript
// AbortController con timeout de 60 segundos
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 60000)

const response = await fetch(url, {
  signal: controller.signal
})
clearTimeout(timeoutId)
```

### **3. Mensaje informativo para el usuario**

Cuando está cargando, se muestra:

```
⏳ Cargando datos...
La API puede tardar hasta 60 segundos en despertar (cold start de Render).
```

---

## 📊 Tiempos de Respuesta

| Escenario | Tiempo de Respuesta |
|-----------|---------------------|
| API activa (ya despierta) | 1-3 segundos |
| Cold start (primera vez) | 30-60 segundos |
| Timeout configurado | 60 segundos |

---

## 🔧 Configuración Actual

### **Backend:**
- Timeout: **60 segundos**
- Retry: No (se maneja en frontend)
- Error handling: ✅ Implementado

### **Frontend:**
- Timeout: **60 segundos**
- Mensaje de espera: ✅ Visible
- Fallback: Permite continuar sin autocompletado

---

## 🚀 Recomendaciones

### **Opción 1: Keep-Alive (Ping)**
Hacer un ping cada 10 minutos para mantener la API despierta:

```typescript
// Ejecutar cada 10 minutos
setInterval(async () => {
  await fetch('https://apirest-dibiagi.onrender.com/health')
}, 10 * 60 * 1000)
```

### **Opción 2: Upgrade a Plan Pago**
- Render Starter ($7/mes): Sin cold start
- Respuestas instantáneas

### **Opción 3: Caching Local**
- Guardar datos en localStorage
- Actualizar cada X minutos
- Usar caché mientras carga

---

## 📝 Endpoints Afectados

Todos los endpoints públicos tienen el mismo comportamiento:

| Endpoint | Uso | Cold Start |
|----------|-----|------------|
| `/drivers/v1/active` | Autocompletado choferes | ✅ 60s |
| `/vehicles/v1/tractors` | Autocompletado tractors | ✅ 60s |
| `/trips/v1/roadmaps` | Hojas de ruta | ✅ 60s |

---

## ✅ Estado Actual

- ✅ Timeout aumentado a 60 segundos
- ✅ Mensaje informativo al usuario
- ✅ Error handling robusto
- ✅ No bloquea la aplicación
- ✅ Logs descriptivos en consola

**El sistema funciona correctamente, solo requiere paciencia en el primer acceso.**
