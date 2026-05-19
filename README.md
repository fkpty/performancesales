# ContractFlow

**Dashboard interactivo para análisis de contratos empresariales**  
Stack: React + Vite · Node.js/Express · MySQL · PHP auth bridge (PBS Hub)

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| XAMPP (Apache + MySQL 8+) | 8.x |
| Node.js | 18+ |
| npm | 9+ |
| PHP | 7.4+ (incluido en XAMPP) |

---

## Estructura del proyecto

```
c:\xampp\htdocs\contractos\
├── Design/               ← diseño original (referencia)
├── index.php             ← entry point Apache + auth gate
├── auth-bridge.php       ← valida sesión PBS Hub
├── config.php            ← overrides locales (opcional)
├── .htaccess             ← mod_rewrite rules
├── public/               ← build de React (generado con `npm run build`)
├── frontend/             ← código fuente Vite + React
└── backend/              ← Node.js Express API (puerto 3001)
```

---

## Setup en 5 pasos

### 1. Crear la base de datos

Con XAMPP corriendo, abre phpMyAdmin o MySQL CLI y ejecuta:

```bash
cd c:\xampp\htdocs\contractos\backend
npm install
npm run setup-db
```

Esto crea `contractos_db` con todas las tablas y los defaults de configuración.

### 2. Configurar variables de entorno del backend

```bash
cd backend
copy .env.example .env
```

Edita `backend\.env` si tu MySQL tiene contraseña:

```env
DB_PASSWORD=tu_password_mysql
```

Si el hub tiene base de datos con nombre diferente al default `pbs_hub`, ajusta también:

```env
HUB_DB_NAME=pbs_hub
```

### 3. Iniciar el servidor Node.js

```bash
cd c:\xampp\htdocs\contractos\backend
npm run dev       # con hot-reload (desarrollo)
# o
npm start         # producción
```

La API queda disponible en **http://10.0.0.187:3001** y el proxy público la expone en **https://hub.collab.grouppbs.com/contratos/api**.

### 4. Construir el frontend

```bash
cd c:\xampp\htdocs\contractos\frontend
npm install
npm run build
```

El build se genera en `c:\xampp\htdocs\contractos\public\`.

Para desarrollo con hot-reload:

```bash
npm run dev
# → http://10.0.0.187:5173  (sin auth gate)
```

### 5. Registrar la tool en PBS Hub

Para que el auth bridge funcione, el tool debe estar registrado en el panel de administración del PBS Hub:

1. Accede al hub con una cuenta admin.
2. Ve a **Admin → Tools → Create**.
3. Rellena:
   - **Name**: ContractFlow
   - **URL**: `https://10.0.0.187/performance-sales/`
   - **Category**: IT & Systems (o la que prefieras)
   - **Is Active**: ✓
4. Asigna acceso por usuario (`tool_user`) o departamento (`tool_department`).

---

## Uso

1. Accede desde el PBS Hub → click en la tool **ContractFlow**.
2. Sincroniza **Contratos vigentes** desde SQL Server con el botón **Actualizar fuentes**.
3. Sincroniza también **Vencidos y cancelados** desde el mismo modal, sin archivo intermedio.
4. Selecciona el año con el selector en el header.
5. Filtra con **Global Filters** o haz clic en el gráfico de doughnut.
6. Exporta la tabla con el botón **Export**.
7. Configura el umbral AT RISK en **Settings**.

---

## Sincronización SQL Server

Los datasets de **Vigentes** y **Vencidos y cancelados** se sincronizan directamente desde SQL Server.

- **Vigentes**: usa el query agregado por cliente/contrato y excluye tipos de contrato `USI` y `GAR`.
- **Vencidos y cancelados**: usa el query histórico sobre `Pan_Gc_Mae_Contrato`, `Pan_vwXlar_GC_Precios_Cancelaciones` y `Pan_vwXlar_GC_Precios_Fact12_Cancelaciones`, tomando contratos con `FECHA FINAL` entre `2025-01-01` y la fecha actual.
- **Responsable**: tanto vigentes como vencidos/cancelados llenan `commercial_owner` desde `Pl_Cem_Nombre`.

---

## API Reference

Base URL (upstream interno): `http://10.0.0.187:3001/api`

Base URL (pública vía PHP proxy): `https://hub.collab.grouppbs.com/contratos/api`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check (sin auth) |
| `POST` | `/upload` | Sube y parsea Excel (field: `file`) |
| `GET` | `/contracts` | Lista paginada con filtros |
| `GET` | `/contracts/filters` | Valores distintos para dropdowns |
| `GET` | `/analytics/kpis?year=` | 5 KPIs + delta vs PY |
| `GET` | `/analytics/charts?year=` | Doughnut, Line, Bar data |
| `GET` | `/analytics/expiry?year=` | Heatmap de vencimientos |
| `GET` | `/settings` | Configuración actual |
| `PUT` | `/settings` | Actualiza configuración |

All API endpoints (except `/health`) require the `contractos_token` cookie.

---

## Troubleshooting

### "Session expired or invalid" en llamadas API
→ El `contractos_token` expiró (8h). Recarga la página para que `index.php` lo renueve.

### "DB Connection failed"
→ Verifica que XAMPP MySQL esté corriendo y que `backend/.env` tenga el password correcto.

### La sincronización de vigentes falla
→ Verifica que SQL Server sea accesible desde el backend y que `backend/.env` tenga `SQLSERVER_HOST`, `SQLSERVER_DB_NAME`, `SQLSERVER_USER` y `SQLSERVER_PASSWORD` correctos.

### Gráficas vacías
→ Ejecuta la sincronización de vigentes y de vencidos/cancelados desde el modal de carga. Los datos se muestran dinámicamente por el año seleccionado.

### El frontend no carga estilos
→ Ejecuta `npm run build` en `frontend/`. La carpeta `public/` debe existir y contener `index.html`.

### Apache no redirige a `index.php`
→ Verifica que `mod_rewrite` esté habilitado en XAMPP (`httpd.conf`).

---

## Seguridad

- Todas las queries usan **prepared statements** (sin SQL injection).
- El `contractos_token` es `HttpOnly`, `SameSite=Strict`.
- El API valida el token en cada request antes de cualquier query.
- Rate limiting (120 req/min general, 10 req/min en upload).
- Headers de seguridad: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
