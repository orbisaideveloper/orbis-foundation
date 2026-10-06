# Foundation migration and Maya integration checkpoint

Recorded 2026-10-06 from repository source, provider inspection and owner Termux
reports. Reverify live targets before future mutations.

## Ownership

| Repository | Responsibility | Database/configuration boundary |
| --- | --- | --- |
| Maya | Customer PWA, UI, device-local history | Public Auth configuration only; no provider/service secrets |
| Foundation | Shared AI gateway and Foundation Accounting | Own domain database; own provider credentials |
| Admin | Canonical identity and owner control plane | Dedicated Admin Supabase project and private control schemas |

Admin project: `aqcwhqdzniruvoqwfsij`. A Supabase Auth user ID is not automatically
the canonical ORBIS UUIDv7 identity or an Admin owner capability.

## Existing identity connection

Foundation `orbis-server/orbis-identity-client.cjs` reads server-only
`ORBIS_IDENTITY_WRITE_URL`, `ORBIS_IDENTITY_SERVICE_KEY`, and `ORBIS_PROJECT_ID`.
Its public account service stores the identity API response as an explicit link.
Admin `supabase/functions/orbis-identity-write/index.ts` reads `SUPABASE_DB_URL`
inside the Supabase Edge Function and validates the product service key.

Therefore an API-connected Foundation account need not have Admin's database URI
in Termux. Login, central identity, Maya membership and Admin owner authorization
are separate checks. The earlier Termux filename/key search did not prove the
absence of this API integration or verify a particular live account linkage.

## Foundation migrations applied

Owner report `ORBIS-FOUNDATION-MIGRATION-20261006-082659.txt` and receipt
`TERMUX-CMD-20261006-082737-169896912.txt` show exit 0/PASS.

- `20261004213000_allow_lottery_voucher_advance`: permits negative net payable
  while enforcing nonnegative gross/commission/TDS, TDS <= commission and exact
  gross - commission + TDS arithmetic.
- `20261004224500_add_accounting_transaction_voids`: extends the correction
  entity-type constraint for sale, stock movement, settlement and legacy day voids.

The checked database had no `_prisma_migrations` table. Exact committed SQL was
applied with `psql`, not `prisma migrate deploy`. A custom-format `public` schema
and data backup was created first and its archive listing checked. Inner BEGIN/
COMMIT wrappers were removed only in the private application copy; `psql -X
--single-transaction -v ON_ERROR_STOP=1` applied both files atomically. Both new
constraints were validated against existing rows and inspected after commit.
No historical accounting row was rewritten. Archive listing is not a restore drill.

Private evidence: `~/.config/orbis/backups/foundation-20261006-082659/`, containing
backup, SQL copies, SHA-256 checksums and source commit. Keep backup outside Git
and reports free of secrets. This manual application did not create Prisma
migration history. Do not rerun it or fabricate history; review a full baseline
before introducing Prisma migration automation. Never reset the live database.

## Admin migrations and pending Maya controls

The dedicated Admin provider history recorded these identity migrations:

| Recorded version | Name |
| --- | --- |
| 20260913031628 | identity_foundation |
| 20260913031638 | identity_action_guards |
| 20260913095616 | identity_write_api |
| 20260913095631 | identity_write_api_concurrency |
| 20260913100235 | identity_write_api_variable_scope |

Provider-recorded versions differ from repository source filenames. Preserve
existing history; do not reapply identity source files because a filename differs.

`database/control/maya-controls.sql` is reviewed source, not a completed live
migration. The last database inspection found no `orbis_control` schema. Future
application must verify the dedicated Admin target, preserve a recoverable backup,
use the existing managed migration workflow and exact SQL, then verify history,
tables, forced RLS, restricted RPC grants and disabled default switches. It must
not run on Foundation's database. Schema application does not enroll an owner,
grant Maya membership, enable provider writes or publish a Public release.

## Permanent Foundation local review

Keep `~/.config/orbis/local-auth.env` outside Git with permission 600.
Run `scripts/orbis-local-dev.sh` in one foreground Termux session and
`scripts/orbis-local-backend.sh` in another from `~/orbis-foundation`.
Frontend: localhost:3000; backend: localhost:3001. Stop each with Ctrl+C.
Launchers do not migrate the database. See Foundation `docs/LOCAL-RUNTIME.md`.

## Delivery and next work

This update changes Markdown only and makes no database/provider writes.
Maya uses owner-approved Termux main pushes. Admin uses its protected branch/PR
and exact-candidate staging policy. Each repository keeps its own quality gates.
Next: selected Maya dashboard UI, then real account/membership and Foundation AI
integration. Public/Development isolation requires separately verified releases.
