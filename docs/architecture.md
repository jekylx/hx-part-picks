# Architecture

HX Part Picks is a single Apps Script project. Source is organized into service-style `.js` files loaded by Apps Script under the V8 runtime.

## Entry Points

- `setup()`: manual setup only. Creates Gmail labels, sheets, Drive folders, missing summary rows, protects implementation sheets, and hides implementation sheets.
- `processPrinterEmails()`: production processor. Searches Gmail, processes PDFs, writes rows, dedupes, archives, labels, and updates summary rows.
- `runLocalTests()`: Apps Script test harness. Does not read real printer emails or call Gemini, but it does include a PDF processor health check.

## Main Modules

- `Code.js`: orchestration, locking, Gmail thread processing, batch/page dedupe, PDF split fallback, Gemini failure fallback.
- `Config.js`: central configuration, field definitions, summary columns, EOD report settings, Gemini settings, required script properties.
- `GmailService.js`: printer Gmail query, PDF attachment filtering, label setup.
- `PdfService.js`: external PDF splitter call and one-page PDF blob construction.
- `GeminiService.js`: Gemini request/response handling.
- `PromptService.js`: extraction prompt builder.
- `SheetService.js`: raw sheet, log sheet, processed key sheet, configuration sheet setup, raw row append.
- `SummaryService.js`: append-only summary creation, summary formatting, SLA formulas.
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
  -> processed Gmail label + archive
```

## Sheets And Tabs

- `Part Picks`: raw ingestion sheet. Stores processing metadata, Drive link, extraction status, and raw Gemini field output as text.
- `Part Pick Summary`: operator-facing sheet. Header row is configured as row 2. Column A `_Key` is hidden and stores the processing key. This is the only normal user-editable sheet.
- `Processing Log`: status/error log rows.
- `_Processed Keys`: dedupe state for batch and page processing keys.
- `Configuration`: generated field configuration reference.
- `Test Results`: created by `runLocalTests()`.

All sheets except `Part Pick Summary` are internal implementation tabs. `setup()` hides them and applies the recognizable sheet-level protection `HX Part Picks protected internal sheet`.

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

EOD reports are searched separately from `donotreply@paperlesswms.com.au`, with CSV attachments and `newer_than:90d`.

## External Services

- PDF splitter endpoint: `https://part-pick-pdf-processor.onrender.com/split`.
- PDF splitter authentication: `PDF_PROCESSOR_TOKEN` script property as a bearer token.
- Gemini model: `gemini-2.5-flash`.
- Gemini authentication: `GEMINI_API_KEY` script property.

## Dedupe Keys

- Batch key: `BATCH::<md5 original PDF bytes>`.
- Page key: `BATCH::<same hash>::PAGE-<pageNumber>`.

The batch key is written only when all pages are accounted for. Page keys allow partial retry safety and compatibility with older rows that may not have a batch key.
