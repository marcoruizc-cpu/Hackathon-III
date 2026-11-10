# CP4 de Lumon · Expedientes e incidencias

El paquete está preparado para Hackathon-III sobre `8b96904`, con React 19, TypeScript 7 y Vite. Agrega las pantallas en `src/cp4/`. El parche añade sus rutas y enlaces, y habilita la lectura de la cabecera `ETag` en la sesión compartida.

## Integrar en VS Code

1. Abre **Hackathon-III** en VS Code con **Archivo → Abrir carpeta**.
2. Descomprime `CP4-Hackathon-III.zip`. Copia la carpeta descomprimida `src/cp4` dentro de `src` de Hackathon-III. Copia `cp4-integracion.patch` temporalmente a la raíz del proyecto, junto a `package.json`.
3. Abre **Terminal → Nueva terminal** en VS Code y ejecuta estos comandos desde la raíz.

   ```bash
   git status --short
   git apply --check cp4-integracion.patch
   git apply cp4-integracion.patch
   npm ci
   npm run build
   npm run dev
   ```

   Si falla `git apply --check` porque CP3 ya cambió el enrutador o el menú, abre el parche en VS Code e incorpora a mano sus adiciones a `src/App.tsx`, `src/components/Layout.tsx` y `src/lib/session.ts`, conservando los cambios de tu compañero. Vuelve a ejecutar el build. Puedes mover el parche fuera del repositorio después de aplicarlo.
4. Abre la URL que indique Vite. Inicia sesión. El menú muestra **Expedientes** e **Incidencias** según los permisos del usuario.

## Configurar Supabase para TEAM-038

1. En el proyecto Supabase del equipo, abre **SQL Editor → New query**, pega `supabase-cp4.sql` y ejecútalo. Si ese proyecto ya tiene políticas de Storage, revisa que ninguna otra política permita a `anon` escribir fuera de `TEAM-038/`, actualizar o borrar objetos del bucket. Las políticas permisivas se combinan con OR.
2. En `.env.local` de Hackathon-III agrega estas dos líneas con la URL y la clave publicable de tu proyecto. Conserva la configuración de Lumon que ya usa CP1. Reinicia Vite después de guardar.

   ```dotenv
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
   ```

   La clave válida empieza con `sb_publishable_` o es una clave JWT de rol `anon`. Las variables `VITE_*` aparecen en el código que recibe el navegador.
3. En Swagger, autoriza con una sesión del equipo y ejecuta `PUT /integrations/storage` con el cuerpo siguiente, usando los mismos valores públicos.

   ```json
   {
     "provider": "SUPABASE",
     "projectUrl": "https://TU-PROYECTO.supabase.co",
     "bucket": "lumon-media",
     "publicKey": "TU_CLAVE_PUBLICABLE"
   }
   ```

   Confirma HTTP 200 y los resultados S0–S7. La operación sube archivos de prueba al proyecto. Si devuelve 422, revisa `details.checks` antes de repetir.
4. Para el despliegue agrega las mismas dos variables públicas a Vercel y vuelve a desplegar cuando tu equipo integre los cambios. El equipo debe completar el clearance desde su origen verificado. Si Lumon responde `423 CLEARANCE_REQUIRED`, revisa **Estado** y el estado del Piso de Pruebas.

## Probar el flujo real

- Abre `/refiners`, filtra por departamento y busca un nombre. Recarga y comprueba que la URL conserva los filtros.
- Abre un expediente y entra en **Cambiar fotocheck**. Elige una imagen, ajusta el recorte y pulsa **Preparar recorte → Subir imagen**. Debe aparecer un WebP de 512 × 512 de hasta 122 880 bytes y actualizarse el fotocheck sin recargar.
- En `/incidents/new`, añade dos espacios de foto y arranca ambas subidas. Comprueba que cada una tiene su propio progreso y que el botón de envío se habilita al confirmar todas. Envía y verifica el reporte y sus fotos en `/incidents`.
- Con caos activo, si un envío devuelve 503, espera el `Retry-After` indicado y vuelve a intentar. El formulario y las fotos confirmadas deben seguir ahí.

## Fuentes

- [Enunciado oficial de CP4](https://github.com/CS2031-DBP/hackaton-frontend-lumon-20262#checkpoint-4--expedientes)
- [Swagger de Lumon](https://lumon-api.vercel.app/docs)
- [Contrato OpenAPI](https://lumon-api.vercel.app/openapi.json)
- [Repositorio Hackathon-III](https://github.com/marcoruizc-cpu/Hackathon-III)
