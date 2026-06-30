# Operations Runbook

## Setup Checklist

1. Confirm the repo is bound to the intended Apps Script project with `.clasp.json`.
2. Confirm `appsscript.json` scopes match the current code.
   Current scopes are `spreadsheets.currentonly`, `drive`, `gmail.modify`, `script.external_request`, `script.scriptapp`, `userinfo.email`, and `script.send_mail`.
3. Set script properties:
   - `GEMINI_API_KEY`
   - `PDF_PROCESSOR_TOKEN`
4. Push code only after explicit approval.
5. Run `setup()` manually from Apps Script only when setup/schema/folder maintenance is needed. `setup()` is not a wipe/reset and does not clear existing data.
6. Confirm sheets exist:
   - `Part Picks`
   - `Part Pick Summary`
   - `Processing Log`
   - `_Processed Keys`
   - `Configuration`
   - `_Summary Email Ledger`
   - `_EOD Report Cache`
   - `_EOD Outstanding Orders Cache`
   - `_EOD Pallet Product Cache`
7. Confirm internal sheets are hidden and protected, while `Part Pick Summary` remains editable.
8. Confirm Drive folder `Part Pick Automation/Processed PDFs` exists.
9. Create one time-driven trigger for `processPrinterEmails()`. `processPrinterEmails()` must never call `setup()`.
10. Run `installSummaryRefreshTrigger()` once to create the installable edit trigger for `handleSummaryRefreshEdit(e)`.
11. Optionally run `installDailyEodCacheWarmupTrigger()` once to create the separate daily warmup trigger for today's EOD report cache around 5am.

## Sheet Protection

`setup()` applies a sheet-level protection named `HX Part Picks protected internal sheet` to every sheet except `CONFIG.summary.sheetName` (`Part Pick Summary`). It also removes only that script-owned protection from the summary sheet if it is ever found there.

The protected internal sheets are still writable by the spreadsheet owner or script-running user, so automation can append raw rows, log entries, and processed keys. Normal users should edit only `Part Pick Summary`, including manual corrections, `Refresh`, and `Email`.

If internal sheet protection is removed or permissions drift, rerun `setup()` manually from Apps Script to reapply protections. Do not remove unrelated/manual protections unless their purpose is understood.

## Daily Behavior

The trigger runs `processPrinterEmails()`. The script locks, searches Inbox printer threads, processes new PDF pages, archives PDFs, appends raw and summary rows, applies EOD enrichment, writes processed keys, labels successful threads, marks them read, and archives them.

The printer can append later scans as replies to an existing daily thread. The Gmail search intentionally includes Inbox threads even if they already have processed/failed labels. Dedupe keys decide whether a PDF/page is new.

Each Gmail thread is processed independently. An unexpected failure in one thread is logged and does not prevent the final summary append pass. Missing Gemini/API tokens may not throw if no fresh PDF reaches Gemini or if Gemini extraction fails in the non-fatal path that creates a blank review row.

## Manual EOD Refresh

If a parsed summary value is wrong, edit the value directly on the existing `Part Pick Summary` row, then check that row's `Refresh` checkbox. The installable edit trigger reruns EOD enrichment and validation for that row only, using the current row values as the source of truth, and resets the checkbox after completion or failure. Setup migrates old `Refresh EOD` headers to `Refresh`.

This does not append a summary row, touch raw `Part Picks` rows, process printer emails, process PDFs, call Gemini, archive files, change Gmail labels, or change processed keys.

## EOD Cache Warmup

The EOD persistent cache is current-day only. EOD lookups still keep an in-memory runtime cache for any requested date inside one execution, but historical/random date requests should not read or write non-today data through the persistent sheet cache path.

The cache is row-based for scale. `_EOD Report Cache` stores metadata only. `_EOD Outstanding Orders Cache` stores today's Outstanding Orders rows where `Order Type` is exactly `OL` after normalization. `_EOD Pallet Product Cache` stores today's full Pallet/Product by Member report with no filtering.

`warmTodayEodReportCache()` warms only today's `outstandingOrders` and `palletAndProductByMembers` reports using the script timezone. It logs report key, date key, cache status, and safe row counts only. It does not touch Summary rows, raw `Part Picks`, printer Gmail, Gemini, Drive archive, labels, processed-key dedupe, or email.

`installDailyEodCacheWarmupTrigger()` installs or repairs the optional daily time trigger around 5am for the warmup handler. EOD report emails arrive around 2am, so one 5am warmup is sufficient for now. It is separate from `installSummaryRefreshTrigger()` and must not remove unrelated triggers.

## Send Summary Email

After reviewing and correcting an existing `Part Pick Summary` row, check that row's `Email` checkbox. The same installable edit trigger used by `Refresh` routes the edit to the summary email sender. It sends one plain-text email to `jesse.lang.04@gmail.com` with summary row details, the spreadsheet link, the Drive PDF link, and the original PDF attached. Setup migrates old `Send Email` headers to `Email`.

The recipient comes from `CONFIG.summaryEmail.recipient`. The subject format is `HX Part Pick: <Member or (blank member)> - <Order No. or (blank order)>`. The PDF attachment is resolved from the Summary `PDF` column, including rich text links, `HYPERLINK` formulas, and raw Drive URLs.

The email body includes displayed values for Carrier, State, Customer Name, Member, Owner, Order No., Location, C Number, B Number, Product Code, Product Description, Vintage, and Bottle Size. `Date Completed`, `SLA`, checkbox values, and validation/status notes are not included.

After a successful send, the script records `SENT` in `_Summary Email Ledger`, leaves `Email` checked, and best-effort protects the checked `Email` cell with the protection description `HX Part Picks sent email lock`.

The durable duplicate guard is `_Summary Email Ledger`, not the checkbox. If the ledger status is `SENT`, `SENDING`, `SEND_FAILED_BLOCKED`, `UNKNOWN`, or another nonblank blocking status, checking `Email` again will not send another email.

If validation fails before sending, such as a missing product field or unreadable PDF link, the script writes `VALIDATION_FAILED` and the error detail to the ledger, resets `Email` to unchecked, and does not send.

If the send attempt throws after the row is reserved, the script writes `SEND_FAILED_BLOCKED` and the error detail to the ledger, then unchecks `Email`. No duplicate email is more important than automatic retry. An admin must verify whether an email was sent before resetting ledger state and retrying.

This email path does not append a summary row, touch raw `Part Picks` rows, process printer emails, process PDFs, call Gemini, archive files, change Gmail labels, or change processed keys.

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

## Summary Repair

`repairAppendMissingSummaryRows()` is safe to run manually when Summary is missing rows for existing raw `Part Picks` data. It only calls `SummaryService.appendMissingSummaryRows()` and logs append stats. It does not search Gmail, process PDFs, call Gemini, archive files, write dedupe keys, label threads, or send email.

If it reports `skippedExistingKey`, the raw `Processing Key` is already present as Summary `_Key`. If it reports `rawProcessingKeyHeaderFound=false`, the raw `Part Picks` header does not match the expected `Processing Key` header.

## One-Off Product Backfill

`OneOffProductBackfill.js` is temporary migration code for historical Summary rows that predate visible product columns. It is not normal processing.

After approved deployment, run `oneOffBackfillProductColumnsFromBNumberNotes()` first. It reads existing product notes on `B Number` and fills blank `Product Code`, `Product Description`, `Vintage`, and `Bottle Size` cells without overwriting existing values unless called with `force: true`.

For rows still missing product fields, run `oneOffBackfillProductColumnsViaRefresh()`. It processes a small batch of incomplete keyed Summary rows by calling the normal one-row EOD refresh path. If more rows remain, it stores temporary progress in script properties and creates one temporary continuation trigger for `oneOffProductBackfillViaRefreshTrigger_()`. The stored `nextRow` value is the next actual `Part Pick Summary` sheet row number, not a data-row offset.

Use `oneOffGetProductBackfillViaRefreshStatus()` to inspect progress and `oneOffResetProductBackfillViaRefreshState()` to clear abandoned state/triggers. Remove `OneOffProductBackfill.js` after the backfill is verified.

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

Troubleshooting notes:

- If Summary appends near row 1001, check for old deployed code still using `getLastRow()+1`, stale `TEST::` keys or real `_Key` values far down Summary column A, and Apps Script not being updated because `clasp push` was not run.
- If `processPrinterEmails()` appears to do nothing, check the Gmail query, found thread count, skipped duplicate batch/page logs, thread-level failure logs, and summary append stats.
- If email does not send, check `_Summary Email Ledger` and `Processing Log` before retrying.

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
8. If Summary trigger code changed, run `installSummaryRefreshTrigger()` and confirm it did not create duplicates.
9. If EOD cache warmup trigger code changed or the trigger is not present, run `installDailyEodCacheWarmupTrigger()` and confirm it did not create duplicates.
10. Smoke test with controlled input before relying on the trigger. For `Email`, use a reviewed test summary row and confirm exactly one email is sent to the configured recipient with the PDF attached.
