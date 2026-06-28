# Architecture

HX Part Picks is a single Apps Script project. Source is organized into service-style `.js` files loaded by Apps Script under the V8 runtime.

## Entry Points

- `setup()`: manual setup/maintenance only. Creates or updates Gmail labels, sheets, Drive folders, missing summary rows, internal sheet protections, and hidden implementation sheets. It is not a wipe/reset and does not clear existing data.
- `processPrinterEmails()`: production processor. Searches Gmail, processes PDFs, writes rows, dedupes, archives, labels, and updates summary rows. It must never call `setup()`.
- `runLocalTests()`: Apps Script test harness. Does not read real printer emails or call Gemini, but it does include a PDF processor health check.

## Main Modules

- `Code.js`: orchestration, locking, Gmail thread processing, batch/page dedupe, PDF split fallback, Gemini failure fallback.
- `Config.js`: central configuration, field definitions, summary columns, EOD report settings, Gemini settings, required script properties.
- `GmailService.js`: printer Gmail query, PDF attachment filtering, label setup.
- `PdfService.js`: external PDF splitter call and one-page PDF blob construction.
- `GeminiService.js`: Gemini request/response handling.
- `PromptService.js`: extraction prompt builder.
- `SheetService.js`: raw sheet, log sheet, processed key sheet, configuration sheet setup, raw row append.
- `SummaryService.js`: append-only summary creation by hidden `_Key`, summary formatting, SLA formulas, and `_Key`-based append placement.
- `SummaryEmailService.js`: sends reviewed summary row details and the original Drive PDF attachment when `Send Email` is checked; records durable email status and blocks duplicate sends.
- `DedupeService.js`: processed key lookup and writes.
- `DriveService.js`: Drive folder creation and PDF archive naming.
- `EodReportCsvService.js`: EOD report Gmail search, CSV parsing, required header lookup.
- `EodReportCoordinator.js`: applies EOD services to new summary rows and writes validation.
- `PalletAndProductByMemberEodReportService.js`: C/B/location/member/product enrichment.
- `OutstandingOrdersEodReportService.js`: order/customer/carrier/state enrichment using Order+B matching.
- `EodReportNormalisationService.js`: EOD comparison normalization and lookup key helpers.
- `EodReportValidationService.js`: validation colour and note state.
- `TestHarness.js`: Apps Script test functions.
- `Utils.js`: MD5 and relaxed JSON parsing helpers.

## Data Flow

```text
Gmail Inbox printer thread
  -> PDF attachments
  -> original batch hash
  -> batch dedupe check
  -> PDF splitter service
  -> one portrait PDF per page
  -> page dedupe check
  -> Drive archive
  -> Gemini extraction
  -> Part Picks raw row
  -> _Processed Keys page key
  -> batch completion key
  -> Part Pick Summary append-only row
  -> EOD CSV report lookups
  -> validation colours/notes
  -> optional reviewed-row email with archived PDF attachment
  -> processed Gmail label + archive
```

## Sheets And Tabs

- `Part Picks`: raw ingestion sheet. Stores processing metadata, Drive link, extraction status, and raw Gemini field output as text.
- `Part Pick Summary`: operator-facing sheet. Header row is configured as row 2. Column A `_Key` is hidden and stores the row identity copied from raw `Processing Key`. Existing rows/manual edits are not overwritten. This is the only normal user-editable sheet.
- `Processing Log`: status/error log rows.
- `_Processed Keys`: dedupe state for batch and page processing keys.
- `Configuration`: generated field configuration reference.
- `Test Results`: created by `runLocalTests()`.

All sheets except `Part Pick Summary` are internal implementation tabs. `setup()` hides them and applies the recognizable sheet-level protection `HX Part Picks protected internal sheet`. Protection is script-owned/idempotent. If that internal protection is found on Summary, setup removes only the script-owned protection and leaves Summary editable.

## Summary Append Placement

`Part Pick Summary` is append-only. `SummaryService.appendMissingSummaryRows()` scans raw `Part Picks` rows and appends only missing raw `Processing Key` values as Summary `_Key` values.

Rows are inserted after the last nonblank `_Key` in Summary column A, not after `getLastRow()`. This prevents checkbox validation, formulas, formatting, or accidentally touched far-lower rows from causing appends near row 1001.

`repairAppendMissingSummaryRows()` is a safe wrapper around the same sync. It only appends missing Summary rows for existing raw `Part Picks` data and does not call Gmail, PDF splitting, Gemini, Drive archive, dedupe, or email.

## Drive Folders

- Root folder: `Part Pick Automation`.
- Processed PDFs: `Part Pick Automation/Processed PDFs`.
- `CONFIG.drive.failedFolderName` exists in config, but current processing archives successful and fallback PDFs to the processed folder.

## Gmail Policy

Printer processing searches:

```text
subject:"Message from \"RNP5838795908AB\"" has:attachment filename:pdf label:"Inbox" newer_than:7d
```

The query is Inbox-only and intentionally does not exclude `PartPick/Processed` or `PartPick/Failed`. The printer can append later scans as replies to the same daily thread, causing labeled threads to return to Inbox. Thread labels are visibility markers only; `_Processed Keys` controls actual reprocessing.

`processPrinterEmails()` keeps a script lock, logs the Gmail query and found thread count, and processes each thread independently. An unexpected failure in one thread is logged as `THREAD_FAILED_UNEXPECTED` and does not prevent the final `SummaryService.appendMissingSummaryRows()` call.

EOD reports are searched separately from `donotreply@paperlesswms.com.au`, with CSV attachments and `newer_than:90d`.

## External Services

- PDF splitter endpoint: `https://part-pick-pdf-processor.onrender.com/split`.
- PDF splitter authentication: `PDF_PROCESSOR_TOKEN` script property as a bearer token.
- Gemini model: `gemini-2.5-flash`.
- Gemini authentication: `GEMINI_API_KEY` script property. Missing Gemini/API tokens may not surface in a run if no fresh PDF reaches Gemini or if Gemini failure is caught as non-fatal.

## Dedupe Keys

- Batch key: `BATCH::<md5 original PDF bytes>`.
- Page key: `BATCH::<same hash>::PAGE-<pageNumber>`.

The batch key is written only when all pages are accounted for. Page keys allow partial retry safety and compatibility with older rows that may not have a batch key.

## Summary Email Sends

The installable edit trigger still points to `handleSummaryRefreshEdit(e)`. That handler routes checked `Refresh EOD` edits to one-row EOD refresh and checked `Send Email` edits to `SummaryEmailService`.

`Send Email` only operates on the existing `Part Pick Summary` row. It reads the summary `PDF` Drive link, supports rich text links, `HYPERLINK` formulas, and raw Drive URLs, fetches the Drive PDF blob, and sends via `MailApp.sendEmail()` to `CONFIG.summaryEmail.recipient`.

Duplicate prevention is row-local and durable: a nonblank `Email Sent At`, `Email Status = SENT`, or another blocking email status prevents another send. The checkbox is left checked after success, but it is not the source of truth.

Subject format is `HX Part Pick: <Member or (blank member)> - <Order No. or (blank order)>`. The email body includes the spreadsheet link, PDF Drive link, row details, and validation/status note if available. Validation failures write `VALIDATION_FAILED` and reset `Send Email`. Send exceptions after reservation write `SEND_FAILED_BLOCKED` and reset `Send Email`; manual admin review/reset is required before retrying uncertain or blocked sends.
