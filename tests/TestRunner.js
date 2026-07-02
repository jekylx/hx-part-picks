/**
 * TestRunner.js
 *
 * Central runner for the Part Pick local test suite.
 *
 * These tests DO NOT:
 * - search Gmail
 * - read real emails
 * - call Gemini extraction
 * - send email
 * - archive to Drive
 *
 * Entry points:
 * - runLocalTests()                     all tests
 * - runLocalTestsPart1()                core + eod + sheet_setup
 * - runLocalTestsPart2()                summary + summary_email
 * - runCoreLocalTests()                 legacy 'core' suite
 * - runEodLocalTests()                  legacy 'eod' suite
 * - runSheetSetupLocalTests()           legacy 'sheet_setup' suite
 * - runSummaryLocalTests()              legacy 'summary' suite
 * - runSummaryEmailLocalTests()         legacy 'summary_email' suite
 * - runNormalisationTestsOnly()         tests/normalisation
 * - runEodTestsOnly()                   tests/eod (incl. coordinator)
 * - runSummaryTestsOnly()               tests/summary
 * - runDraftAppendTestsOnly()           draft append tests
 * - runRefreshWorkerTestsOnly()         tests/refresh
 * - runEmailTestsOnly()                 tests/email
 * - runOneOffTestsOnly()                tests/oneoff
 * - runProcessorTestsOnly()             tests/processor + tests/pdf
 *
 * Logging contract (kept for Apps Script INTERNAL error triage):
 *   START: <test name> / PASS: <test name> / FAIL: <test name>
 */

const TEST_PREFIX = 'TEST::';
const TEST_RESULTS_SHEET_NAME = 'Test Results';
let localTestSetupComplete_ = false;

function runLocalTests() {
  runLocalTestSuite_('All local tests', getLocalTestCases_());
}

function runCoreLocalTests() {
  runLocalTestSuite_('Core local tests', getLocalTestCases_('core'));
}

function runSheetSetupLocalTests() {
  runLocalTestSuite_('Sheet setup local tests', getLocalTestCases_('sheet_setup'));
}

function runEodLocalTests() {
  runLocalTestSuite_('EOD local tests', getLocalTestCases_('eod'));
}

function runSummaryEmailLocalTests() {
  runLocalTestSuite_('Summary email local tests', getLocalTestCases_('summary_email'));
}

function runSummaryLocalTests() {
  runLocalTestSuite_('Summary local tests', getLocalTestCases_('summary'));
}

function runLocalTestsPart1() {
  runLocalTestSuite_('Local tests part 1', getLocalTestCases_('part1'));
}

function runLocalTestsPart2() {
  runLocalTestSuite_('Local tests part 2', getLocalTestCases_('part2'));
}

function runNormalisationTestsOnly() {
  runLocalTestSuite_('Normalisation local tests', getNormalisationCandidatesTestCases_());
}

function runEodTestsOnly() {
  runLocalTestSuite_('EOD service local tests', [].concat(
    getEodNormalisationTestCases_(),
    getEodCacheTestCases_(),
    getOutstandingOrdersEodTestCases_(),
    getPalletProductEodTestCases_(),
    getEodCoordinatorRefreshTestCases_(),
    getEodCoordinatorDraftTestCases_()
  ));
}

function runSummaryTestsOnly() {
  runLocalTestSuite_('Summary local module tests', [].concat(
    getSummaryMappingTestCases_(),
    getSummarySlaTestCases_(),
    getSummaryDraftAppendTestCases_(),
    getSummaryAppendTestCases_(),
    getSummarySyncRepairTestCases_()
  ));
}

function runDraftAppendTestsOnly() {
  runLocalTestSuite_('Draft append local tests', getDraftAppendTestCases_());
}

function runDraftAppendOrderingTestOnly() {
  runLocalTestSuite_('Draft append ordering test', [
    getDraftAppendTestCases_()[0]
  ]);
}

function runDraftAppendBlockedNotesTestOnly() {
  runLocalTestSuite_('Draft append blocked notes test', [
    getDraftAppendTestCases_()[1]
  ]);
}

function runDraftAppendFailureTestOnly() {
  runLocalTestSuite_('Draft append failure test', [
    getDraftAppendTestCases_()[2]
  ]);
}

function runRefreshWorkerTestsOnly() {
  runLocalTestSuite_('Refresh worker local tests', [].concat(
    getSummaryRefreshEditHandlerTestCases_(),
    getPendingSummaryRefreshWorkerTestCases_()
  ));
}

function runEmailTestsOnly() {
  runLocalTestSuite_('Summary email local tests', [].concat(
    getSummaryEmailTestCases_(),
    getSummaryEmailLedgerTestCases_()
  ));
}

function runOneOffTestsOnly() {
  runLocalTestSuite_('One-off backfill local tests', getOneOffProductBackfillTestCases_());
}

function runProcessorTestsOnly() {
  runLocalTestSuite_('Processor local tests', [].concat(
    getProcessorFlowTestCases_(),
    getProcessingKeysTestCases_(),
    getPdfProcessorHealthTestCases_()
  ));
}

/**
 * Full registry, assembled from the per-module registries in tests/.
 *
 * Each entry keeps its legacy suite tag (core / eod / sheet_setup / summary /
 * summary_email) so the legacy suite runners and part1/part2 keep the exact
 * same membership as the old monolithic TestHarness registry.
 */
function getLocalTestCases_(suite) {
  const allTests = [].concat(
    getConfigTestCases_(),
    getNormalisationCandidatesTestCases_(),
    getSummaryMappingTestCases_(),
    getEodNormalisationTestCases_(),
    getEodCacheTestCases_(),
    getOutstandingOrdersEodTestCases_(),
    getPalletProductEodTestCases_(),
    getPromptRulesTestCases_(),
    getSheetSetupTestCases_(),
    getProtectionTestCases_(),
    getValidationPlacementTestCases_(),
    getLogWriterTestCases_(),
    getOneOffProductBackfillTestCases_(),
    getEodCoordinatorRefreshTestCases_(),
    getEodCoordinatorDraftTestCases_(),
    getSummaryRefreshEditHandlerTestCases_(),
    getPendingSummaryRefreshWorkerTestCases_(),
    getSummaryEmailTestCases_(),
    getSummaryEmailLedgerTestCases_(),
    getSummarySlaTestCases_(),
    getSummaryDraftAppendTestCases_(),
    getSummaryAppendTestCases_(),
    getSummarySyncRepairTestCases_(),
    getProcessorFlowTestCases_(),
    getProcessingKeysTestCases_(),
    getPdfProcessorHealthTestCases_()
  );

  if (!suite) {
    return allTests;
  }

  if (suite === 'part1') {
    return allTests.filter(testCase =>
      ['core', 'eod', 'sheet_setup'].indexOf(testCase.suite) > -1
    );
  }

  if (suite === 'part2') {
    return allTests.filter(testCase =>
      ['summary', 'summary_email'].indexOf(testCase.suite) > -1
    );
  }

  return allTests.filter(testCase => testCase.suite === suite);
}

function getDraftAppendTestCases_() {
  return getSummaryDraftAppendTestCases_().slice(0, 3);
}

function runLocalTestSuite_(suiteName, testCases) {
  const results = [];

  localTestSetupComplete_ = false;
  cleanupTestRows();

  testCases.forEach(testCase => runTest_(testCase.name, testCase.fn, results));

  writeTestResults_(results);

  const failed = results.filter(result => result.status === 'FAIL');

  if (failed.length > 0) {
    throw new Error(`${failed.length} test(s) failed. Check "${TEST_RESULTS_SHEET_NAME}" sheet.`);
  }

  Logger.log(`${suiteName}: all ${results.length} local tests passed.`);
}

function ensureLocalTestSetup_() {
  if (localTestSetupComplete_) {
    return;
  }

  setup();
  localTestSetupComplete_ = true;
}

function cleanupTestRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  [
    CONFIG.sheets.extractedSheetName,
    CONFIG.summary.sheetName,
    CONFIG.sheets.processedSheetName
  ].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    deleteRowsWhereFirstColumnStartsWith_(sheet, TEST_PREFIX);
  });

  const resultsSheet = ss.getSheetByName(TEST_RESULTS_SHEET_NAME);

  if (resultsSheet) {
    resultsSheet.clearContents();
  }
}

function runTest_(name, fn, results) {
  const startedAt = new Date();

  try {
    Logger.log(`START: ${name}`);
    fn();

    results.push({
      name,
      status: 'PASS',
      message: '',
      durationMs: new Date().getTime() - startedAt.getTime()
    });

    Logger.log(`PASS: ${name}`);
  } catch (err) {
    results.push({
      name,
      status: 'FAIL',
      message: err && err.stack ? err.stack : String(err),
      durationMs: new Date().getTime() - startedAt.getTime()
    });

    Logger.log(`FAIL: ${name}`);
    Logger.log(err && err.stack ? err.stack : String(err));
  }
}

function writeTestResults_(results) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(TEST_RESULTS_SHEET_NAME) ||
    ss.insertSheet(TEST_RESULTS_SHEET_NAME);

  sheet.clearContents();

  const headers = [
    'Timestamp',
    'Test',
    'Status',
    'Duration Ms',
    'Message'
  ];

  const rows = results.map(result => [
    new Date(),
    result.name,
    result.status,
    result.durationMs,
    result.message
  ]);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function testSetupOnly() {
  setup();
}

function testGmailQueryLog() {
  Logger.log(GmailService.buildSearchQuery());
}

function testPrompt() {
  Logger.log(PromptService.buildExtractionPrompt());
}

function testPdfProcessorHealthOnly() {
  testPdfProcessorHealth_();
}

function testAppendMockRow() {
  cleanupTestRows();
  ensureLocalTestSetup_();

  const ctx = buildMockAppendContext_(TEST_PREFIX + 'MANUAL_APPEND');
  SheetService.appendPartPickRow(ctx);

  Logger.log('Mock raw row appended.');
}
