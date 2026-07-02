# Architecture

HX Part Picks is a single Apps Script project. Source is organized into service-style `.js` files loaded by Apps Script under the V8 runtime.

## Entry Points

- `setup()`: manual setup/maintenance only. Creates or updates Gmail labels, sheets, Drive folders, missing summary rows, internal sheet protections, and hidden implementation sheets. It is not a wipe/reset and does not clear existing data.
- `processPrinterEmails()`: production processor. Searches Gmail, processes PDFs, writes rows, dedupes, archives, labels, and updates summary rows. It must never call `setup()`.
- `warmTodayEodReportCache()`: production-safe cache warmup. Fetches only today's Outstanding Orders and Pallet/Product EOD reports into the current-day sheet cache and has no Summary/raw/Gemini/printer Gmail/Drive/dedupe/email side effects.
- `installDailyEodCacheWarmupTrigger()`: optional manual installer for the separate daily 5am EOD cache warmup trigger.
- `runLocalTests()`: Apps Script test harness. Does not read real printer emails or call Gemini, but it does include a PDF processor health check.

## Main Modules

- `Code.js`: public entry points and thin orchestration only.
- `Config.js`: central configuration, field definitions, summary columns, EOD report settings, Gemini settings, required script properties.
- `services/EmailProcessorService.js`: production printer email processing, locking, thread isolation, PDF split fallback, Gemini failure fallback, raw row append, Drive archive, labels, and final Summary sync.
- `services/ProcessingKeyService.js`: immutable batch/page processing key construction.
- `services/GmailService.js`: printer Gmail query, PDF attachment filtering, label setup.
- `services/PdfService.js`: external PDF splitter call and one-page PDF blob construction.
- `services/GeminiService.js`: Gemini request/response handling.
- `services/PromptService.js`: extraction prompt builder.
- `SheetService.js`: raw sheet, log sheet, processed key sheet, configuration sheet setup, raw row append.
- `SummaryService.js`: facade for append-only summary orchestration and compatibility delegates.
- `summary/SummarySchemaService.js`: Summary headers, schema migration, aliases, and column lookups.
- `summary/SummaryDraftService.js`: raw-to-summary draft mapping and safe summary-value normalisation.
- `summary/SummaryAppendWriterService.js`: single visible final Summary append, writable column groups, sparse notes/backgrounds, and `_Key`-based append placement.
- `summary/SummaryFormatService.js`: summary formatting, owned validation placement, hidden operational columns, and conditional formatting.
- `summary/SummarySlaService.js`: SLA formula generation.
- `summary/SummaryEditRoutingService.js`: lightweight edit classification for Refresh and Email checkbox edits.
- `summary/SummaryRefreshService.js`: queued Refresh worker, grouping, deadline handling, continuation trigger management, and per-row failure capture.
- `SummaryEmailService.js`: sends reviewed summary row details and the original Drive PDF attachment when `Email` is checked; records durable email state in `_Summary Email Ledger` and blocks duplicate sends.
- `DedupeService.js`: processed key lookup and writes.
- `DriveService.js`: Drive folder creation and PDF archive naming.
- `eod/EodReportCsvService.js`: EOD report runtime cache, sheet-backed cache, Gmail search, CSV parsing, required header lookup.
- `EodReportCoordinator.js`: applies EOD services to new summary rows and writes validation.
- `PalletAndProductByMemberEodReportService.js`: C/B/location/member/product enrichment.
- `OutstandingOrdersEodReportService.js`: order/customer/carrier/state enrichment using Order+B matching.
- `eod/EodReportNormalisationService.js`: EOD comparison normalization and lookup key helpers.
- `eod/EodReportValidationService.js`: validation colour and note state.
- `TestHarness.js`: compatibility anchor for the old monolithic harness filename.
- `tests/TestRunner.js`: public Apps Script test runner functions and suite registry.
- `tests/TestAssertions.js`, `tests/TestMocks.js`, `tests/TestFixtures.js`: shared test infrastructure.
- `tests/<domain>/*.js`: focused test registries by behavior area.
- `oneoff/OneOffProductBackfill.js`: temporary migration helpers for historical product columns. Remove after the verified backfill.
- `services/Utils.js`: MD5 and relaxed JSON parsing helpers.

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
  -> Summary draft built in memory
  -> safe Summary normalisation
  -> EOD CSV report lookups and validation in memory
  -> final Part Pick Summary append-only row
  -> validation colours/notes written with the append
  -> optional reviewed-row Email checkbox with archived PDF attachment
  -> processed Gmail label + archive
```

## Sheets And Tabs

- `Part Picks`: raw ingestion sheet. Stores processing metadata, Drive link, extraction status, and raw Gemini field output as text.
- `Part Pick Summary`: operator-facing sheet. Header row is configured as row 2. Column A `_Key` is hidden and stores the row identity copied from raw `Processing Key`. Existing rows/manual edits are not overwritten. This is the only normal user-editable sheet.
- `Processing Log`: status/error log rows.
- `_Processed Keys`: dedupe state for batch and page processing keys.
- `Configuration`: generated field configuration reference.
- `_Summary Email Ledger`: internal durable email send ledger keyed by Summary `_Key`, recipient, and PDF id.
- `_EOD Report Cache`: internal current-day EOD cache metadata.
- `_EOD Outstanding Orders Cache`: internal current-day row cache for Outstanding Orders `Order Type == OL` rows.
- `_EOD Pallet Product Cache`: internal current-day row cache for the full Pallet/Product by Member report.
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

## Summary Edit Actions

The installable edit trigger still points to `handleSummaryRefreshEdit(e)`. That handler classifies the edit and returns quickly. Checked `Refresh` edits schedule `processPendingSummaryRefreshes()` and leave the checkbox checked as pending. The worker later scans checked rows, groups contiguous rows, applies EOD refreshes, clears successful checkboxes, records per-row failures, and schedules at most one continuation trigger when the deadline is near. Checked or unchecked `Email` edits route to `SummaryEmailService`. Setup migrates the old `Refresh EOD` and `Send Email` headers to the current shorter labels.

`Email` only operates on the existing `Part Pick Summary` row. It reads the summary `PDF` Drive link, supports rich text links, `HYPERLINK` formulas, and raw Drive URLs, fetches the Drive PDF blob, and sends via `MailApp.sendEmail()` to `CONFIG.summaryEmail.recipient`.

Duplicate prevention is ledger-backed and durable. The send key is based on the hidden Summary `_Key`, configured recipient, and PDF file id. A ledger status of `SENT`, `SENDING`, `SEND_FAILED_BLOCKED`, `UNKNOWN`, or another nonblank blocking value prevents another send. The checkbox is left checked after success, but it is not the source of truth.

Subject format is `HX Part Pick: <Member or (blank member)> - <Order No. or (blank order)>`. The email body includes the spreadsheet link, PDF Drive link, and displayed row details for Carrier, State, Customer Name, Member, Owner, Order No., Location, C Number, B Number, Product Code, Product Description, Vintage, and Bottle Size. Validation/status notes are not included in the outgoing email body. Validation failures write `VALIDATION_FAILED` to the ledger and reset `Email`. Send exceptions after reservation write `SEND_FAILED_BLOCKED` to the ledger and reset `Email`; manual admin review/reset is required before retrying uncertain or blocked sends.

## Product Columns

`Product Code`, `Product Description`, `Vintage`, and `Bottle Size` sit after `B Number` in Summary. Pallet/Product enrichment fills them only when the B+Owner evidence has one unique product tuple. Ambiguous or missing product evidence preserves existing values. The same unique tuple is also written as a note on `B Number` for operator visibility and for the temporary historical backfill shortcut.

`OneOffProductBackfill.js` exists only to backfill historical Summary rows. The fast path parses existing B Number product notes into the product columns. The slow path reruns one-row EOD refreshes in batches, storing temporary state in script properties and scheduling a temporary continuation trigger when needed.

## EOD Report Cache

EOD report lookups first check an in-memory runtime cache. The runtime cache can hold any report/date requested during one execution.

The persistent EOD cache is current-day only, using the script timezone date key. Historical/random date requests may still use runtime cache during the current execution and may fall back to Gmail, but should not read or write arbitrary dates into the persistent sheet cache.

The cache is row-based because reports can contain tens of thousands of rows. `_EOD Report Cache` stores metadata only: report key, date key, source message/file metadata, header JSON, row count, status, and error. Actual rows live in report-specific internal sheets and are read/written with batched `getValues()`/`setValues()`.

`_EOD Pallet Product Cache` stores the full Pallet/Product by Member report with no filtering. It is the B/member/location/product truth source.

`_EOD Outstanding Orders Cache` stores only Outstanding Orders rows where the `Order Type` column normalizes exactly to `OL`. Parsing filters non-OL rows as early as practical, and Part Pick EOD enrichment searches only the OL row set.

If the cache sheet is missing or a cached row is corrupt, the service logs the cache issue and falls back to the existing Gmail search/parse path. `setup()` creates and protects the cache sheet; `processPrinterEmails()` does not call `setup()`.

`warmTodayEodReportCache()` preloads today's `outstandingOrders` and `palletAndProductByMembers` reports only. EOD report emails arrive around 2am, so a single 5am warmup is sufficient for now. The optional `installDailyEodCacheWarmupTrigger()` helper installs a separate daily trigger and does not replace or modify the Summary edit trigger.
