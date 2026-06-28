# Testing

## Apps Script Tests

Run `runLocalTests()` inside Apps Script after an approved `clasp push`.

The test harness:

- Validates config blocks and field config.
- Validates Gmail query behavior, including Inbox-only search and no processed/failed exclusions.
- Validates raw extraction prompt rules.
- Validates raw row append behavior.
- Validates append-only summary behavior.
- Validates batch/page processing key stability.
- Validates EOD normalization helpers.
- Validates Outstanding Orders Order+B matching and blocked cases.
- Validates Pallet/Product C/B/location/member/product rules.
- Checks the PDF processor health endpoint.

The tests do not read real printer emails or call Gemini extraction.

## Adding Tests

Add focused tests to `TestHarness.js`:

1. Create a `testSomething_()` function.
2. Register it in `runLocalTests()` with `runTest_('Name', testSomething_, results)`.
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
git -c safe.directory=C:/Users/jesse/CodeProjects/hx-part-picks diff --check
```

## Apps Script Limitations

- Apps Script globals are not module imports; files share one runtime namespace.
- `node --check` validates syntax only, not Apps Script service availability.
- Local checks cannot exercise GmailApp, DriveApp, SpreadsheetApp, UrlFetchApp, LockService, PropertiesService, or Logger behavior.
- `runLocalTests()` must run in the bound Apps Script project.
- Production functions can touch Gmail, Sheets, Drive, and external services; do not run them without explicit approval.

## Manual Smoke Test After Deployment

- Confirm script properties exist.
- Run `runLocalTests()`.
- Use one controlled printer PDF.
- Confirm the PDF appears in `Part Pick Automation/Processed PDFs`.
- Confirm `Part Picks` has a raw row and raw values are not normalized.
- Confirm `_Processed Keys` has the page key and, after all pages, the batch key.
- Confirm `Part Pick Summary` appended one row and did not overwrite existing manual rows.
- Confirm EOD validation notes/colours are reasonable.
- Confirm Gmail thread labeling, read state, and archive behavior.
- Confirm `Processing Log` has no unexpected critical errors.
