# Migración a F:\MelendOS — estado (30/09/2026)

Resumen para Dan de la mudanza del repo fuera de `repo2RoomsMadrid`. Léelo entero
antes de tocar nada; hay un último paso manual que solo puedes hacer tú (cerrar el
IDE en la ruta vieja).

## Qué se ha hecho

- **El repo está ahora en `F:\MelendOS`** (copia completa: `.git`, `.env`,
  `node_modules`, `site/`, `CLAUDE.md`, `HANDOFF.md`, logos… todo). Es un repo Git
  válido y funcional, misma rama y commit, con los remotos intactos
  (`origin` → `github.com/danmelendo/demo-stays-ai`, `legacy` como estaba).
- **Fue una copia, no un `mv`.** El renombrado de la carpeta raíz falló con
  «device or resource busy»: la tienen abierta **tu IDE (VS Code) y esta sesión**
  como workspace, y no puedo cerrar tu editor desde aquí. Por eso la carpeta vieja
  `F:\Proyectos\repo2RoomsMadrid\demo-stays-ai` **sigue existiendo** (ver «Último
  paso» abajo).

## Qué está corriendo ahora (solo el túnel del PMS, como pediste)

- **Dev server del PMS** (Vite, backend real + acceso demo) en `http://localhost:5174`,
  arrancado **desde `F:\MelendOS`**.
- **Túnel de Cloudflare al PMS**:
  `https://tree-like-qualifying-certificates.trycloudflare.com`
  ⚠️ La URL del túnel rápido **cambia cada vez que se reinicia**.
- **NO** se han reabierto: el túnel de `/site`, el gateway de LLM (`llm-gateway.mjs`)
  ni su túnel. Si quieres el asistente IA en la demo, arráncalos aparte (ver
  `CLAUDE.md`).
- Se cerraron **todos** los procesos `node` para poder copiar (tú diste el OK).

### Reabrir el PMS + túnel desde F:\MelendOS (si se caen)

```bash
# Dev server (demo)
cd /f/MelendOS && set -a && . ./.env && set +a \
  && VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY" \
     VITE_DEMO_ACCESS=true npx vite dev --port 5174 --strictPort

# Túnel (en otra terminal); cloudflared está en el scratchpad de la sesión,
# o descárgalo/instálalo donde prefieras
cloudflared tunnel --no-autoupdate --url http://localhost:5174
```

## Último paso (manual, lo haces tú)

1. **Cierra VS Code** en la ruta vieja `F:\Proyectos\repo2RoomsMadrid\demo-stays-ai`.
2. **Abre `F:\MelendOS`** en el IDE y trabaja ya solo desde ahí.
3. Verifica: `git status`, `git log --oneline -3`, `npm run dev`.
4. Cuando estés seguro, **borra la carpeta vieja** (no pude mientras estaba
   bloqueada):
   ```powershell
   Remove-Item -Recurse -Force "F:\Proyectos\repo2RoomsMadrid\demo-stays-ai"
   ```
   Ojo: a partir de ese momento existe **una sola** copia. Hasta entonces hay dos
   working copies con el mismo remoto: **no edites en la vieja** para no divergir.

## Pendiente: separar `/site` como carpeta hermana (mismo repo)

Elegiste «carpeta hermana, mismo repo»: que el repo tenga `pms/` y `site/` como
carpetas separadas al mismo nivel. **No lo he hecho todavía, a propósito**, porque
mover el código actual a `pms/` y `site/` a la raíz **reescribe rutas de las que
depende la CI y el despliegue en vivo**:

- Todos los workflows de `.github/workflows/` (`deploy.yml` despliega el backend a
  la demo en cada merge, `site.yml`, `promote.yml`, `lake.yml`, `ops-alerts.yml`,
  keep-alive) apuntan a `supabase/`, `site/`, etc. desde la raíz.
- **Vercel**: el «Root Directory» del proyecto de `site` está fijado a `site` en el
  panel de Vercel (además de `vercel.json`); si cambia la estructura hay que
  actualizarlo o el deploy de la web se rompe.
- La CLI de Supabase espera `supabase/` en la raíz.

Hacerlo a la ligera **tumbaría la CI verde y el deploy de la demo**. Propuesta para
cuando quieras abordarlo, en su propia rama y probándolo:

1. Crear `pms/` y mover ahí todo lo del PMS (src, supabase, scripts, configs…).
2. Subir `site/` a la raíz como hermana de `pms/` (o dejar `site/` donde está y solo
   anidar el PMS; a decidir).
3. Reescribir cada workflow (`working-directory`, rutas de `supabase`, filtros de
   `paths`).
4. Actualizar el «Root Directory» del proyecto Vercel y `vercel.json`.
5. Ajustar `supabase/config.toml`/enlaces y los `tsconfig`/alias que usen rutas.
6. Verificar en verde: `npm run check`, un PR de prueba que dispare CI, y un deploy
   de `site` a Vercel de prueba.

Mientras tanto, `site/` sigue funcionando como subcarpeta (su `package.json`, su CI
y su Supabase de ventas), sin cambios.

## Estado del trabajo en curso (código)

- Rama actual: **`fix/panel-guard-and-role-label`**.
- PRs abiertos, a la espera de CI y merge:
  - **#76** `feat(checkin): single-use online check-in link` — enlace de check-in de
    un solo uso (datos + firma), email `checkin_invite`, botón para reenviar en el
    panel, guion de demo actualizado. Migración aplicada a la demo.
  - **#77** `fix(panel): keep the management panel to hotel staff only` — un huésped
    con sesión ya no ve el panel (redirige a `/web`); quitado el badge «admin» junto
    al email.
- Decisiones anotadas en `CLAUDE.md` (local). Tareas en `Cambiospendientes.md`
  (local): el punto del panel queda hecho (#77); este de la migración queda como
  «en curso» con este MD.
