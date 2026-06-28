# HX Part Picks

HX Part Picks is a Google Apps Script automation for ingesting warehouse Part Pick PDF scans from Gmail, extracting raw form values with Gemini, appending raw and summary rows in Google Sheets, enriching those rows from EOD CSV reports, and archiving processed PDFs in Drive.

## Workflow

1. `processPrinterEmails()` searches Gmail for Inbox printer emails with PDF attachments.
2. Each original batch PDF is deduped by `BATCH::<md5 original PDF bytes>`.
3. The PDF splitter service splits batch PDFs into one portrait-oriented PDF per page and rotates landscape pages.
4. Each page is deduped by `BATCH::<same hash>::PAGE-<pageNumber>`.
5. Gemini extracts raw Part Pick form fields from each one-page PDF.
6. `Part Picks` receives the raw Gemini output as text.
7. `Part Pick Summary` receives append-only rows for new processing keys.
8. EOD report lookups enrich summary rows from:
   - `RP_Pallet_and_Product_by_Member.csv`
   - `RP_OUTSTANDING_ORDERS.csv`
9. Validation colours and notes are written to the `*` summary column.
10. Processed page and batch keys are written to `_Processed Keys`.
11. PDFs are archived in Drive under `Part Pick Automation/Processed PDFs`.
12. Successfully processed or duplicate-clean Gmail threads are labeled, marked read, and archived.

## Google Services And Scopes

The Apps Script project is bound to a Google Sheet and uses these manifest scopes:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/script.external_request`

External requests are made to Gemini and the PDF splitter service.

## Required Script Properties

Set these in Apps Script Project Settings > Script Properties:

- `GEMINI_API_KEY`: API key for Gemini extraction.
- `PDF_PROCESSOR_TOKEN`: bearer token sent to `CONFIG.pdf.processorEndpoint`.

Do not commit these values.

## Setup

1. Install clasp if you need local sync:
   ```powershell
   npm install -g @google/clasp
   ```
2. Log in with the Google account that owns the Apps Script project:
   ```powershell
   clasp login
   ```
3. Use the tracked `.clasp.json` to bind this repo to the existing Apps Script project. Do not replace it unless intentionally moving projects.
4. Open the bound Google Sheet and Apps Script project.
5. Confirm `appsscript.json` scopes and V8 runtime are enabled.
6. Add `GEMINI_API_KEY` and `PDF_PROCESSOR_TOKEN` script properties.
7. Push code only when approved:
   ```powershell
   clasp push
   ```
8. Run `setup()` manually once from Apps Script. `setup()` creates labels, sheets, folders, summary rows, and hides implementation sheets.
9. Create a time-driven trigger for `processPrinterEmails()`.

## Local And Dev Workflow

Before pushing changed JavaScript, run:

```powershell
node --check .\Code.js
node --check .\ChangedFile.js
git diff --check
```

This repo has no `package.json` and no local test runner. Apps Script tests run inside the bound project:

1. Make targeted changes locally.
2. Run `node --check` on changed JS files.
3. Review the diff.
4. After explicit approval, run `clasp push`.
5. In Apps Script, run `runLocalTests()`.
6. Smoke test with a controlled printer email/PDF and inspect `Processing Log`, `Part Picks`, `Part Pick Summary`, `_Processed Keys`, Drive archive, and Gmail labels.

## Deployment Checklist

- Confirm no secrets or private email contents are in the diff.
- Confirm `.clasp.json` still points to the intended project.
- Run `node --check` on changed JS files.
- Run `git diff --check`.
- Get explicit user approval for `clasp push`.
- After push, run `runLocalTests()`.
- Run `setup()` only when setup/schema/folder changes require it.
- Do not run `processPrinterEmails()` manually against production Gmail without explicit approval.
- Confirm the trigger is installed and not duplicated.

## Troubleshooting

- No emails found: check the Gmail query built by `GmailService.buildSearchQuery()`. It searches subject, PDF attachments, `label:"Inbox"`, and `newer_than:7d`. It does not currently filter by sender because `CONFIG.gmail.from` is commented out.
- Duplicate PDFs skipped: check `_Processed Keys` for `BATCH::<hash>` or `BATCH::<hash>::PAGE-<pageNumber>`. Labels are visibility only; dedupe keys decide processing.
- Gemini failure: extraction failure is non-fatal. The PDF is archived and a blank review row is appended with `GEMINI_FAILED`.
- PDF splitter failure: splitter failure is non-fatal. The original batch PDF is archived and a blank review row is appended with `PDF_SPLIT_FAILED`.
- Missing EOD reports: EOD reports are searched separately by sender, subject, attachment filename, and date. Missing reports produce validation notes and log entries.
- EOD header mismatch: required headers are matched after trimming, lowercasing, BOM stripping, and whitespace collapse. Missing required columns throw an EOD lookup error.
- Validation colours: green means OK or corrected, yellow means no match/blocked, red means mismatch.
- Apps Script timeout: reduce `CONFIG.gmail.maxThreadsPerRun`, rerun later, and rely on batch/page dedupe for partial retries.

## Safety Rules

- `setup()` is manual only.
- `processPrinterEmails()` must not run `setup()`.
- `Part Picks` stores raw Gemini output and must not be normalized.
- Summary append is append-only and must not overwrite existing rows.
- Gmail thread labels are visibility only; processed-key dedupe controls reprocessing.
- Do not remove the Inbox-only Gmail query behavior without understanding printer thread behavior.
- Do not use order-only Outstanding Orders matching.
