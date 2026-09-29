# Handoff: «Administrador» role (Melend/OS support with full control)

_29/09/2026. For a new Claude Code session **on this machine** (the work in progress is in a local `git stash`). Read `CLAUDE.md` and `MAPA.md` first._

## What Dan wants and what he has authorised

From `Cambiospendientes.md`, in his words:

- «Dentro de los roles de usuario para los hoteles debe haber uno que sea Administrador. Ese rol es de control total para mí, para poder gestionar el PMS cuando el cliente necesite asistencia/soporte o haya que revisar el producto.»
- «Hay que retirar la etiqueta de "administrador" de los roles que no lo son, ya que aparece debajo del logo del nombre en el PMS.»

Dan is the owner of the platform. **He explicitly authorises (29/09/2026) creating this support role with full access to every hotel of the PMS**, managed only by the platform.

- In the previous session the automatic permission system blocked applying it to the database, because it grants total access. That is why the work is in a stash.
- To start the new session, Dan can say: «Lee `docs/handoff-rol-administrador.md` y termina la tarea; te autorizo a crear el rol de soporte con control total».

## Design (already written in the stash)

**Database** (two migrations, in this order):

- `supabase/migrations/20260929110000_platform_role_enum.sql`: `alter type staff_role add value 'platform'`. It goes in **its own migration** because an enum value cannot be used in the transaction that adds it (it already happened with `group`).
- `supabase/migrations/20260929110100_platform_role.sql`:
  - Table `platform_admins (user_id, note, created_at)`, with RLS enabled and no policies: only the platform (service role) edits it.
  - Trigger `sync_platform_admin`: when someone is added to `platform_admins`, it inserts a `tenant_members` row with role `platform` in **every** hotel. When they are removed, it deletes those rows.
  - Trigger `add_platform_admins` on `tenants`: every new hotel gets the existing platform admins.
  - `has_tenant_role()` holds for `platform` whatever role is asked for. The group role still counts as admin.
  - `is_tenant_staff()` includes `platform`.
  - `staff_mfa_ok()` is kept.
  - `guard_staff_changes()`: from the hotel nobody can give, change or remove the `platform` role, just as with `group`. The platform (with no `auth.uid()`) has no limits.
  - `forbid_group_operations` is not touched: support **can** operate.

**Edge Functions** that compare roles by hand. `platform` is added to:

- `channel-simulate`
- `payments-refund`
- `staff-invite`
- `tenant-modules`

**Panel:**

- `src/lib/roles.ts`: `AppRole` includes `platform`. `isPlatform`, and `isAdmin`/`isReception`/`canOperate`/`canMessage` are true for support.
- `src/components/AppSidebar.tsx`: the label under the logo reads «Administrador» **only** for `platform`. Management reads «Dirección» (it used to read «Administrador»), then «Dirección de grupo» and «Recepción».
- `src/lib/team.ts` and `src/routes/_app.team.tsx`: in «Equipo» it shows as «Administrador (soporte de Melend/OS)», visible to the hotel but without a role selector and without «Quitar».

**Demo and production:**

- `supabase/functions/_shared/demo/accounts.ts`: demo account `soporte@demostays.example`, «Administrador · soporte de Melend/OS», after the rest of the staff (so it is not the default option).
- `scripts/seed-auth.mjs`: for `role === "platform"` it inserts into `platform_admins`, and the trigger gives it every hotel.
- `scripts/platform-admin.mjs`: `<email>`, `--remove`, `--list` and `--note`. It grants or removes the role in production (the account must already exist).

## Where the work in progress is

```sh
git stash list                                     # stash@{0}: platform-admin role (pending Dan's approval)
git stash show -p --include-untracked stash@{0}    # see everything, migrations and script included
git switch -c feat/platform-admin origin/main
git stash apply stash@{0}                          # apply (untracked files included)
```

If `main` has moved and `apply` conflicts, resolve it by hand. The changes are small (about 50 lines plus the two migrations).

## What is left, in order

1. Apply the stash on a branch from `main` and check that `npm run typecheck` passes.
   - `src/integrations/supabase/types.ts` needs `platform` in `staff_role` (in two places: `Enums` and `Constants`). Better, regenerate the types after applying the migration.
   - The stash does **not** include that change, because the previous session was cut off there.
2. **Tests in `supabase/tests/rls.test.ts`** (inside the rollback, like the others):
   - A user in `platform_admins` becomes a member of every hotel with `platform`, and of a hotel created afterwards too.
   - They see reservations and can operate (for example, insert a reservation) in any hotel.
   - `has_tenant_role(…, 'admin')` holds for them.
   - Management of a hotel **cannot** give, change or remove the `platform` role (`guard_staff_changes`).
   - Removing them from `platform_admins` removes them from every hotel.
   - A normal staff member does not see or edit `platform_admins`.
3. Apply to the demo **with the CI stopped** (the DB tests run against the demo).
   1. Dry run of both migrations: `node --env-file=.env scripts/sql-dry-run.mjs …`.
   2. `npx supabase db push --db-url "$SUPABASE_DB_URL"` (with `set -a; . ./.env; set +a`; **never** the global CLI session, which is production).
   3. `npm run test:db`.
   4. Regenerate the types.
4. `node --env-file=.env scripts/seed-auth.mjs` so the demo account `soporte@…` exists (also with the CI stopped).
5. PR with the CI green. The merge redeploys `demo-login`, which reads `accounts.ts`.
6. In the browser, with «Ver como» → «Administrador · soporte de Melend/OS»:
   - The label under the logo.
   - It sees both hotels and can operate.
   - In «Equipo» it shows as support and cannot be removed.
7. Documentation:
   - `CLAUDE.md`: replace the entry «Rol "Administrador"… pendiente de que Dan lo autorice».
   - `MAPA.md`: roles row.
   - `Cambiospendientes.md`: tick the task with the PR.

## Decisions to raise with Dan

- **Two-step verification required for `platform`.** Recommended: it has access to every hotel. It could require `aal2` in `has_tenant_role`/`is_tenant_staff` when the role is `platform`. In the demo, the shared accounts cannot turn on MFA, so the demo account would need an exception, or it should be done only in production.
- **Traceability:** support's actions are already recorded with its `user_id` (`domain_events`, `audit_log`). Say so in the processing agreement (GDPR art. 28) with the hotel.

## Details

- On this machine bash heredocs mangle backslashes: write scripts and files with the Write tool.
- Never secrets in the repo (GitGuardian scans the PRs).
