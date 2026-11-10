# Lumon MDR · Hackathon 4 · ChoclitosFC

Frontend React + TypeScript estricto, React Router, Vite, Tailwind 4 y fetch. **CP1 Orientación: base implementada**.

## Ejecutar

Node 24 LTS recomendado. Con npm:

```bash
npm ci
cp .env.example .env.local  # En PowerShell: Copy-Item .env.example .env.local
npm run dev
npm run build
```

Vite lee `.env.local` (ignorado por git). `VITE_*` solo para valores PÚBLICOS.

## Despliegue

Importar este repositorio en Vercel como Vite, `npm run build`, output `dist`, rama `main`. Agregar `VITE_API_BASE_URL` y `VITE_WS_BASE_URL` en Environment Variables. Habilitar la exposición automática de variables de sistema de Vercel para que `VERCEL_GIT_COMMIT_SHA` inyecte el SHA corto en `X-Lumon-Build`.

Crear `public/.well-known/lumon-verification.txt` con el token real entregado por `POST /integrations/deploy/challenge`, desplegar y ejecutar `POST /integrations/deploy/verify`. No dejar un token ficticio.

## CP1 implementado

- `/register`: registro con sesión directa (validar forma del cuerpo contra Swagger).
- `/login`: login y mensajes de error.
- `/dashboard`: página privada y permisos desde `/auth/me`.
- `/files`, `/files/:id/refine`: acceso privado según `files:read` (contenido CP2 aún pendiente).
- `/estado`: estado de API, integraciones y clearance.
- `403` y `404`.
- Refresh token en localStorage, access token SOLO en memoria; 1 refresh en vuelo por pestaña + Web Locks entre pestañas; broadcast de sesión y logout.
- `X-Lumon-Build` en TODAS las requests.

## Pendientes de verificación antes de decir CP1 aprobado

1. Revisar en Swagger los nombres exactos de `POST /auth/register` y el body de `POST /auth/logout`.
2. Probar login/logout real de ChoclitosFC; token antiguo compartido debe revocarse.
3. Probar sesión, refresh y logout en dos pestañas y con latencia/caos.
4. Probar registro con una cuadrilla de prueba **solo en un workspace diferente** o durante evaluación, sin duplicar la cuadrilla real.
5. Confirmar que `/auth/me` devuelve los permisos esperados.
6. Verificar dominio y deploy en producción; completar `hackathon.json` con URL e integrantes reales.

> No incluir contraseñas, access tokens, refresh tokens ni Cloudinary API secret en el repositorio.
