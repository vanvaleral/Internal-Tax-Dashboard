# Client Import Matching

Imports update an existing Client Master record instead of creating a duplicate
when its code, NPWP, or unique normalized name and company form match.
The preview shows Create / Update, matching method and canonical existing code.
Names ignore case, punctuation and a leading Indonesian corporate prefix; a known
PT/CV/etc. form must be compatible. These automatic matches remain exact, not fuzzy.

## Similar-Name Review

Unmatched import rows are also compared with existing Client Master names before
confirmation. The preview offers up to five ranked suggestions, including the
existing code, company form and Active/Inactive status. Selected records also show
their Contract/On Demand/Free of Charge category. Inactive clients are included for
identity review only; this does not add them to operational portfolio totals.

Comparison tolerates minor spelling errors, adjacent letter transpositions,
spacing, word order, accents and parenthesized contact names. Scores are name
similarity, not identity confidence. Short names have a stricter threshold. These
are suggestions only: a similar client is never selected or merged automatically.

Choose an existing client, or explicitly choose Create a separate new client.
Then click Review selected matches to rerun validation for the whole file before
Confirm Import becomes available. The uploaded rows remain unchanged in memory.
Selecting an existing client substitutes its current code and canonical name on
the server; a file typo cannot rename it. Other supplied columns retain the existing
import semantics, including explicit blanks. Conflicting company forms or NPWPs
cannot be selected from suggestions; correct the file or use an explicit existing
code for an intentional identity correction. A separate new client still needs a
new code. Multiple rows selecting one existing client block the entire batch.

The API also blocks unresolved/forged choices and compares the selected identity
and version again after matching. Final writes still use the existing locked,
transactional commit with exact expected-match/version checks and audit history.
Reviewing suggestions never writes clients or sends announcements.

Catalog reads request only the needed identity/status fields and paginate in
stable ID order, rather than silently checking only the first API page. A failed
or over-limit catalog read blocks import instead of treating unchecked names as
new. Comparison bounds expensive edit-distance work for long names. This is an
application-only update: no migration, extension, dependency, historical rewrite,
automatic merge or hosted data mutation is required.

## Safety Rules

- Existing code takes priority, then NPWP, then a unique compatible name.
- Conflicting identities, ambiguous names/NPWPs and multiple file rows targeting
  one record block the whole import. Specify an existing code to disambiguate.
- A different NPWP on a name-only match is rejected. Correct it explicitly by code.
- Existing IDs/codes, creation dates, engagement categories and linked history are
  retained. An unused code in the file does not replace a matched existing code.
- A blank code may update a unique existing match; new clients still need a code.
- Only columns present in the upload are changed. Blank cells in present columns
  clear optional fields/PICs, set fees to zero or disable an obligation. Required
  name/status values cannot be blank. Omit a column to retain its existing values.
- Do not pass rows through display defaults before saving: omitted fields would
  otherwise become Active, zero fees, blank PICs or enabled/disabled obligations.
- A preview records each matched ID and updated timestamp. Commit resolves again
  transactionally and rejects stale previews with HTTP 409; upload again to review.
- Supervisor/Leader import permissions remain enforced by the API. New functions
  are SECURITY INVOKER, empty search_path and executable only by service_role.

## Migration And Rollout

Apply `20261111030428_client_import_identity_matching.sql` before deploying the
new API/UI. It adds helpers and a guarded commit wrapper, without changing the
existing save RPC or rewriting any clients. Existing clients are not moved to a
different category or reactivated merely by matching an import.

The rare bulk import briefly takes a SHARE ROW EXCLUSIVE lock to prevent
concurrent identity changes between matching and upsert. Normal reads continue.
A five-second lock timeout or deadlock aborts the entire batch and audit, rather
than performing a partial import. Review/upload again after a conflict. Normal
single-client saves retain their existing path.

The guarded wrapper delegates writes/activity/batch history to the existing
transactional `commit_client_master_import`. Failed validation commits nothing.
Rollback: redeploy the prior API/UI; the additive functions may remain unused.
Never revert by rewriting existing client IDs or deleting audit records.

Local SQL fixtures run in a fresh disposable PostgreSQL database, never Supabase.
Before/after hosted migration checks inspect function grants and client counts/
hashes only. No real import is submitted during migration validation.

## Validation Record (2026-11-11)

- Hosted migration: `20261111031527_client_import_identity_matching` in the
  confirmed project `kedpcolyklquhfjzimvx`; local filename differs as in earlier
  migrations. Do not use an unreconciled `supabase db push`.
- The full-client JSON hash, total master count, activity count and batch count
  were identical before/after. No client records were imported or rewritten.
- Hosted read-only probes confirmed normalization and rejection of an unknown
  name with no code. Anonymous matching and authenticated commit are denied;
  the server service role can execute the guarded commit.
- Isolated PostgreSQL fixture passed: stable identity/category/history, company
  form disambiguation, explicit blank PIC, inactive status, conflicts, stale
  preview rejection and whole-batch/audit rollback.
- 527 automated tests, TypeScript typecheck and production build passed.
- Security advisor findings were unchanged; no new advisory was introduced.
  Existing project-wide findings remain outside this import change.
