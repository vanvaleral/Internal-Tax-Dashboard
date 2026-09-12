# Google Sheets Client Master Integration

## Goal

Google Sheets may be the working source for client master data during the transition to the application. The app must read a validated version of that data and retain an audit trail for changes that affect operations.

## Confirmed Source Worksheet

The supplied spreadsheet contains the current master source in the visible `LIST KLIEN` worksheet (sheet ID `1587818350`). It has four frozen header rows and 31 columns. The first four rows are presentation and grouped headings, while client records begin on row 5.

This worksheet is valuable operational source data, but it is not yet a direct application import table because it contains merged headers, calculated allocation fields, old and new PIC columns, and no immutable app client identifier.

### Verified Source Mapping

| `LIST KLIEN` column | Proposed app field | Sync treatment |
| --- | --- | --- |
| `NO.` | Legacy source row number | Reference only; never use as a permanent key because rows can be reordered. |
| `STATUS` | Contract / engagement status | Normalize into approved application statuses. |
| `DIFFICULTIES` | Difficulty score | Optional workload attribute; validate as a numeric value. |
| `NAMA KLIEN` | Legal client name | Required source value. |
| `KPP` | Tax office | New client-master attribute. |
| `START KONTRAK` | Engagement start | Normalize to `YYYY-MM-DD`; current examples include year-only values. |
| `STOP KONTRAK` | Engagement end | Normalize to `YYYY-MM-DD` when present. |
| `FEE MASA` / `DPP` | Monthly DPP fee | Numeric value after Indonesian-number normalization. |
| `% FEE TAHUNAN` / `FEE TAHUNAN` | Annual fee | Numeric value, with the percentage retained only if its business meaning is confirmed. |
| `TEAM BARU` - `PAJAK` | Tax PIC | Preferred current ownership source. |
| `TEAM BARU` - `LAP KEU` | Accounting PIC | Preferred current ownership source. |
| `TEAM LAMA` columns | Previous PICs | Retain as PIC-change audit context, not current ownership. |

The source does **not** currently provide all application fields needed for recurring compliance, including NPWP, client address, individual tax-obligation toggles, and a stable `client_code`.

## Recommended Direction

Use Google Sheets as the temporary source of truth only through a server-side sync service:

1. A supervisor maintains `LIST KLIEN` as the business source while a normalized `APP CLIENT MASTER` tab is introduced in the same spreadsheet for integration.
2. The server reads the worksheet using a Google service account or OAuth connection.
3. The sync validates rows and matches clients by immutable `client_code`.
4. Valid changes are upserted into the application database and logged.
5. Invalid rows are returned as a review report and do not partially overwrite live client records.

The browser must not access Sheets credentials or write directly to the Sheet.

## Normalized Integration Tab

Do not rewrite or delete the current `LIST KLIEN` presentation layout. Instead, create an `APP CLIENT MASTER` tab populated from the approved source and maintained with one flat header row. This creates a reliable interface between the spreadsheet and the application while preserving the team's existing workbook.

The application sync should read this normalized tab, not the visual dashboard-style source table directly.

## Minimum Required Columns

Use a stable first-row header with these columns:

| Sheet column | App field | Required |
| --- | --- | --- |
| `client_code` | Immutable client identifier | Yes |
| `client_name` | Legal client name | Yes |
| `status` | Active, Onboarding, Paused, or Inactive | Yes |
| `npwp` | NPWP | No |
| `address` | Client address | No |
| `industry` | Industry | No |
| `tax_pic` | Tax PIC | Yes |
| `acc_pic` | Accounting PIC | Yes |
| `monthly_fee` | Monthly DPP fee | No |
| `annual_fee` | Annual DPP fee | No |
| `engagement_start` | Contract start date (`YYYY-MM-DD`) | No |
| `engagement_end` | Contract end date (`YYYY-MM-DD`) | No |
| `pph21` | Tax obligation enabled | No |
| `unifikasi` | Tax obligation enabled | No |
| `pph25_pp55` | Tax obligation enabled | No |
| `phr_pb1` | Tax obligation enabled | No |
| `ppn` | Tax obligation enabled | No |

Use `TRUE` or `FALSE` for tax-obligation columns. PIC values must match the application staff directory.

## Sync Rules

- `client_code` is the matching key. Never use name matching as the final sync key.
- A sync must show a preview: new, changed, unchanged, and invalid records.
- PIC, obligation, fee, and contract-date changes must create activity records.
- Missing client rows must never delete clients automatically. They should be marked for supervisor review.
- Only approved users can start or approve a sync.
- The Portfolio Dashboard should read the application database after sync, not query Sheets directly on every page load.

## Implementation Sequence

1. Add a stable `client_code` for each existing client in `APP CLIENT MASTER`.
2. Confirm the approved mapping for `STATUS` and whether `FEE TAHUNAN` is a contractual or calculated fee.
3. Add missing operational fields: NPWP, address, industry, and tax-obligation flags.
4. Build a server-only preview sync that reports new, changed, unchanged, and invalid rows.
5. Review a preview with a supervisor, then permit an approved upsert into the application database.
6. Switch the Portfolio Dashboard and client directory to database data after the first successful import.

## What Is Needed To Connect It

1. The Google Sheet URL.
2. Approval to add the non-destructive `APP CLIENT MASTER` integration tab in the supplied workbook.
3. Confirmation of the business meaning of the annual-fee percentage and the desired normalized status values.
4. One deployment sharing method: a Google service account shared as Viewer/Editor, or an OAuth connection for a designated supervisor account.

## Current Demo Limitation

The current `public/demo.html` client master is local browser demo data. The new Portfolio Dashboard uses that local data so its numbers are demonstrable, but it is not yet connected to Google Sheets or the production database. The connected Google Drive session used to inspect the workbook is not an application runtime credential and cannot be reused by deployed users.
