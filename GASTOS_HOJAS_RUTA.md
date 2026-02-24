# 📋 Sistema de Gastos por Hoja de Ruta

## ✅ Funcionalidades Implementadas

### 1. **Filtrado Inteligente de Hojas de Ruta**

#### Lógica Implementada:
- **Muestra siempre el viaje más reciente** (Nro_Viaje más grande)
- **Incluye viajes adicionales** si hay un intervalo ≤ 10 días de diferencia
- **Filtra por chofer y tractor** logueados automáticamente

#### Código en `HojasDeRuta.tsx`:
```typescript
// Ordenar por número de viaje descendente (el más reciente primero)
const hojasOrdenadas = hojasFiltradas.sort((a, b) => b.Nro_Viaje - a.Nro_Viaje)

// Filtrar: mostrar solo el último viaje y los que estén a menos de 10 días
if (hojasOrdenadas.length > 0) {
  const viajeReciente = hojasOrdenadas[0]
  hojasRecientes.push(viajeReciente)
  
  const fechaReciente = new Date(viajeReciente.Fecha_Salida)
  
  // Agregar viajes con menos de 10 días de diferencia
  for (let i = 1; i < hojasOrdenadas.length; i++) {
    const hoja = hojasOrdenadas[i]
    const fechaHoja = new Date(hoja.Fecha_Salida)
    const diferenciaDias = Math.abs((fechaReciente.getTime() - fechaHoja.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diferenciaDias <= 10) {
      hojasRecientes.push(hoja)
    }
  }
}
```

---

### 2. **Agregar Gastos a un Viaje Específico**

#### Flujo Implementado:
1. Usuario hace clic en **"+ Agregar Gasto a este Viaje"** en una hoja de ruta
2. Se redirige a `/dashboard/nuevo-gasto?viaje=123` con el número de viaje en la URL
3. El formulario muestra claramente el **Viaje #123** al que se está agregando el gasto
4. Al guardar, el gasto se asocia con ese número de viaje

#### Navegación:
```typescript
<button
  className="btn-primary w-full"
  onClick={() => {
    navigate(`/dashboard/nuevo-gasto?viaje=${hoja.Nro_Viaje}`)
  }}
>
  + Agregar Gasto a este Viaje
</button>
```

---

### 3. **Almacenamiento en LocalStorage**

#### Estructura de Datos:
```typescript
{
  id: "1234567890",
  nroViaje: 123,
  fecha: "2026-02-24T00:00:00.000Z",
  pais: "ARG",
  tipo: "COMBUSTIBLE",
  importe: 50000,
  descripcion: "Carga en ruta",
  createdAt: "2026-02-24T10:30:00.000Z"
}
```

#### Guardar Gasto:
```typescript
const nuevoGasto = {
  id: Date.now().toString(),
  nroViaje: parseInt(nroViaje),
  fecha: new Date(fecha).toISOString(),
  pais,
  tipo,
  importe: importeNum,
  descripcion: descripcion.trim() || undefined,
  createdAt: new Date().toISOString()
}

// Obtener gastos existentes
const gastosGuardados = localStorage.getItem('gastos_viajes')
const gastos = gastosGuardados ? JSON.parse(gastosGuardados) : []

// Agregar nuevo gasto
gastos.push(nuevoGasto)

// Guardar en localStorage
localStorage.setItem('gastos_viajes', JSON.stringify(gastos))
```

---

### 4. **Contador de Gastos por Viaje**

#### Visualización:
- Cada hoja de ruta muestra **cuántos gastos tiene asociados**
- Badge verde con el número: `📝 3 gastos`
- Se actualiza automáticamente al agregar nuevos gastos

#### Implementación:
```typescript
// Cargar conteo de gastos desde localStorage
useEffect(() => {
  const gastosGuardados = localStorage.getItem('gastos_viajes')
  if (gastosGuardados) {
    const gastos = JSON.parse(gastosGuardados)
    const counts: Record<number, number> = {}
    gastos.forEach((gasto: any) => {
      counts[gasto.nroViaje] = (counts[gasto.nroViaje] || 0) + 1
    })
    setGastosCount(counts)
  }
}, [hojasDeRuta])
```

---

### 5. **Redirección Automática**

Después de guardar un gasto:
- ✅ Se muestra mensaje de éxito: **"Gasto agregado exitosamente"**
- ✅ Espera 1.5 segundos
- ✅ Redirige automáticamente a la página de **Hojas de Ruta**
- ✅ El contador de gastos se actualiza

```typescript
setTimeout(() => {
  setShowSuccess(false)
  navigate('/dashboard/hojas-ruta')
}, 1500)
```

---

## 🎯 Flujo Completo de Usuario

### Paso 1: Login
```
Usuario selecciona:
- Chofer: "Valenzuela Martin Eduardo"
- Tractor: "AD 427 NK"
```

### Paso 2: Ver Hojas de Ruta
```
Sistema muestra:
- ✅ Viaje más reciente (Nro_Viaje más grande)
- ✅ Viajes con ≤ 10 días de diferencia
- ✅ Filtrados por el chofer y tractor logueados
```

### Paso 3: Agregar Gasto
```
1. Click en "+ Agregar Gasto a este Viaje"
2. Se abre formulario mostrando: "Viaje #123"
3. Usuario ingresa:
   - Fecha
   - País
   - Importe
   - Descripción
4. Click en "Agregar Gasto"
```

### Paso 4: Confirmación y Retorno
```
1. ✅ Mensaje: "Gasto agregado exitosamente"
2. 🔄 Redirección automática a Hojas de Ruta
3. 📝 Badge actualizado: "3 gastos"
```

---

## 📊 Estructura en LocalStorage

### Key: `gastos_viajes`
```json
[
  {
    "id": "1708780200000",
    "nroViaje": 123,
    "fecha": "2026-02-24T00:00:00.000Z",
    "pais": "ARG",
    "tipo": "COMBUSTIBLE",
    "importe": 50000,
    "descripcion": "Carga en YPF",
    "createdAt": "2026-02-24T10:30:00.000Z"
  },
  {
    "id": "1708780300000",
    "nroViaje": 123,
    "fecha": "2026-02-24T00:00:00.000Z",
    "pais": "BRA",
    "tipo": "PEAJE",
    "importe": 15000,
    "descripcion": "Peaje ruta BR-101",
    "createdAt": "2026-02-24T11:45:00.000Z"
  }
]
```

---

## 🔧 Archivos Modificados

### 1. `src/pages/HojasDeRuta.tsx`
- ✅ Filtrado por último viaje + intervalo de 10 días
- ✅ Ordenamiento descendente por Nro_Viaje
- ✅ Contador de gastos por viaje
- ✅ Botón de "Agregar Gasto" con navegación

### 2. `src/pages/NuevoGasto.tsx`
- ✅ Lectura del parámetro `viaje` de la URL
- ✅ Visualización del número de viaje en el encabezado
- ✅ Guardado en localStorage asociado al viaje
- ✅ Redirección automática después de guardar
- ✅ Botón "Volver a Hojas de Ruta"

---

## 🚀 Próximos Pasos (Opcional)

### Backend Integration:
Cuando esté listo el backend, reemplazar localStorage por:

```typescript
// En lugar de localStorage
const response = await api.post('/api/gastos', {
  nroViaje,
  fecha,
  pais,
  tipo,
  importe,
  descripcion
})
```

### Página de Rendición:
Mostrar todos los gastos agrupados por viaje con totales.

---

## 📝 Notas Importantes

- ✅ **Los datos persisten** en localStorage hasta que se limpie el navegador
- ✅ **Cada gasto tiene un ID único** basado en timestamp
- ✅ **Filtrado automático** por chofer y tractor logueados
- ✅ **Interfaz intuitiva** con mensajes claros
- ✅ **Flujo completo** de navegación entre páginas

---

## 🎨 Mejoras Visuales Implementadas

- Banner informativo mostrando el viaje actual en NuevoGasto
- Badge verde con contador de gastos en cada hoja de ruta
- Botón "Volver a Hojas de Ruta" para navegación fácil
- Mensaje de éxito con animación al guardar
- Indicador claro de "Viaje más reciente" en la página

---

**🎉 Sistema completamente funcional y listo para usar!**
