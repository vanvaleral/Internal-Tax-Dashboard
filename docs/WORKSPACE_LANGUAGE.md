# Dashboard language audit

Use **Pekerjaan Bulanan** and **Pekerjaan Tahunan** for staff workflows that
include more than filing. Use **SPT Masa**, **SPT Tahunan**, **Masa Pajak**,
**Jatuh Tempo**, and **Pembetulan SPT** where the interface refers to that specific
filing, period, deadline, or correction. Preserve document acronyms and names.
Use **Pengurangan Sanksi Administrasi** for the PSA workflow and **Klien Lepas**
for client engagements without a recurring contract. The status, matching keys,
numeric values, names and identity of each record remain the same in EN and ID.

Terminology references: [DJP filing terminology](https://www.pajak.go.id/id/peraturan/surat-pemberitahuan-spt),
[DJP payment and filing terminology](https://www.pajak.go.id/id/batas-waktu-pembayaran-penyetoran-dan-pelaporan-pajak),
and [DJP examination and sanctions terminology](https://pajak.go.id/id/pemeriksaan-pajak-dan-sanksi-administrasi).
These are terminology references, not a source of dashboard deadline rules.

Run `node scripts/audit-workspace-language.cjs --verbose` for a candidate list.
The inventory checks literal headings, fields, descriptions and labels in the
main workspace, special sheets and print surfaces. It intentionally flags some
Indonesian terms and names for review, and does not prove that a catalog entry
is actually rendered in both languages or catch all interpolated messages.

Before publishing as a complete translation, verify EN and ID in the actual
production layouts: desktop and mobile navigation, sign-in, role-specific
menus, both annual sheets embedded and full-screen, case and client dialogs,
tooltips and screen-reader labels, empty/loading/error states, offline and sync
messages, and printed reports. Keep user-authored notes and notification
messages in the original language. Localize app-generated messages by event
or validation code rather than passing arbitrary stored text through a translator.
Sign-in, registration and onboarding use the same local browser preference as
the workspace. Case, Allocation and Structure report builders translate their
own copy at print time, separately from report data. The tax-claim editor
translates its controls without rewriting the Indonesian document or draft
values. A language change does not rename a client, staff member, or case.
The inbox translates recognized app-generated case, task-assignment, and
client-import notices based on their recorded source. It preserves the original
record and manual broadcasts, even if the broadcast uses similar wording.
Common server validation messages are translated at their display surface;
uncatalogued messages still need review rather than losing their original detail.
Rights, filters, select values, case deadlines, audit history and export
identifiers must not change when language changes. The current pass does not
meet the full-screen coverage criterion for publishing.
