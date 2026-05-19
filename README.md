# Performance Sales

Aplicación web para seguimiento de performance comercial, contratos, eficiencia operativa y cargas de reportes.

## Stack

- Frontend: React + Vite
- Backend API: Node.js + Express
- Entrada web: PHP + auth bridge
- Base de datos principal: MySQL
- Fuentes externas opcionales: SQL Server

## Estructura

```text
performance-sales/
├── auth-bridge.php        # valida sesión y emite el token de la app
├── config.example.php     # plantilla segura para overrides locales
├── config.php             # overrides locales ignorados por git
├── index.php              # entry point PHP / proxy / shell de la SPA
├── backend/               # API Express y scripts de base de datos
├── frontend/              # código fuente React + Vite
├── public/                # build generado del frontend
└── uploads/               # archivos cargados en runtime
```

## Requisitos

- PHP 7.4+
- Node.js 18+
- npm 9+
- MySQL 8+
- SQL Server accesible, si vas a usar sincronizaciones externas

## Puesta en marcha

### 1. Instalar dependencias

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configurar el backend

```bash
cd backend
copy .env.example .env
```

Ajusta al menos estas variables en `backend/.env`:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `HUB_DB_NAME`, `HUB_DB_USER`, `HUB_DB_PASSWORD`
- `CORS_ORIGINS`
- `PROXY_SHARED_SECRET`
- `PERFORMANCE_SALES_EMBED_SECRET`
- `SQLSERVER_*` si usarás sincronización desde SQL Server

### 3. Configurar el bridge PHP

```bash
copy config.example.php config.php
```

Define en `config.php` los valores reales de tu entorno:

- `HUB_APP_KEY`
- `HUB_SESSION_COOKIE`
- `HUB_LOGIN_URL`
- `APP_PUBLIC_BASE`
- `API_UPSTREAM_BASE`
- `API_PROXY_SHARED_SECRET`
- `PERFORMANCE_SALES_EMBED_SECRET`
- credenciales `APP_DB_*` y `HUB_DB_*`

### 4. Preparar la base de datos

```bash
cd backend
npm run setup-db
```

### 5. Levantar el entorno

Backend:

```bash
cd backend
npm run dev
```

Frontend en desarrollo:

```bash
cd frontend
npm run dev
```

Build para PHP/Apache:

```bash
cd frontend
npm run build
```

El build se escribe en `public/`. Ese contenido es generado y no se versiona en Git.

## Producción

- Apache/PHP sirve `index.php` y el build en `public/`.
- El backend Express se ejecuta por separado y atiende `/api`.
- El bridge PHP valida la sesión del hub y sincroniza el token HTTP-only que usa la API.
- Si necesitas iframe embedding, configura `APP_FRAME_ANCESTORS` en `config.php`.

## Variables relevantes

- `APP_ALLOW_LOCAL_DEV_AUTH=1` permite pruebas locales sin cookie del hub.
- `APP_TRUSTED_LOCAL_IPS` define qué IPs cuentan como entorno local confiable.
- `APP_DEBUG_TOKEN` habilita el endpoint de diagnóstico PHP sólo cuando se define explícitamente.
- `VITE_API_PROXY_TARGET` permite cambiar el proxy del dev server sin tocar el repo.

## Archivos locales que no deben publicarse

- `config.php`
- `backend/.env`
- `uploads/`
- `public/index.html` y `public/assets/` generados por Vite

## Troubleshooting

### La SPA no carga

Ejecuta `npm run build` dentro de `frontend/` para regenerar `public/index.html` y `public/assets/`.

### La API responde 401

Verifica que el bridge PHP esté emitiendo el cookie `performance_sales_token` y que el hub session cookie configurado sea correcto.

### La API no inicia

Revisa `backend/.env`, confirma acceso a MySQL y valida el puerto configurado en `PORT`.

### La sincronización externa falla

Confirma `SQLSERVER_HOST`, `SQLSERVER_PORT`, `SQLSERVER_DB_NAME`, `SQLSERVER_USER` y `SQLSERVER_PASSWORD`.
