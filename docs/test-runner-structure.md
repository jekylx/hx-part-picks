# Test Runner Structure

The old single `TestHarness.js` file has been split so test ownership follows production behavior.

## Core Files

- `TestHarness.js`: compatibility anchor only.
- `tests/TestRunner.js`: public Apps Script runner functions, suite filtering, result logging, setup reuse, and cleanup.
- `tests/TestAssertions.js`: assertion helpers.
- `tests/TestMocks.js`: fake Spreadsheet, Gmail, Drive, Mail, Lock, and Trigger services.
- `tests/TestFixtures.js`: shared data builders and helper functions.

## Domain Registries

Each domain file exposes one registry function named `get...TestCases_()`. The registry returns objects with:

```javascript
{
  name: 'descriptive test name',
  fn: testFunction_,
  suite: 'summary'
}
```

`tests/TestRunner.js` assembles those registries in `getLocalTestCases_()` and keeps legacy suite group names stable.

## Targeted Runs

Use targeted runners during development after an approved `clasp push`:

- `runNormalisationTestsOnly()`
- `runEodTestsOnly()`
- `runSummaryTestsOnly()`
- `runRefreshWorkerTestsOnly()`
- `runEmailTestsOnly()`
- `runOneOffTestsOnly()`
- `runProcessorTestsOnly()`

Use `runLocalTestsPart1()` and `runLocalTestsPart2()` if the full suite approaches Apps Script execution limits.

## Safety

The local test suite stubs external services where behavior would otherwise touch Gmail, Drive, Gemini, MailApp, or production triggers. Do not add tests that perform production Gmail searches, PDF/OCR extraction, Drive archive writes, email sends, or one-off migrations.
