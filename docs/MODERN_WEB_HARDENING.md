# Modern Web Hardening

Date: 2026-11-18. This is an incremental implementation of the Modern Web audit,
not a framework rewrite or a change to tax business rules.

## Security First

- Escape all dynamic values in the legacy Allocation print popup, including
  client names, preparer and allocation year. Printing does not execute stored
  markup. The newer Legal PDF preview remains unchanged.
- Pin Next.js 15.5.29 and DOMPurify 3.4.18, update compatible transitive packages,
  and refresh the vendored sanitizer. The production npm audit is clean at the
  time of validation. Recheck advisories before deploying future releases.
- Enforce same-origin framing, plugin blocking, base-URL restrictions, MIME
  sniffing protection, a conservative referrer policy and unused-device
  restrictions. Same-origin dashboard/Annual iframes and blob PDF previews are
  deliberately preserved.
- Dashboard/Cases and Annual HTML now enforce script CSP using SHA-256 hashes
  calculated from trusted repository templates. Unexpected inline scripts,
  inline event attributes and string evaluation are not authorized. Reviewed
  same-origin external scripts remain allowed. See the Phase 2 notes below.
- The outer static Next.js shell's script policy remains report-only. Resource
  restrictions are now enforced on the shell, auth pages and workspace documents.
  There is no report collection endpoint; violations are visible in DevTools.
  No client data or CSP reports go to another service.

## Keyboard And Responsive UI

`workspace-modals.js` adapts the existing modal renderers to native
`dialog.showModal()`. The browser supplies top-layer behavior and makes the
background inert. Existing close handlers still enforce save locks. Escape
uses those handlers, names are copied onto the dialog, and focus is restored
after closing, including when the invoking control was remounted. Settings
starts on Close; editors start on a usable field. Non-modal Notification Center
and My Work detail panels are not converted. Browsers without native dialog
support retain the existing overlay, not an incomplete custom focus trap.

My Work task titles are native buttons with Enter/Space activation. Completion
and favorite controls remain separate. One-second hold dragging and Alt+Up/Down
ordering still work from the title. Opening details with the keyboard focuses
the title editor; keyboard closing returns to the task title.

The My Work split layout responds to its actual container width, not just the
window width. Below 790px of available workspace, details become an overlay with
a Back to tasks control. This fixes the 34px clipping reproduced at a 901px
window with a mini sidebar. The wide two-column view is preserved. The earlier
opaque, transform-only drawer animation fix is included.

## Targeted Performance Changes

Selecting/closing a My Work task redraws only My Work, without replacing shell,
Settings and unrelated views, or serializing browser history. Navigation-only
preference writes coalesce during idle time (bounded to one second), with a
short deferred fallback. Pending preferences flush on page exit or when hidden.
Existing business-edit persistence and database save queues remain immediate.
Online preferences no longer serialize task, notification or legacy Annual
record collections. Those records were not needed to restore an online session;
fresh authorized server data remains authoritative. Offline preview persistence,
Allocation drafts, last allocation report, ordering and display preferences remain.
Storage failures now show a retryable browser warning; they are never presented
as a successful database save. Failed local storage plus Allocation drafts also
enables the existing leave-page warning.

`scripts/build-workspace-shell.cjs` extracts only the two dashboard head style
blocks plus submenu CSS. Install/build generates:

- `public/workspace-built.html`: protected production dashboard document.
- `public/workspace-shell.css`: data-free, reusable stylesheet with a content
  revision in its URL. It is preloaded while minimal inline loader CSS paints.

Production rewrites `/demo.html` to the generated document without changing its
URL or query parameters. Development and local file previews retain canonical
`public/demo.html`. The generator preserves body markup and script order; Phase 4
adds formatting-only compaction of the production business script. The workspace
waits for style readiness as well as verified database
readiness; a failed stylesheet keeps Retry visible instead of revealing an
unstyled or demo workspace. The shell stays out of layout until styling is ready
to avoid an initial unstyled scrollbar.

The generated document is approximately 15% smaller in raw HTML. This is not a
15% overall startup-time promise: total transferred CSS still exists, and network,
authentication and database latency remain factors. The existing Plus Jakarta
Sans font is self-hosted with its OFL license and `font-display: swap`, removing
the external Google Fonts CSS dependency without changing typography.

## Data And Deployment

No migration, RLS change, production data edit or new runtime dependency is
required. Save queues, version/conflict checks, ownership rules, audit history,
Case timeline behavior and Allocation Apply are unchanged. Only exact reviewed
CSS/JS/font paths bypass auth; generated HTML remains protected.

Generated files are ignored by Git and rebuilt by `postinstall` and `prebuild`.
Do not edit them directly. Deploy through the usual Next.js build. Raw static
hosting can continue using canonical `demo.html`, but does not receive Next.js
security headers or the production extraction/rewrite.

## Phase 2: Build Chain And Script Policy

Tailwind 3 has been replaced with pinned Tailwind 4.3.5 plus its official PostCSS
plugin. The custom theme config remains explicit; source scanning is restricted
to app/components/lib, not private snapshots, outputs or demo assets. Compatibility
reset rules and renamed shadow/blur/outline classes preserve the existing visual
direction. The obsolete Autoprefixer dependency is removed. A fresh full npm
audit, including development dependencies, reports zero advisories. Minimum
framework targets are current browsers: Chrome 111+, Safari 16.4+, Firefox 128+.
The migration follows the [official Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

`scripts/workspace-security.cjs` generates script policy for `/demo.html`,
`/workspace-built.html`, `/annual-accounting-sheet-demo.html` and the Annual Tax
redirect. Production hashes cover the exact generated dashboard; development
hashes cover canonical demo.html. Windows CRLF is normalized to the browser's LF
text before hashing. No per-request nonce, auth read, dynamic rendering or new
public reporting API is introduced. Code from requests, stored user records or
rendered responses is never hashed or given execution permission.

Inline stylesheet load/error attributes were replaced with ordinary event
listeners in known, hashed bootstrap scripts. This preserves immediate loader
paint, stylesheet readiness, failure messages and the Annual database gate. A
same-origin script allowlist is retained during the incremental migration; this
is not a claim of strict-dynamic or Trusted Types enforcement.

Five sample datasets moved out of live dashboard HTML into the protected
`workspace-demo-fixtures.js`. Only file-protocol previews load it, and the module
also rejects HTTP initialization. A missing local module produces a visible
Retry state. `workspace-navigation.js` separately owns the data-free sidebar
size behavior; existing navigation, responsive and keyboard tests cover it.
Modal discovery now skips document-wide scans for ordinary status updates when
no modal is open. Business renderers, save queues and permissions are unchanged.

The generated HTML is now about 725 KB, compared with about 746 KB after Phase 1.
This is a payload reduction, not a measured production startup-time guarantee.

## Phase 3: On-Demand Tools And Auth Script Protection

`workspace-assets.js` loads only reviewed, data-free feature code. The Cases
assessment/report scripts and workflow stylesheet load when Cases is opened;
the Allocation report script loads when Preview PDF is requested. Concurrent
requests share one download, successful assets are reused, and failed assets
can be retried without rerunning successful scripts. Asset loading never reads,
caches or changes operational records. The exact public asset allowlist includes
these code files, not dashboard HTML, sample datasets or API responses.

Shared case-status calculations remain in the core workflow module so badges,
PSA filters and management summaries do not depend on opening Cases first.
Cold navigation shows a local loading/retry state without blocking other menus;
late completion cannot redraw the menu the user navigated to. When Cases is the
initial workspace, its tools and verified data must both be ready before the
existing secure loading cover is removed. Failed loading preserves confirmed
rows. PDF preview reserves its window before awaiting code, preserving browser
popup activation; failures leave an explanation and unlock explicit retry.

Sign-in and onboarding now use a fresh 144-bit nonce per response with enforced
`strict-dynamic` script policy and blocked inline event attributes. Middleware
overwrites caller-supplied nonce headers, forwards the policy to Next's renderer,
and retains the same response for Supabase cookie refresh. Only those two auth
pages are dynamically rendered and privately uncached. The data-free dashboard
entry remains static, with no added identity query or per-request rendering.
Production does not allow script `unsafe-eval`; development retains the framework
debugging exception. This follows the [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy).

No database migration, production record changes or new dependency is required.
These changes reduce eager code work, not Supabase request latency. Measure
real cold/warm startup after deployment before claiming an end-to-end speedup.

## Phase 4: The Three P2 Findings

### Excessive Interaction Work

My Work task-local menus, archive navigation and Add step now use the scoped
renderer and coalesced preference writer. Business edits and their confirmed-save
refresh also render only My Work, preserving active-editor focus and list scroll.
They no longer rebuild shell chrome, Settings, notification panels or unrelated
editors, or serialize a browser-history snapshot for a task-local change. Existing
task queues, conflict detection, retry indicators and Case-timeline invalidation
remain unchanged. Online browser history no longer clones shared notifications
or restores an old inbox when navigating Back; offline preview history remains.

### Large Startup Document

The production generator compacts the main script with Terser's formatting pass,
using the minifier already shipped by the pinned Next version. Compression and
identifier mangling are explicitly disabled: there is no dead-code removal or
business-expression optimization. Canonical demo.html remains readable and is
still used for local-file previews and development. Compaction happens only at
build/config time, never on a browser interaction. Unexpected runtime structure
fails the build instead of silently skipping the transformation.

With the current source, the generated document falls from 728,057 bytes before
script compaction to 623,626 bytes, a further 14.3% raw HTML reduction. The main
script falls from 715,482 to 611,051 bytes. The overall generated HTML is 27.4%
smaller than the canonical 858,595-byte source, including earlier CSS extraction.
These are payload measurements, not equivalent loading-time improvements. The
large business closure still needs incremental module extraction.

### Security-Policy Enforcement

`lib/resource-policy.cjs` shares enforced resource directives across static HTML,
Next pages and nonce-protected auth responses. Styles/fonts/images remain local,
uploaded data images and PDF blobs remain usable, connections are limited to
same-origin and HTTPS/WSS Supabase endpoints, and frames/workers/manifests are
restricted. No general HTTPS image/frame/connect wildcard is permitted. Inline
styles remain supported for existing templates, but this does not grant inline
script execution. Dashboard and Annual scripts retain exact build hashes; auth
pages retain per-response nonces. Development alone permits loopback WebSockets
for Next hot reload; production does not. Policies follow the [MDN CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

The outer static React shell still cannot honestly be labelled a strict script
policy: its framework-generated inline bootstrap remains report-only. Enforcing
per-request nonces there would require dynamic rendering; this pass deliberately
does not trade away its static startup path. Trusted Types also remains pending.
No database migration, data change or new package is required.

## Scoped Loading Follow-Up

Phase 5 adds complete paginated Clients/Cases/staff/task readers, narrower
menu-specific startup dependencies, lazy My Work archive months and year-scoped
Annual responses. Authorization and full-workspace compare-and-swap saves remain
unchanged. See `SCOPED_WORKSPACE_LOADING.md` for compatibility, validation and the
remaining team-wide Annual JSON read limitation. No migration is required.

## Remaining Work

- Main business JavaScript and many renderers remain in canonical `demo.html`.
  Extract modules incrementally behind existing regression tests, rather than
  converting the entire iframe/spreadsheet architecture in one release.
- Extend enforced script CSP to the static outer Next.js shell after choosing a
  framework-compatible strategy. Auth pages now use nonces, but applying that
  strategy globally would sacrifice the static startup path. The existing
  framing/MIME/base and inline-event-attribute protections apply on the shell.
- Continue Trusted Types discovery. Resource restrictions are now enforced, but
  existing sanitization and server authorization must not be replaced by CSP.
- Compare real Vercel cold/warm startup and interaction timings after deployment;
  fictional local UI checks do not measure production Supabase performance.

## Verification

Regression coverage includes print injection, security-header policy, authenticated
asset boundaries, generated-body preservation, stylesheet failure/readiness,
native modal lifecycle/save guards, native task controls, title drag ordering,
scoped rendering, coalesced preferences, storage failure/retry, and existing
Cases/Clients/Allocation/startup/task workflows. Browser checks use a localhost-only,
read-only fictional fixture and never change production records.

Phase 1 validation: 274 selected regression tests passed, including the corrected
deferred-preference test on rerun; TypeScript and the production build passed.
Local production HTTP smoke checks confirmed security headers, public stylesheet
and font responses, and unauthenticated redirects on both dashboard HTML paths.
Browser checks verified Enter/Space, modal keyboard containment/Escape, restored
focus, opacity 1, zero drawer clipping at 901px and the retained wide split layout.

Phase 2 validation: 280 selected regression checks passed after rerunning the
affected suites (57/57). The three initial failures were test fixtures still
invoking removed inline style handlers or missing a Storage method; both loader
failure and success paths now execute the actual event-listener setup. TypeScript,
production build and the final full npm audit passed (zero vulnerabilities).

Browser checks confirmed dashboard task opening and Settings, Accounting and Tax
Annual startup under enforced CSP, and working PDF/Excel engines. A separate
fictional page verified rejection of an unexpected inline script and click
handler. Production login retained its 460px desktop card, 42px inputs, existing
font/accent and zero horizontal overflow at 390px. Production HTTP checks verified
exact expected policies, all four protected HTML redirects, public UI assets and
the protected offline fixture asset. No production records were edited and no
database migration or push was performed.

Phase 3 validation: selected regression suites passed after correcting warm-load
fixtures for optional Cases modules and the reserved PDF window. The final
affected-suite rerun passed 55/55 checks, including cold navigation, partial asset
failure/retry, initial-cover gating, popup blocking, duplicate clicks and unchanged
PSA classifications. TypeScript and the production build passed; the full npm
audit again reported zero vulnerabilities.

Production HTTP checks verified fresh nonces on successive auth responses,
matching nonces on all 18 rendered scripts per auth document, no production
`unsafe-eval`, private/no-store auth caching, the static root cache hit, exact
dashboard/Annual hash policies, protected HTML/sample-data redirects and retained
unauthenticated API rejection. Browser checks verified password visibility and
registration toggles without CSP errors, and onboarding's missing-invite redirect.
No credentials were entered or accounts created.

A separate read-only fictional browser fixture verified no optional Cases/PDF
assets at initial My Work load, exactly one Cases bundle after opening Cases,
reuse after navigating away/back, and a successfully opened Allocation PDF popup.
The PDF blob contents were not inspected because browser URL policy disallowed
that inspection. These local checks do not establish real Vercel/Supabase timing.
No migration, production record edits, commit or push was performed in this pass.

Phase 4 validation: the 167-check selected regression run passed after correcting
the compacted-code test instrumentation (affected suite rerun: 13/13). The final
policy/build tests passed 16/16, including the development-only WebSocket
exception. TypeScript, production build and diff whitespace checks passed.
Business-save tests cover finite create/edit queues, drafts, failed saves,
version conflicts and timeline invalidation; task-local DOM identity tests run
against both canonical and compacted production code.

Read-only fictional browser checks covered task details, the native date dialog,
Cases, both embedded Annual workbooks and PDF/Excel engine initialization under
the enforced policy. A dedicated probe visibly blocked unapproved connections,
images, frames, inline script and inline click code. Production HTTP checks
confirmed auth nonces, enforced resource headers, exact generated script hashes,
static root caching and protected-route rejection. Sign-in password visibility
and registration controls hydrated without CSP errors. No credentials were
entered or production records changed. No commit or push was performed.
