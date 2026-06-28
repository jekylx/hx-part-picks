# Operations Runbook

## Setup Checklist

1. Confirm the repo is bound to the intended Apps Script project with `.clasp.json`.
2. Confirm `appsscript.json` scopes match the current code.
3. Set script properties:
   - `GEMINI_API_KEY`
   - `PDF_PROCESSOR_TOKEN`
4. Push code only after explicit approval.
5. Run `setup()` manually from Apps Script.
6. Confirm sheets exist:
   - `Part Picks`
   - `Part Pick Summary`
   - `Processing Log`
   - `_Processed Keys`
   - `Configuration`
7. Confirm Drive folder `Part Pick Automation/Processed PDFs` exists.
8. Create one time-driven trigger for `processPrinterEmails()`.

## Daily Behavior

The trigger runs `processPrinterEmails()`. The script locks, searches Inbox printer threads, processes new PDF pages, archives PDFs, appends raw and summary rows, applies EOD enrichment, writes processed keys, labels successful threads, marks them read, and archives them.

The printer can append later scans as replies to an existing daily thread. The Gmail search intentionally includes Inbox threads even if they already have processed/failed labels. Dedupe keys decide whether a PDF/page is new.

## Labels

- `PartPick/Processed`: added when at least one PDF was processed or duplicate-clean skipped and no critical failure occurred.
- `PartPick/Failed`: added when Drive save or sheet append critically fails.

Labels are visibility markers. They are not dedupe state.

## Archive Folders

Archived PDFs are saved in Drive under `Part Pick Automation/Processed PDFs`. Names include the email timestamp, page number when available, and a short message ID.

## Failure Handling

- Gemini failure: non-fatal. A blank review row is appended with `GEMINI_FAILED`.
- PDF splitter failure: non-fatal. The original PDF is archived and a blank review row is appended with `PDF_SPLIT_FAILED`.
- Drive or sheet append failure: critical. The page key is not marked processed, the batch key is not written, and the thread receives the failed label.
- EOD lookup failure: does not block ingestion. It is logged and should be visible through validation notes when possible.

## Reprocessing Safely

- To retry a failed page, fix the cause and rerun only with explicit approval.
- Do not remove processed labels expecting reprocessing; labels do not control dedupe.
- To force reprocessing, remove the specific `_Processed Keys` entries only after confirming the exact batch/page key and business impact.
- Avoid deleting a batch key if all page keys are not understood; page keys protect partial retries.
- Keep the Inbox query behavior unless the printer threading behavior has been revalidated.

## Inspecting Logs

Use:

- `Processing Log` sheet for status, message ID, filename, details, and links.
- Apps Script executions and Cloud Logging for stack traces.
- `_Processed Keys` to check dedupe state.
- Gmail thread labels/read/archive state for operator visibility.

## Updating Script Properties

In Apps Script:

1. Open Project Settings.
2. Edit Script Properties.
3. Update `GEMINI_API_KEY` or `PDF_PROCESSOR_TOKEN`.
4. Do not paste secrets into source files, docs, commits, or logs.

## Safe Deployment

1. Inspect current repo status.
2. Run `node --check` on changed JS files.
3. Run `git diff --check`.
4. Review diff for secrets and unintended code changes.
5. Get explicit approval for `clasp push`.
6. Run `clasp push`.
7. Run `runLocalTests()` in Apps Script.
8. Smoke test with controlled input before relying on the trigger.
