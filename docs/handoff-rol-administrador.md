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

> ⚠️ **Rename the stash's migrations.** They are called `20260929110000_…` and `20260929110100_…`, but `main` already has later ones (`20260929130000`, `20260929180000_security_hardening`, `20260929190000_payment_config`). `deploy.yml` (CD to the demo on every merge) and `promote.yml` (production) run `supabase db push` without `--include-all`, which refuses a migration older than the last one applied: the merge would break the deploy. None of those later migrations redefines the functions below, so moving them after is safe. Check `ls supabase/migrations | tail -1` when you apply the stash and take a later timestamp if `main` has moved again.

- `supabase/migrations/20260929200000_platform_role_enum.sql` (was `…110000`): `alter type staff_role add value 'platform'`. It goes in **its own migration** because an enum value cannot be used in the transaction that adds it (it already happened with `group`).
- `supabase/migrations/20260929200100_platform_role.sql` (was `…110100`):
  - Table `platform_admins (user_id, note, require_mfa boolean not null default true, created_at)`, with RLS enabled and no policies: only the platform (service role) edits it.
  - Trigger `sync_platform_admin`: when someone is added to `platform_admins`, it inserts a `tenant_members` row with role `platform` in **every** hotel. When they are removed, it deletes those rows.
  - **Support is a dedicated account that is not staff of any hotel.** `tenant_members` has one row per `(tenant_id, user_id)`, so an account that is already a member of a hotel cannot also be support there: `on conflict do update` would overwrite its role and removing it from `platform_admins` would then delete the row (losing the original role); `on conflict do nothing` would leave it without support rights in that hotel. The trigger must **refuse** (raise) adding to `platform_admins` a user who already has any `tenant_members` row, and `guard_staff_changes` must refuse adding a support account to a hotel with another role. **Check what the stash does and change it if it is not this.**
  - Trigger `add_platform_admins` on `tenants`: every new hotel gets the existing platform admins.
  - `has_tenant_role()` holds for `platform` whatever role is asked for. The group role still counts as admin.
  - `is_tenant_staff()` includes `platform`.
  - **Two-step verification is required for support (decided by Dan, 29/09/2026).** `staff_mfa_ok()`, which `is_tenant_member`, `has_tenant_role` and `is_tenant_staff` all call, becomes: if the caller is in `platform_admins` with `require_mfa`, only `aal2` counts (even with no factor set up, so a support account without the app sees nothing); for everyone else, the current rule (aal2, or no verified factor). The demo seed sets `require_mfa = false` on the shared demo account; production never does.
  - `guard_staff_changes()`: from the hotel nobody can give, change or remove the `platform` role, just as with `group`. The platform (with no `auth.uid()`) has no limits.
  - `forbid_group_operations` is not touched: support **can** operate.

**Edge Functions** that compare roles by hand. `platform` is added to:

- `channel-simulate`
- `payments-create` (**missing from the stash**: line ~133 filters staff with `.in("role", ["admin", "reception"])`, so support could not create the payment link of a booking)
- `payments-refund`
- `staff-invite`
- `tenant-modules`

`admin-copilot`, `ses-dispatch`, `verifactu-dispatch` and `channels-dispatch` only check membership: no change.

All of these go through `verifiedUser()` in `_shared/http.ts`, which repeats `staff_mfa_ok()` in TS. It needs the same rule: if the user is in `platform_admins` with `require_mfa`, only `aal2` counts, factor or not (read the row with the service client).

Intentionally **not** changed: `hotel_alert_recipients()` (emails to the hotel's management) only takes `admin` and `group`, so support does not get every hotel's alert emails; and the «a hotel cannot be left without management» check in `guard_staff_changes` does not count support as management.

**Panel:**

- `src/lib/roles.ts`: `AppRole` includes `platform`. `isPlatform`, and `isAdmin`/`isReception`/`canOperate`/`canMessage` are true for support.
- `src/components/AppSidebar.tsx`: the label under the logo reads «Administrador» **only** for `platform`. Management reads «Dirección» (it used to read «Administrador»), then «Dirección de grupo» and «Recepción».
- `src/lib/team.ts` and `src/routes/_app.team.tsx`: in «Equipo» it shows as «Administrador (soporte de Melend/OS)», visible to the hotel but without a role selector and without «Quitar».

**Demo and production:**

- `supabase/functions/_shared/demo/accounts.ts`: demo account `soporte@demostays.example`, «Administrador · soporte de Melend/OS», after the rest of the staff (so it is not the default option).
- `scripts/seed-auth.mjs`: for `role === "platform"` it inserts into `platform_admins`, and the trigger gives it every hotel.
- `scripts/platform-admin.mjs`: `<email>`, `--remove`, `--list` and `--note`. It grants or removes the role in production (the account must already exist and must not be staff of any hotel; say so clearly if the trigger refuses it).
- `scripts/prod-check.mjs`: add a check that fails if any row of `platform_admins` has `require_mfa = false` or a user without a verified TOTP factor.

## Where the work in progress is

```sh
git stash list                                     # stash@{0}: platform-admin role (pending Dan's approval)
git stash show -p --include-untracked stash@{0}    # see everything, migrations and script included
git switch -c feat/platform-admin origin/main
git stash apply stash@{0}                          # apply (untracked files included)
```

If `main` has moved and `apply` conflicts, resolve it by hand. The changes are small (about 50 lines plus the two migrations).

## What is left, in order

1. Apply the stash on a branch from `main`, **rename the two migrations** (see above), make the changes this handoff adds to the stash (support = dedicated account, required MFA in `staff_mfa_ok()` and `verifiedUser()`, `payments-create`, `prod-check.mjs`) and check that `npm run typecheck` passes.
   - `src/integrations/supabase/types.ts` needs `platform` in `staff_role` (in two places: `Enums` and `Constants`). Better, regenerate the types after applying the migration.
   - The stash does **not** include that change, because the previous session was cut off there.
2. **Tests in `supabase/tests/rls.test.ts`** (inside the rollback, like the others):
   - A user in `platform_admins` becomes a member of every hotel with `platform`, and of a hotel created afterwards too.
   - They see reservations and can operate (for example, insert a reservation) in any hotel.
   - `has_tenant_role(…, 'admin')` holds for them.
   - Management of a hotel **cannot** give, change or remove the `platform` role (`guard_staff_changes`).
   - Removing them from `platform_admins` removes them from every hotel.
   - A normal staff member does not see or edit `platform_admins`.
   - Adding to `platform_admins` a user who is already staff of a hotel is refused, and that user keeps their role.
   - Management of a hotel cannot add a support account with another role.
   - With `require_mfa`, support at `aal1` sees nothing (no reservations, `has_tenant_role` false), with or without a verified factor; at `aal2` it sees and operates.
   - With `require_mfa = false` (the demo account), `aal1` works.
3. Apply to the demo **with the CI stopped** (the DB tests run against the demo).
   1. Dry run of both migrations: `node --env-file=.env scripts/sql-dry-run.mjs …`. The dry run does not execute PL/pgSQL bodies (lesson of 27/09): the triggers are only really tested by step 3.
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

## Decided with Dan (29/09/2026, after reviewing this handoff)

- **Two-step verification required for support**: in the design above (`require_mfa`, false only for the demo account).
- **Support is a dedicated account**, never staff of a hotel at the same time.
- **Migrations after the last one on `main`**, so the CD and the promotion to production do not break.

## To raise with Dan

- **Traceability:** support's actions are already recorded with its `user_id` (`domain_events`, `audit_log`). Say so in the processing agreement (GDPR art. 28) with the hotel.

## Details

- On this machine bash heredocs mangle backslashes: write scripts and files with the Write tool.
- Never secrets in the repo (GitGuardian scans the PRs).
