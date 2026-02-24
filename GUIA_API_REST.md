# 📚 Guía: Cómo Consumir Endpoints de API REST

## 1️⃣ EN EL FRONTEND (React/TypeScript)

Tu proyecto ya tiene configurado un cliente API en `src/api/client.ts`. Aquí te muestro diferentes formas:

### **Método 1: Usando el cliente configurado (RECOMENDADO)**

```typescript
// src/api/client.ts ya tiene configurado axios con la baseURL
import api from '../api/client';

// GET - Obtener datos
const obtenerChoferes = async () => {
  try {
    const response = await api.get('/api/choferes');
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// POST - Crear datos
const crearGasto = async (gastoData) => {
  try {
    const response = await api.post('/api/gastos', gastoData);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// PUT - Actualizar datos
const actualizarGasto = async (id, gastoData) => {
  try {
    const response = await api.put(`/api/gastos/${id}`, gastoData);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// DELETE - Eliminar datos
const eliminarGasto = async (id) => {
  try {
    const response = await api.delete(`/api/gastos/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

### **Método 2: Usando fetch (nativo de JavaScript)**

```typescript
// GET
const obtenerDatos = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/choferes', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Si necesitas autenticación
      }
    });
    
    if (!response.ok) {
      throw new Error('Error en la petición');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
};

// POST
const crearDatos = async (datos) => {
  try {
    const response = await fetch('http://localhost:3001/api/gastos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(datos)
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### **Método 3: En un componente React con hooks**

```typescript
import { useState, useEffect } from 'react';
import api from '../api/client';

function MiComponente() {
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Obtener datos al cargar el componente
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/choferes');
        setDatos(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  // Función para crear nuevo dato
  const crearNuevo = async (nuevoGasto) => {
    try {
      const response = await api.post('/api/gastos', nuevoGasto);
      setDatos([...datos, response.data]); // Agregar a la lista
    } catch (err) {
      console.error('Error al crear:', err);
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {datos.map(item => (
        <div key={item.id}>{item.nombre}</div>
      ))}
    </div>
  );
}
```

---

## 2️⃣ EN EL BACKEND (Node.js/Express)

### **Consumir una API externa desde el servidor**

```typescript
// server/routes/external-api.ts
import express from 'express';
import axios from 'axios';

const router = express.Router();

// Ejemplo: Consumir API de Softland
router.get('/tractores', async (req, res) => {
  try {
    const response = await axios.get('http://tu-servidor-softland/api/tractores', {
      headers: {
        'Authorization': 'Bearer tu-token',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error al consumir API externa:', error);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// POST a API externa
router.post('/sincronizar', async (req, res) => {
  try {
    const datos = req.body;
    
    const response = await axios.post(
      'http://api-externa.com/endpoint',
      datos,
      {
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### **Conectar con SQL Server directamente**

```typescript
// server/utils/sqlServerConnection.ts
import sql from 'mssql';

const config = {
  server: process.env.DB_SERVER!,
  database: process.env.DB_DATABASE!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  }
};

export async function consultarSoftland(query: string) {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (error) {
    console.error('Error en SQL Server:', error);
    throw error;
  }
}

// Ejemplo de uso en una ruta
router.get('/tractores-softland', async (req, res) => {
  try {
    const tractores = await consultarSoftland('SELECT * FROM Tractores');
    res.json(tractores);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar Softland' });
  }
});
```

---

## 3️⃣ EJEMPLO PRÁCTICO COMPLETO

### **Crear un servicio para consumir API de Softland**

```typescript
// server/services/softlandService.ts
import sql from 'mssql';

const softlandConfig = {
  server: process.env.DB_SERVER!,
  database: process.env.DB_DATABASE!, // DIBIAG
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

class SoftlandService {
  private pool: sql.ConnectionPool | null = null;

  async connect() {
    if (!this.pool) {
      this.pool = await sql.connect(softlandConfig);
    }
    return this.pool;
  }

  async obtenerTractores() {
    const pool = await this.connect();
    const result = await pool.request()
      .query('SELECT IdTractor, Interno, Legajo FROM Tractores WHERE Activo = 1');
    return result.recordset;
  }

  async obtenerChoferPorLegajo(legajo: string) {
    const pool = await this.connect();
    const result = await pool.request()
      .input('legajo', sql.VarChar, legajo)
      .query('SELECT * FROM Choferes WHERE Legajo = @legajo');
    return result.recordset[0];
  }

  async obtenerViajesPorChofer(legajo: string, fechaInicio: Date, fechaFin: Date) {
    const pool = await this.connect();
    const result = await pool.request()
      .input('legajo', sql.VarChar, legajo)
      .input('fechaInicio', sql.DateTime, fechaInicio)
      .input('fechaFin', sql.DateTime, fechaFin)
      .query(`
        SELECT * FROM Viajes 
        WHERE LegajoChofer = @legajo 
        AND FechaViaje BETWEEN @fechaInicio AND @fechaFin
      `);
    return result.recordset;
  }
}

export default new SoftlandService();
```

### **Usar el servicio en una ruta**

```typescript
// server/routes/softland.ts
import express from 'express';
import softlandService from '../services/softlandService';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Obtener tractores de Softland
router.get('/tractores', authenticateToken, async (req, res) => {
  try {
    const tractores = await softlandService.obtenerTractores();
    res.json(tractores);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener tractores' });
  }
});

// Obtener datos del chofer desde Softland
router.get('/chofer/:legajo', authenticateToken, async (req, res) => {
  try {
    const { legajo } = req.params;
    const chofer = await softlandService.obtenerChoferPorLegajo(legajo);
    
    if (!chofer) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }
    
    res.json(chofer);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener chofer' });
  }
});

export default router;
```

### **Registrar las rutas en el servidor**

```typescript
// server/index.ts
import softlandRoutes from './routes/softland';

// ... otras configuraciones ...

app.use('/api/softland', softlandRoutes);
```

---

## 4️⃣ INSTALACIÓN DE DEPENDENCIAS

```bash
# Instalar mssql para conectar con SQL Server
npm install mssql

# Tipos de TypeScript para mssql
npm install -D @types/mssql
```

---

## 5️⃣ ENDPOINTS DE TU API ACTUAL

Tu proyecto ya tiene estos endpoints disponibles:

### **Autenticación**
- `POST /api/auth/login` - Login de usuario
- `POST /api/auth/register` - Registro de usuario
- `GET /api/auth/me` - Obtener usuario actual

### **Gastos**
- `GET /api/gastos` - Obtener todos los gastos
- `POST /api/gastos` - Crear nuevo gasto
- `PUT /api/gastos/:id` - Actualizar gasto
- `DELETE /api/gastos/:id` - Eliminar gasto

---

## 🎯 RESUMEN

1. **Frontend → Tu Backend**: Usa `api` de `src/api/client.ts`
2. **Backend → SQL Server**: Usa `mssql` para consultas directas
3. **Backend → API Externa**: Usa `axios` o `fetch`
4. **Siempre maneja errores** con try-catch
5. **Usa variables de entorno** para configuraciones sensibles

¿Necesitas que implemente algún ejemplo específico en tu proyecto?
