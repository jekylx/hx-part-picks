# Testing

## Apps Script Tests

Run `runLocalTests()` inside Apps Script after an approved `clasp push`.
The harness reuses one real sheet setup per suite execution; most tests use
mocks/stubs and do not repeat the expensive setup/protection path.

If the full suite approaches the Apps Script execution limit, run the split
entry points instead:

- `runLocalTestsPart1()` covers core, EOD, and sheet setup/protection tests.
- `runLocalTestsPart2()` covers summary, processor guard, and summary email tests.
- More focused suites are available as `runCoreLocalTests()`,
  `runEodLocalTests()`, `runSheetSetupLocalTests()`, `runSummaryLocalTests()`,
  and `runSummaryEmailLocalTests()`.

The test harness:

- Validates config blocks and field config.
- Validates Gmail query behavior, including Inbox-only search and no processed/failed exclusions.
- Validates raw extraction prompt rules.
- Validates raw row append behavior.
- Validates append-only summary behavior.
- Validates `_Key`-based Summary row placement so test harness rows and production sync do not use `getLastRow()+1`.
- Validates the `Refresh EOD` checkbox config, edit filtering, trigger duplicate helper, and one-row coordinator refresh routing.
- Validates the `Send Email` checkbox config, edit filtering, ledger-backed duplicate-send guards, validation failures, subject/body composition, PDF attachment handling, and blocked send failures with stubbed mail/Drive services.
- Validates B-number OCR normalization for leading `B` misread as `8` or `5`.
- Validates the EOD report runtime cache, current-day sheet-backed cache behavior, today-only warmup, and the separate daily warmup trigger installer with stubs.
- Validates batch/page processing key stability.
- Validates EOD normalization helpers.
- Validates Outstanding Orders Order+B matching and blocked cases.
- Validates Pallet/Product C/B/location/member/product rules.
- Checks the PDF processor health endpoint.

The tests do not read real printer emails or call Gemini extraction.
The summary email tests do not send real emails and do not read real Drive files; they stub the mail sender, Drive file lookup, and internal email ledger.
`cleanupTestRows()` removes `TEST::` rows from `Part Picks`, `Part Pick Summary`, and `_Processed Keys` even when a test row was accidentally created far down the sheet.

## Adding Tests

Add focused tests to `TestHarness.js`:

1. Create a `testSomething_()` function.
2. Register it in `getLocalTestCases_()` with a test name, function, and suite.
3. Prefer mock contexts and lookup builders over live Gmail/Drive/Gemini calls.
4. Use existing assertion helpers.
5. Keep production data out of tests.

## Local Syntax Checks

For changed JavaScript files:

```powershell
node --check .\ChangedFile.js
```

For a full repo syntax sweep in PowerShell:

```powershell
Get-ChildItem -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Whitespace Check

Run:

```powershell
git diff --check
```

If Git reports dubious ownership in the sandbox, use:

```powershell
git -c safe.directory=C:/path/to/hx-part-picks diff --check
```

## Apps Script Limitations

- Apps Script globals are not module imports; files share one runtime namespace.
- `node --check` validates syntax only, not Apps Script service availability.
- Local checks cannot exercise GmailApp, DriveApp, SpreadsheetApp, UrlFetchApp, LockService, PropertiesService, or Logger behavior.
- `runLocalTests()` must run in the bound Apps Script project.
- Production functions can touch Gmail, Sheets, Drive, and external services; do not run them without explicit approval.

## Test Helpers

`testAppendMockRow()` appends only a raw `Part Picks` row. To sync that raw row into `Part Pick Summary`, run `repairAppendMissingSummaryRows()`.

Summary test helpers must use the same `_Key`-based append placement as production code. Do not use `getLastRow()+1` for Summary rows, because checkbox/data-validation/formatted rows can inflate the physical last row.

## Manual Smoke Test After Deployment

- Confirm script properties exist.
- Run `runLocalTests()`.
- Use one controlled printer PDF.
- Confirm the PDF appears in `Part Pick Automation/Processed PDFs`.
- Confirm `Part Picks` has a raw row and raw values are not normalized.
- Confirm `_Processed Keys` has the page key and, after all pages, the batch key.
- Confirm `Part Pick Summary` appended one row and did not overwrite existing manual rows.
- Confirm EOD validation notes/colours are reasonable.
- Correct a summary row in a controlled test, check `Refresh EOD`, and confirm only that row's EOD validation refreshes and the checkbox resets.
- Run `warmTodayEodReportCache()` only after `runLocalTests()` passes if you want to manually verify today's EOD cache warmup; confirm it logs only report keys, date key, cache status, and row counts. Confirm `_EOD Report Cache` contains metadata only, `_EOD Outstanding Orders Cache` contains only `Order Type == OL` rows, and `_EOD Pallet Product Cache` contains the full Pallet/Product report.
- On a controlled reviewed summary row, check `Send Email` and confirm exactly one email is sent to `jesse.lang.04@gmail.com`, the PDF is attached, `_Summary Email Ledger` records `SENT`, the checkbox remains checked/locked as much as Apps Script allows, and checking again does not send a duplicate.
- Confirm Gmail thread labeling, read state, and archive behavior.
- Confirm `Processing Log` has no unexpected critical errors.
