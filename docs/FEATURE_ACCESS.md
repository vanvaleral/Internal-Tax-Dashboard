# Feature Access And Development Notices

Management > PIC Features contains the shared access matrix for Associate and
Leader. Associate is the display label for the existing `staff` role; no staff
identity, role value, PIC assignment or operational history is migrated.

Supervisor, Partner and legacy Admin retain every menu. Only these roles can
manage PIC Access, including account creation, roles, claim codes and archival.
PIC Features has the same Supervisor/Partner/Admin-only restriction, but is a
separate sibling tab: PIC Access remains focused on staff/account administration.
Saved navigation and breadcrumbs recognize PIC Features. Unsaved feature settings
survive switching Management tabs; saving/reloading uses the existing versioned
settings API and audit history. Moving this panel requires no database migration.
Leader no longer inherits staff-directory administration. Partner/Admin identities
remain manageable only by a Partner/Admin under the existing identity rules.

## Controls

Each level has its own rule for Operations, Cases, My Work, Clients, Management,
Allocation and Notifications. Profile always stays available for account recovery.

- Hidden: no menu and no feature API access.
- Available: normal menu access, with existing role/PIC edit restrictions intact.
- Available + notice: normal access with a custom in-progress message on opening.
- Maintenance / blocked: visible menu with the notice, but no feature data/actions.

Initially Operations, Management and Allocation are hidden for both staff levels;
My Work, Cases, Clients, Notifications and Profile remain available. Configure the
matrix after deployment before inviting staff to unfinished features. These are
level-wide rules, not individual employee overrides. Settings do not grant an
Associate leadership rights, fee access or a different client ownership scope.
Notification delivery rules are unchanged; these controls govern the feature and
its development notice, not which events generate notifications.

## Enforcement And Refresh

Next middleware checks feature APIs against the current active staff role and
saved policy. Bootstrap normalizes unavailable remembered views and omits locked
feature packets. The middleware-exempt annual endpoint checks access itself on
every GET/POST. Full-screen annual sheets use that same endpoint. Direct Supabase
requests also face additive restrictive RLS policies on the feature tables; these
do not replace existing ownership policies. Unnecessary anonymous privileges and
authenticated TRUNCATE/TRIGGER/REFERENCES privileges on these tables are revoked;
service-role application writes are unaffected. Shared scoped Client Master and staff
picklists remain available for permitted work; disabling a menu does not erase
its records or rewrite another module's historical references.

Background loaders skip disabled features. Rules refresh on returning to the tab,
every two minutes while visible, and through a same-origin cross-tab signal after
settings save. Already open UI can briefly show old controls until refresh, but
every new server request is checked against current settings. A previously loaded
record cannot be recalled from a browser's memory by changing access.

## Migration And Risks

Apply `supabase/migrations/202611060001_feature_access_settings.sql` before deploying
the matching app. It adds a singleton settings table, immutable application audit
records, a service-role-only save function and restrictive feature policies. No
existing operational rows are changed. Defaults restrict staff immediately after
migration, so coordinate rollout with an available Supervisor.

Saving locks the settings row, verifies the acting active Supervisor/Partner/Admin,
checks the expected version, validates all rules, then writes settings and audit
in one transaction. A stale editor must reload; it cannot silently overwrite a
newer policy. Authenticated/anonymous clients cannot modify settings or execute
the save function. SQL helpers use an empty search path. Read failures fail closed;
a missing migration uses the same restrictive defaults and disables the Save UI.

Rollback: restore the previous application only after intentionally reviewing
staff access. Keep settings/audit history; change access rules or explicitly remove
only the new `feature_access_required` policies if old behavior is required.
Do not delete staff or operational records as part of rollback.

## Verification

Test Supervisor/Partner full access, Associate/Leader independent rules, preview
messages, maintenance (including direct API/full-screen URLs), blocked PIC Access
administration for Leaders, stale saves, and untouched operational records.
Automated coverage lives in `tests/feature-access.test.ts`, existing bootstrap,
annual, staff-directory and dashboard regression suites.

### Hosted Rollout / 6 November 2026

Applied to project `kedpcolyklquhfjzimvx`; hosted migration ledger version
`20261106034438_feature_access_settings` corresponds to the local migration above.
Do not reapply it because the hosted timestamp differs. Verified ten restrictive
policies, no anon/authenticated save-function execution, readable active-staff
settings, Leader restrictions and Supervisor full access under authenticated role
simulation. Transactional save/audit and stale-version/Leader rejection tests were
rolled back: the deployed settings remain at version 1, with no test audit rows.
The migration contains no writes to existing operational tables; live user activity
continued during rollout. No client/task data was exported for this change.
