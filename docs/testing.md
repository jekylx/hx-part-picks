# Testing

## Apps Script Tests

Run `runLocalTests()` inside Apps Script after an approved `clasp push`.

The test harness:

- Validates config blocks and field config.
- Validates Gmail query behavior, including Inbox-only search and no processed/failed exclusions.
- Validates raw extraction prompt rules.
- Validates raw row append behavior.
- Validates append-only summary behavior.
- Validates the `Refresh EOD` checkbox config, edit filtering, trigger duplicate helper, and one-row coordinator refresh routing.
- Validates the `Send Email` checkbox config, edit filtering, duplicate-send guards, validation failures, subject/body composition, PDF attachment handling, and blocked send failures with stubbed mail/Drive services.
- Validates batch/page processing key stability.
- Validates EOD normalization helpers.
- Validates Outstanding Orders Order+B matching and blocked cases.
- Validates Pallet/Product C/B/location/member/product rules.
- Checks the PDF processor health endpoint.

The tests do not read real printer emails or call Gemini extraction.
The summary email tests do not send real emails and do not read real Drive files; they stub the mail sender and Drive file lookup.

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
git -c safe.directory=C:/path/to/hx-part-picks diff --check
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
- Correct a summary row in a controlled test, check `Refresh EOD`, and confirm only that row's EOD validation refreshes and the checkbox resets.
- On a controlled reviewed summary row, check `Send Email` and confirm exactly one email is sent to `jesse.lang.04@gmail.com`, the PDF is attached, `Email Status` becomes `SENT`, `Email Sent At`/`Email Sent To` are filled, and checking again does not send a duplicate.
- Confirm Gmail thread labeling, read state, and archive behavior.
- Confirm `Processing Log` has no unexpected critical errors.
