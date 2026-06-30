/**
 * TestHarness.gs
 *
 * Local/controlled tests for the Part Pick automation.
 *
 * These tests DO NOT:
 * - search Gmail
 * - read real emails
 * - call Gemini extraction
 *
 * These tests DO:
 * - validate config
 * - validate Gmail query string
 * - validate Gmail post-processing search policy
 * - validate prompt content
 * - validate raw row writing
 * - validate append-only summary behaviour
 * - validate PDF processor health endpoint
 * - validate page processing key stability
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

function getLocalTestCases_(suite) {
  const allTests = [
    { name: 'Config has required blocks', fn: testConfigHasRequiredBlocks_, suite: 'core' },
    { name: 'Summary config has email columns with Send Email at end', fn: testSummaryEmailConfig_, suite: 'core' },
    { name: 'Gmail query is correct', fn: testGmailQuery_, suite: 'core' },
    { name: 'B number OCR normalisation handles leading B misreads', fn: testBNumberOcrNormalisation_, suite: 'core' },
    { name: 'Order number normalisation accepts variable length', fn: testOrderNumberNormalisation_, suite: 'core' },
    { name: 'Outstanding Orders order parsing accepts variable length', fn: testOutstandingOrdersOrderParsing_, suite: 'eod' },
    { name: 'Outstanding Orders Search Criteria B parsing works', fn: testOutstandingOrdersSearchCriteriaBParsing_, suite: 'eod' },
    { name: 'EOD member normalisation helper works', fn: testEodMemberNormalisation_, suite: 'eod' },
    { name: 'EOD owner normalisation allows alphanumeric owners', fn: testEodOwnerNormalisation_, suite: 'eod' },
    { name: 'EOD carrier validation helper works', fn: testEodCarrierValidation_, suite: 'eod' },
    { name: 'EOD state validation helper works', fn: testEodStateValidation_, suite: 'eod' },
    { name: 'Summary maps raw State and Carrier safely', fn: testSummaryMapsRawStateAndCarrier_, suite: 'core' },
    { name: 'EOD customer name normalisation helper works', fn: testEodCustomerNameNormalisation_, suite: 'eod' },
    { name: 'EOD report header normalisation helper works', fn: testEodReportHeaderNormalisation_, suite: 'eod' },
    { name: 'EOD report sheet cache writes today as rows', fn: testEodReportSheetCacheWritesToday_, suite: 'eod' },
    { name: 'EOD report sheet cache skips non-today writes', fn: testEodReportSheetCacheSkipsNonTodayWrites_, suite: 'eod' },
    { name: 'EOD report runtime cache covers repeated reads', fn: testEodReportRuntimeCache_, suite: 'eod' },
    { name: 'EOD report cache does not store row JSON blobs', fn: testEodReportCacheDoesNotStoreRowJsonBlobs_, suite: 'eod' },
    { name: 'Outstanding Orders cache keeps OL rows only', fn: testOutstandingOrdersCacheKeepsOlRowsOnly_, suite: 'eod' },
    { name: 'Outstanding Orders lookup uses OL rows only', fn: testOutstandingOrdersLookupUsesOlRowsOnly_, suite: 'eod' },
    { name: 'Pallet/Product cache keeps all rows', fn: testPalletProductCacheKeepsAllRows_, suite: 'eod' },
    { name: 'EOD report warmup caches today reports only', fn: testWarmTodayEodReportCache_, suite: 'eod' },
    { name: 'EOD date helpers work', fn: testEodDateHelpers_, suite: 'eod' },
    { name: 'EOD lookup key helpers work', fn: testEodLookupKeyHelpers_, suite: 'eod' },
    { name: 'EOD result counters include blocked', fn: testEodResultCountersIncludeBlocked_, suite: 'eod' },
    { name: 'EOD result formatting includes blocked', fn: testEodResultFormattingIncludesBlocked_, suite: 'eod' },
    { name: 'Outstanding Orders customer correction requires exact Order+B match', fn: testOutstandingOrdersCustomerOwnerGate_, suite: 'eod' },
    { name: 'Outstanding Orders blocks customer correction without usable Order+B owner', fn: testOutstandingOrdersCustomerOwnerGateBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders guards carrier and state corrections', fn: testOutstandingOrdersCarrierStateGuards_, suite: 'eod' },
    { name: 'Outstanding Orders groups by Order and Search Criteria B Number', fn: testOutstandingOrdersGroupsByOrderAndBNumber_, suite: 'eod' },
    { name: 'Outstanding Orders summary row matches correct Order+B line', fn: testOutstandingOrdersSummaryMatchesCorrectOrderBLine_, suite: 'eod' },
    { name: 'Outstanding Orders repeated same-B rows sum quantity', fn: testOutstandingOrdersRepeatedSameBQty_, suite: 'eod' },
    { name: 'Outstanding Orders canonical identity avoids false ambiguity', fn: testOutstandingOrdersCanonicalIdentityNotAmbiguous_, suite: 'eod' },
    { name: 'Outstanding Orders ambiguous same-B group blocks corrections', fn: testOutstandingOrdersAmbiguousGroupBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders canonical identity detects true ambiguity', fn: testOutstandingOrdersCanonicalIdentityAmbiguous_, suite: 'eod' },
    { name: 'Outstanding Orders missing B match blocks corrections', fn: testOutstandingOrdersMissingBMatchBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders does not fill from another same-order line', fn: testOutstandingOrdersDoesNotFillFromSameOrderOtherB_, suite: 'eod' },
    { name: 'Pallet/Product exact C+B match sets Location', fn: testPalletProductExactMatchSetsLocation_, suite: 'eod' },
    { name: 'Pallet/Product exact C+B match fills Member', fn: testPalletProductExactMatchFillsMember_, suite: 'eod' },
    { name: 'Pallet/Product B owner match corrects C and Location', fn: testPalletProductBMatchOwnerGateCorrects_, suite: 'eod' },
    { name: 'Pallet/Product B owner mismatch blocks C and Location correction', fn: testPalletProductBMatchOwnerMismatchBlocks_, suite: 'eod' },
    { name: 'Pallet/Product missing owner blocks B correction', fn: testPalletProductBMatchMissingOwnerBlocks_, suite: 'eod' },
    { name: 'Pallet/Product global B owner ambiguity does not block confirmed owner', fn: testPalletProductBMatchAmbiguousOwnerBlocks_, suite: 'eod' },
    { name: 'Pallet/Product uses Outstanding Orders owner to narrow global B ambiguity', fn: testPalletProductOutstandingOrdersOwnerNarrowsGlobalAmbiguity_, suite: 'eod' },
    { name: 'Pallet/Product blocks when confirmed B+Owner row is missing', fn: testPalletProductConfirmedOwnerMissingRowBlocks_, suite: 'eod' },
    { name: 'Pallet/Product blocks conflicting B+Owner C/location rows', fn: testPalletProductConfirmedOwnerConflictsBlock_, suite: 'eod' },
    { name: 'Pallet/Product C cannot correct trusted B Number', fn: testPalletProductCMatchDoesNotCorrectB_, suite: 'eod' },
    { name: 'Pallet/Product C-only evidence does not set Location', fn: testPalletProductCOnlyEvidenceDoesNotSetLocation_, suite: 'eod' },
    { name: 'Pallet/Product mismatch does not overwrite Location', fn: testPalletProductMismatchDoesNotOverwriteLocation_, suite: 'eod' },
    { name: 'Pallet/Product note requires unique product tuple', fn: testPalletProductNoteRequiresUniqueProduct_, suite: 'eod' },
    { name: 'Pallet/Product Member requires unique B and Owner match', fn: testPalletProductMemberRequiresUniqueBAndOwner_, suite: 'eod' },
    { name: 'Prompt contains raw extraction rules', fn: testPromptRules_, suite: 'core' },
    { name: 'Sheet setup creates expected sheets', fn: testSheetSetup_, suite: 'sheet_setup' },
    { name: 'Sheet setup protects implementation sheets', fn: testSheetSetupProtectsImplementationSheets_, suite: 'sheet_setup' },
    { name: 'Sheet setup formats Processed At as timestamp', fn: testSheetSetupFormatsProcessedAtTimestamp_, suite: 'sheet_setup' },
    { name: 'Sheet setup formats Email Received At as timestamp', fn: testSheetSetupFormatsEmailReceivedAtTimestamp_, suite: 'sheet_setup' },
    { name: 'Sheet setup keeps raw form dates date-only', fn: testSheetSetupKeepsFormDatesDateOnly_, suite: 'sheet_setup' },
    { name: 'Sheet protection helper is idempotent', fn: testSheetProtectionHelperIdempotent_, suite: 'sheet_setup' },
    { name: 'New internal sheets are hidden and protected', fn: testNewInternalSheetsAreHiddenAndProtected_, suite: 'sheet_setup' },
    { name: 'New internal sheet protections retain effective user', fn: testInternalSheetProtectionRetainsOnlyEffectiveUser_, suite: 'sheet_setup' },
    { name: 'Summary sheet removes only HX internal protection', fn: testSummaryProtectionCleanup_, suite: 'sheet_setup' },
    { name: 'Summary setup applies Refresh EOD checkbox validation', fn: testSummaryCheckboxValidation_, suite: 'sheet_setup' },
    { name: 'Summary setup applies Send Email checkbox validation', fn: testSummarySendEmailCheckboxValidation_, suite: 'sheet_setup' },
    { name: 'Summary refresh edit handler filters edits strictly', fn: testSummaryRefreshEditFilter_, suite: 'summary' },
    { name: 'Summary refresh edit handler refreshes checked rows', fn: testSummaryRefreshEditHandlerCallsRefresh_, suite: 'summary' },
    { name: 'Summary refresh edit handler resets checkbox after failure', fn: testSummaryRefreshEditHandlerResetsAfterFailure_, suite: 'summary' },
    { name: 'Summary refresh trigger duplicate check works', fn: testSummaryRefreshTriggerDuplicateCheck_, suite: 'summary' },
    { name: 'Daily EOD cache warmup trigger duplicate check works', fn: testDailyEodCacheWarmupTriggerDuplicateCheck_, suite: 'summary' },
    { name: 'Summary send email edit handler filters edits strictly', fn: testSummarySendEmailEditFilter_, suite: 'summary_email' },
    { name: 'Summary send email handler sends valid row once', fn: testSummarySendEmailSendsValidRowOnce_, suite: 'summary_email' },
    { name: 'Summary send email ledger prevents duplicate', fn: testSummarySendEmailSentLedgerPreventsDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email manual uncheck after sent is restored', fn: testSummarySendEmailManualUncheckAfterSentRestored_, suite: 'summary_email' },
    { name: 'Summary send email edit handler restores sent uncheck without duplicate', fn: testSummarySendEmailEditHandlerRestoresSentUncheckWithoutDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email blocking status prevents duplicate', fn: testSummarySendEmailBlockingStatusPreventsDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email validation failure resets checkbox', fn: testSummarySendEmailValidationFailureResets_, suite: 'summary_email' },
    { name: 'Summary send email missing PDF blocks send', fn: testSummarySendEmailMissingPdfBlocks_, suite: 'summary_email' },
    { name: 'Summary send email subject uses placeholders', fn: testSummarySendEmailSubjectPlaceholders_, suite: 'summary_email' },
    { name: 'Summary send email body includes links', fn: testSummarySendEmailBodyIncludesLinks_, suite: 'summary_email' },
    { name: 'Summary send email attaches PDF blob', fn: testSummarySendEmailAttachesPdfBlob_, suite: 'summary_email' },
    { name: 'Summary send email exception records blocked state', fn: testSummarySendEmailExceptionBlocksRetry_, suite: 'summary_email' },
    { name: 'Coordinator refresh processes exactly one summary row', fn: testCoordinatorRefreshProcessesOneRow_, suite: 'summary' },
    { name: 'Coordinator refresh does not append summary rows', fn: testCoordinatorRefreshDoesNotAppend_, suite: 'summary' },
    { name: 'Coordinator refresh uses current summary row values', fn: testCoordinatorRefreshUsesCurrentRowValues_, suite: 'summary' },
    { name: 'Raw row append keeps raw values', fn: testAppendMockRawRow_, suite: 'summary' },
    { name: 'Repair helper appends existing raw rows', fn: testRepairAppendMissingSummaryRows_, suite: 'summary' },
    { name: 'Repair helper ignores inflated summary last row', fn: testRepairAppendIgnoresInflatedSummaryLastRow_, suite: 'summary' },
    { name: 'Processor appends summary rows after thread failure', fn: testProcessorAppendsSummaryAfterThreadFailure_, suite: 'summary' },
    { name: 'Summary append ignores inflated last row', fn: testSummaryAppendIgnoresInflatedLastRow_, suite: 'summary' },
    { name: 'Summary appends missing rows only', fn: testSummaryAppendOnly_, suite: 'summary' },
    { name: 'Summary append preserves timestamp values and display format', fn: testSummaryAppendPreservesTimestampValueAndFormat_, suite: 'summary' },
    { name: 'Batch and page processing keys are stable and unique', fn: testPageProcessingKey_, suite: 'core' },
    { name: 'Legacy page key does not skip whole batch', fn: testLegacyPageKeyDoesNotSkipBatch_, suite: 'core' },
    { name: 'PDF processor health endpoint works', fn: testPdfProcessorHealth_, suite: 'core' }
  ];

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

/**
 * Individual tests
 */

function testConfigHasRequiredBlocks_() {
  assertTruthy_(CONFIG, 'CONFIG missing.');
  assertTruthy_(CONFIG.gmail, 'CONFIG.gmail missing.');
  assertTruthy_(CONFIG.drive, 'CONFIG.drive missing.');
  assertTruthy_(CONFIG.sheets, 'CONFIG.sheets missing.');
  assertTruthy_(CONFIG.summary, 'CONFIG.summary missing.');
  assertTruthy_(CONFIG.gemini, 'CONFIG.gemini missing.');
  assertTruthy_(CONFIG.pdf, 'CONFIG.pdf missing.');
  assertTruthy_(Array.isArray(CONFIG.fields), 'CONFIG.fields must be an array.');
  assertTruthy_(CONFIG.fields.length > 0, 'CONFIG.fields cannot be empty.');

  assertEquals_('Message from "RNP5838795908AB"', CONFIG.gmail.subjectContains, 'Incorrect subject matcher.');

  assertTruthy_(CONFIG.pdf.processorEndpoint, 'CONFIG.pdf.processorEndpoint missing.');
  assertTruthy_(CONFIG.pdf.processorEndpoint.indexOf('/split') > -1, 'PDF processor endpoint should point to /split.');

  const requiredFieldKeys = [
    'order_number',
    'customer_name',
    'original_location',
    'b_code',
    'carton_number',
    'bottles_missing'
  ];

  requiredFieldKeys.forEach(key => {
    const field = CONFIG.fields.find(f => f.key === key);
    assertTruthy_(field, `Missing field config: ${key}`);
  });
}

function testSummaryEmailConfig_() {
  const columns = CONFIG.summary.columns;
  const headers = columns.map(column => column.header);
  const refreshColumn = columns.find(column => column.header === 'Refresh EOD');
  const sendColumn = columns[columns.length - 1];
  const cNumberIndex = headers.indexOf('C Number');
  const bNumberIndex = headers.indexOf('B Number');

  ['Email Sent At', 'Email Sent To', 'Email Status', 'Email Error'].forEach(header => {
    assertEquals_(-1, headers.indexOf(header), `${header} must not be visible in Summary.`);
  });
  assertTruthy_(cNumberIndex >= 0, 'C Number must remain in Summary.');
  assertTruthy_(bNumberIndex >= 0, 'B Number must remain in Summary.');
  assertEquals_(cNumberIndex - 1, headers.indexOf('Location'), 'Location must remain immediately to the left of C Number.');
  assertEquals_(cNumberIndex + 1, bNumberIndex, 'C Number must remain immediately to the left of B Number.');
  [
    'Location',
    'C Number',
    'B Number',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA',
    'Refresh EOD',
    'Send Email'
  ].forEach((header, offset) => {
    assertEquals_(
      header,
      headers[cNumberIndex - 1 + offset],
      `${header} must be in the expected Summary position around B Number.`
    );
  });
  assertTruthy_(headers.indexOf('Date Completed') > -1, 'Date Completed must remain in Summary.');
  assertTruthy_(headers.indexOf('SLA') > -1, 'SLA must remain in Summary.');
  assertEquals_(true, refreshColumn.manual, 'Refresh EOD must be manual.');
  assertEquals_('checkbox', refreshColumn.type, 'Refresh EOD must be a checkbox column.');
  assertEquals_('Send Email', sendColumn.header, 'Send Email must be the final summary column.');
  assertEquals_(true, sendColumn.manual, 'Send Email must be manual.');
  assertEquals_('checkbox', sendColumn.type, 'Send Email must be a checkbox column.');
  assertEquals_(
    'jesse.lang.04@gmail.com',
    CONFIG.summaryEmail.recipient,
    'Summary email recipient is not configured as expected.'
  );
  assertTruthy_(CONFIG.sheets.summaryEmailLedgerSheetName, 'Summary email ledger sheet must be configured.');
}

function testGmailQuery_() {
  const query = GmailService.buildSearchQuery();

  assertContains_(query, 'subject:"Message from \\"RNP5838795908AB\\""', 'Gmail query missing subject.');
  assertContains_(query, 'has:attachment', 'Gmail query missing attachment filter.');
  assertContains_(query, 'filename:pdf', 'Gmail query missing PDF filter.');
  assertContains_(query, 'label:"Inbox"', 'Gmail query missing inbox label filter.');
  assertContains_(query, 'newer_than:7d', 'Gmail query missing search window.');
  assertNotContains_(query, '-label:"PartPick/Processed"', 'Gmail query must not exclude processed threads.');
  assertNotContains_(query, '-label:"PartPick/Failed"', 'Gmail query must not exclude failed threads.');
}

function testOrderNumberNormalisation_() {
  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('1234567'),
    'Normal seven digit order number should stay unchanged.'
  );

  assertEquals_(
    '12',
    NormalisationService.normalizeOrderNumber_('12'),
    'Short order numbers should be accepted.'
  );

  assertEquals_(
    '1234567890',
    NormalisationService.normalizeOrderNumber_('1234567890'),
    'Long order numbers should be accepted.'
  );

  assertEquals_(
    '1400385',
    NormalisationService.normalizeOrderNumber_('140O385'),
    'Order number should normalize OCR O to zero.'
  );

  assertEquals_(
    '1400385',
    NormalisationService.normalizeOrderNumber_('14QQ385'),
    'Order number should normalize OCR Q to zero.'
  );

  assertEquals_(
    '1112345',
    NormalisationService.normalizeOrderNumber_('1IL2345'),
    'Order number should normalize OCR I/L to one.'
  );

  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('123-45/67'),
    'Order number should remove separators.'
  );

  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('Ref 1234567'),
    'Order number should keep only digits from OCR-safe mixed text.'
  );

  assertEquals_(
    null,
    NormalisationService.normalizeOrderNumber_(''),
    'Blank order number should be invalid.'
  );

  assertEquals_(
    null,
    NormalisationService.normalizeOrderNumber_('ABC'),
    'Order number with no digits should be invalid.'
  );

  assertEquals_(
    '0012345',
    NormalisationService.normalizeOrderNumber_('0012345'),
    'Order number should preserve leading zeros.'
  );
}

function testBNumberOcrNormalisation_() {
  [
    ['80867173', 'B0867173'],
    ['50867173', 'B0867173'],
    ['B0867173', 'B0867173'],
    ['0867173', 'B0867173']
  ].forEach(pair => {
    assertEquals_(
      pair[1],
      NormalisationService.normalizeSummaryValue('b_code', pair[0]),
      `B Number should normalize ${pair[0]}.`
    );
  });

  assertEquals_(
    '12345678',
    NormalisationService.normalizeSummaryValue('b_code', '12345678'),
    'Unrelated eight digit values must not be blindly accepted as B Numbers.'
  );
}

function testOutstandingOrdersOrderParsing_() {
  let parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE1234567');

  assertEquals_('ABCDE', parsed.owner, 'Owner should be first five alphanumeric characters.');
  assertEquals_('1234567', parsed.orderNumber, 'Order number should be everything after owner.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABC121234567');

  assertEquals_('ABC12', parsed.owner, 'Owner with digits should remain valid.');
  assertEquals_('1234567', parsed.orderNumber, 'Seven digit order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE123');

  assertEquals_('ABCDE', parsed.owner, 'Letter owner should parse.');
  assertEquals_('123', parsed.orderNumber, 'Short order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE1234567890');

  assertEquals_('ABCDE', parsed.owner, 'Long order owner should parse.');
  assertEquals_('1234567890', parsed.orderNumber, 'Long order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('abcde123');

  assertEquals_('ABCDE', parsed.owner, 'Lowercase owner should be uppercased.');
  assertEquals_('123', parsed.orderNumber, 'Lowercase input order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('AB-C D/E 123');

  assertEquals_('ABCDE', parsed.owner, 'Separators should be removed before owner parsing.');
  assertEquals_('123', parsed.orderNumber, 'Separators should be removed before order parsing.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('AB12');

  assertEquals_('', parsed.owner, 'Short owner should be invalid.');
  assertEquals_('', parsed.orderNumber, 'Short value should have no order after owner.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE');

  assertEquals_('ABCDE', parsed.owner, 'Five character owner should remain valid.');
  assertEquals_('', parsed.orderNumber, 'Empty order after owner should be blank.');
}

function testOutstandingOrdersSearchCriteriaBParsing_() {
  let parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990&OB1234567');

  assertEquals_('ok', parsed.status, 'Valid Search Criteria should parse.');
  assertEquals_('B1234567', parsed.bNumber, 'Original pallet segment should normalize to B Number.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V2000&OB0234567');

  assertEquals_('ok', parsed.status, 'Leading bottle-size BB must not be treated as B Number.');
  assertEquals_('B0234567', parsed.bNumber, 'O segment should preserve leading zeroes after B.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990');

  assertEquals_('missing', parsed.status, 'Search Criteria without O segment should be missing.');
  assertEquals_('', parsed.bNumber, 'Missing O segment should not return a B Number.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990&OB1234567&OB1234568');

  assertEquals_('ambiguous', parsed.status, 'Multiple O segments should be ambiguous.');
  assertEquals_('', parsed.bNumber, 'Ambiguous O segments should not return a B Number.');

  ['BB&V1990&OABC', 'BB&V1990&O123456', 'BB&V1990&O'].forEach(searchCriteria => {
    parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber(searchCriteria);

    assertTruthy_(
      parsed.status === 'invalid' || parsed.status === 'missing',
      `Invalid O segment should be invalid/missing: ${searchCriteria}`
    );
    assertEquals_('', parsed.bNumber, `Invalid O segment should not return a B Number: ${searchCriteria}`);
  });
}

// Future normalisation fix phase:
// - Invalid B/C values currently fall back to original input through summary wrappers.
// - Order OCR cleanup applies to the whole string, so surrounding O/Q/I/L text can add digits.
// - Q label, numeric/count, and location fields do not currently have normalisers.
// - Null dates currently parse via JavaScript Date semantics instead of being rejected.
// Do not lock those behaviours in here until the desired policy is agreed.

function testEodMemberNormalisation_() {
  assertEquals_(
    'ABC123',
    EodReportNormalisationService.normalizeMember('abc123'),
    'Member should uppercase alphanumeric values.'
  );

  assertEquals_(
    'ABC',
    EodReportNormalisationService.normalizeMember(' A B\tC\n'),
    'Member should remove spaces, tabs, and newlines.'
  );

  assertEquals_(
    'AB-12.',
    EodReportNormalisationService.normalizeMember('ab-12.'),
    'Member should preserve punctuation.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeMember(''),
    'Blank member should stay blank.'
  );

  assertEquals_(
    '00123',
    EodReportNormalisationService.normalizeMember('00123'),
    'Numeric-looking member values should be preserved as strings.'
  );
}

function testEodOwnerNormalisation_() {
  assertEquals_(
    'ABC12',
    EodReportNormalisationService.normalizeOwner('ABC12'),
    'Owner should preserve alphanumeric owner codes.'
  );

  assertEquals_(
    'ABC12',
    EodReportNormalisationService.normalizeOwner(' A-B C.1 2Z '),
    'Owner should remove whitespace/punctuation and keep first five alphanumeric characters.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeOwner('---'),
    'Owner with no alphanumeric characters should normalize blank.'
  );
}

function testEodCarrierValidation_() {
  assertEquals_(
    'AP',
    EodReportNormalisationService.normalizeStrictCode(' ap '),
    'Strict code normalization should trim and uppercase.'
  );

  ['NXM', 'AP', 'AC'].forEach(carrier => {
    assertTruthy_(
      EodReportNormalisationService.isValidCarrier(carrier),
      `Carrier should be valid: ${carrier}`
    );
  });

  ['nxm', ' ap ', ' ac '].forEach(carrier => {
    assertTruthy_(
      EodReportNormalisationService.isValidCarrier(carrier),
      `Trimmed/lowercase carrier should be valid: ${carrier}`
    );
  });

  ['AUSPOST', 'AUSTRALIA POST', 'NEXDAY', '', 'BAD'].forEach(carrier => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidCarrier(carrier),
      `Carrier should be invalid: ${carrier}`
    );
  });
}

function testEodStateValidation_() {
  ['NSW', 'VIC', 'ACT', 'WA', 'TAS', 'NT', 'QLD', 'SA'].forEach(state => {
    assertTruthy_(
      EodReportNormalisationService.isValidState(state),
      `State should be valid: ${state}`
    );
  });

  ['nsw', ' vic ', ' qld '].forEach(state => {
    assertTruthy_(
      EodReportNormalisationService.isValidState(state),
      `Trimmed/lowercase state should be valid: ${state}`
    );
  });

  ['Victoria', 'AUS', 'NZ', '', 'BAD'].forEach(state => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidState(state),
      `State should be invalid: ${state}`
    );
  });
}

function testSummaryMapsRawStateAndCarrier_() {
  let row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::STATE_CARRIER',
      'PDF Drive Link': 'https://drive.google.com/mock',
      'Email Received At': new Date('2026-05-01T09:30:00+10:00'),
      'Carrier': 'Australia Post',
      'State': ' vic ',
      'Customer Name': 'Example Customer',
      'Order Number': '140O385',
      'Location': 'A-01',
      'C Number': '1637376',
      'B Number': '0867173'
    },
    'KEY::STATE_CARRIER'
  );
  let values = summaryRowToObject_(row);

  assertEquals_('VIC', values['State'], 'Raw State should normalize into Summary on append.');
  assertEquals_('AP', values['Carrier'], 'Raw Carrier should normalize into Summary on append.');

  row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::STATE_CARRIER_BAD',
      'Carrier': 'Unknown Freight',
      'State': 'Victoria'
    },
    'KEY::STATE_CARRIER_BAD'
  );
  values = summaryRowToObject_(row);

  assertEquals_('', values['State'], 'Invalid raw State should not be copied into Summary.');
  assertEquals_('', values['Carrier'], 'Invalid raw Carrier should not be copied into Summary.');
}

function testEodCustomerNameNormalisation_() {
  assertEquals_(
    'example customer',
    EodReportNormalisationService.normalizeName('EXAMPLE CUSTOMER'),
    'Customer name should normalize to lowercase.'
  );

  assertEquals_(
    'example customer',
    EodReportNormalisationService.normalizeName('  Example   Customer  '),
    'Customer name should trim and collapse whitespace.'
  );

  assertEquals_(
    "o'neil-smith",
    EodReportNormalisationService.normalizeName("O'Neil-Smith"),
    'Customer name should preserve apostrophes and hyphens.'
  );

  assertEquals_(
    'acme, pty. ltd.',
    EodReportNormalisationService.normalizeName('ACME, PTY. LTD.'),
    'Customer name should preserve punctuation.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeName(''),
    'Blank customer name should stay blank.'
  );

  assertEquals_(
    EodReportNormalisationService.normalizeName('Example  Customer'),
    EodReportNormalisationService.normalizeName(' example customer '),
    'Customer name comparison should ignore case and spacing.'
  );
}

function testEodReportHeaderNormalisation_() {
  assertEquals_(
    'order no.',
    EodReportNormalisationService.normalizeHeader('\uFEFFOrder No.'),
    'Report header should strip BOM.'
  );

  assertEquals_(
    'customer name',
    EodReportNormalisationService.normalizeHeader('  Customer Name  '),
    'Report header should trim and lowercase.'
  );

  assertEquals_(
    'customer state',
    EodReportNormalisationService.normalizeHeader('Customer    State'),
    'Report header should collapse repeated whitespace.'
  );

  assertEquals_(
    'carrier code',
    EodReportNormalisationService.normalizeHeader('Carrier\t\nCode'),
    'Report header should collapse tabs and newlines.'
  );
}

function testEodReportSheetCacheWritesToday_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, finderCalls, 'Today lookup should fetch once.');
    assertEquals_('RP_OUTSTANDING_ORDERS.csv', first.filename, 'Today lookup should return fetched report.');
    assertEquals_(1, cacheSheets.metadata.dataRows.length, 'Today lookup should write one metadata cache row.');
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Today lookup should write row cache rows.');

    EodReportCsvService.resetTestDoubles_();
    EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
    EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
    EodReportCsvService.setReportFinderForTest_(function() {
      finderCalls++;
      return null;
    });

    const third = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, finderCalls, 'Sheet cache hit should avoid Gmail/report finder in later execution.');
    assertEquals_('RP_OUTSTANDING_ORDERS.csv', third.filename, 'Sheet cached report should be returned.');
    assertEquals_('Order No.', third.headers[0], 'Sheet cached headers should round-trip.');
    assertEquals_('ABCDE123', third.rows[0][0], 'Sheet cached rows should round-trip.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportSheetCacheSkipsNonTodayWrites_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-04-30');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(1, finderCalls, 'Non-today lookup should still fetch report when needed.');
    assertEquals_('2026-04-30', first.dateKey, 'Non-today lookup should return fetched report.');
    assertEquals_(0, cacheSheets.metadata.dataRows.length, 'Non-today lookup must not write metadata sheet cache.');
    assertEquals_(0, cacheSheets.rows.outstandingOrders.dataRows.length, 'Non-today lookup must not write row sheet cache.');

    EodReportCsvService.resetTestDoubles_();
    EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
    EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
    EodReportCsvService.setReportFinderForTest_(function() {
      finderCalls++;
      return null;
    });

    const second = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(2, finderCalls, 'Non-today later execution should not read from sheet cache.');
    assertEquals_(null, second, 'Non-today later execution should fall through to finder result.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportRuntimeCache_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-04-30');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');
    const second = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(1, finderCalls, 'Runtime cache should avoid repeated report finder calls.');
    assertEquals_(first, second, 'Second lookup in same execution should return runtime cached object.');
    assertEquals_(0, cacheSheets.metadata.dataRows.length, 'Runtime cache must not require a sheet write for non-today.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportCacheDoesNotStoreRowJsonBlobs_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01', {
    rows: [
      ['ABCDE123', 'Customer One', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'OL'],
      ['ABCDE124', 'Customer Two', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'OL']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, cacheSheets.metadata.dataRows.length, 'Metadata cache should have one row.');
    assertEquals_(2, cacheSheets.rows.outstandingOrders.dataRows.length, 'Row cache should store report rows separately.');
    assertEquals_(2, cacheSheets.metadata.dataRows[0][9], 'Metadata should store row count, not row JSON.');
    assertNotContains_(
      cacheSheets.metadata.dataRows[0].join(' '),
      'Customer One',
      'Metadata cache must not contain report row contents.'
    );
    assertEquals_(0, cacheSheets.metadata.appendRowCalls, 'Metadata cache should not use appendRow.');
    assertEquals_(0, cacheSheets.rows.outstandingOrders.appendRowCalls, 'Row cache should not use appendRow loops.');
    assertTruthy_(cacheSheets.rows.outstandingOrders.setValuesCalls > 0, 'Row cache should use batched setValues.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testOutstandingOrdersCacheKeepsOlRowsOnly_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01', {
    rows: [
      ['ABCDE123', 'OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'OL'],
      ['ABCDE124', 'Non OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'SO'],
      ['ABCDE125', 'Blank Type Customer', 'NXM', 'VIC', 'BB&V1990&OB1234569', '1', '']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    const cached = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, cached.rows.length, 'Only OL rows should be returned from Outstanding Orders report parsing.');
    assertEquals_('OL Customer', cached.rows[0][1], 'OL row should remain.');
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Only OL rows should be persisted.');
    assertEquals_('OL Customer', cacheSheets.rows.outstandingOrders.dataRows[0][9], 'Persisted row should be the OL row.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testOutstandingOrdersLookupUsesOlRowsOnly_() {
  const report = buildMockOutstandingOrdersReport_([
    ['ABCDE1234567', 'Non OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'SO'],
    ['ABCDE1234568', 'OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'OL']
  ]);
  const filteredReport = {
    ...report,
    rows: report.rows.filter(row =>
      EodReportCsvService.isOutstandingOrdersCacheableRow_(row, report.headers)
    )
  };
  const lookup = OutstandingOrdersEodReportService.buildLookup_(filteredReport);

  assertEquals_(
    undefined,
    lookup.byOrderNumberAndBNumber['1234567::B1234567'],
    'Lookup should not include non-OL Outstanding Orders rows.'
  );
  assertTruthy_(
    lookup.byOrderNumberAndBNumber['1234568::B1234568'],
    'Lookup should include OL Outstanding Orders rows.'
  );
}

function testPalletProductCacheKeepsAllRows_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('palletAndProductByMembers', '2026-05-01', {
    rows: [
      ['A0101', 'C1234567', 'B1234567', 'ABCDE', 'M001', 'P001', 'Product One', '2020', '750ML'],
      ['A0102', 'C1234568', 'B1234568', 'FGHIJ', 'M002', 'P002', 'Product Two', '2021', '1500ML']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    const cached = EodReportCsvService.getReportForDate('palletAndProductByMembers', '2026-05-01');

    assertEquals_(2, cached.rows.length, 'Pallet/Product rows should not be filtered.');
    assertEquals_(2, cacheSheets.rows.palletAndProductByMembers.dataRows.length, 'Pallet/Product cache should persist every row.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testWarmTodayEodReportCache_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const requested = [];
  const sideEffects = buildWarmupSideEffectGuards_();

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function(reportKey, dateKey) {
    requested.push(`${reportKey}::${dateKey}`);
    return buildMockEodCsvReport_(reportKey, dateKey);
  });

  try {
    warmTodayEodReportCache();

    assertEquals_(
      'outstandingOrders::2026-05-01,palletAndProductByMembers::2026-05-01',
      requested.join(','),
      'Warmup should request exactly the two current-day EOD reports.'
    );
    assertEquals_(2, cacheSheets.metadata.dataRows.length, 'Warmup should write two current-day metadata rows.');
    assertEquals_(
      '2026-05-01,2026-05-01',
      cacheSheets.metadata.dataRows.map(row => row[2]).join(','),
      'Warmup sheet cache writes must be for today only.'
    );
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Warmup should write Outstanding Orders row cache.');
    assertEquals_(1, cacheSheets.rows.palletAndProductByMembers.dataRows.length, 'Warmup should write Pallet/Product row cache.');
    assertEquals_(0, sideEffects.count(), 'Warmup must not touch summary/raw/dedupe/email/Gemini/Drive/Gmail-printer services.');
  } finally {
    sideEffects.restore();
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodDateHelpers_() {
  const date = new Date('2026-05-01T09:30:00+10:00');

  assertEquals_(
    date,
    EodReportNormalisationService.toDate(date),
    'Valid Date object should be returned as-is.'
  );

  assertEquals_(
    null,
    EodReportNormalisationService.toDate(''),
    'Blank date should be invalid.'
  );

  assertEquals_(
    null,
    EodReportNormalisationService.toDate('not a date'),
    'Invalid date string should be rejected.'
  );

  assertTruthy_(
    EodReportNormalisationService.toDate('2026-05-01') instanceof Date,
    'Supported string date should parse to a Date.'
  );
}

function testEodLookupKeyHelpers_() {
  assertEquals_(
    'C1234567::B7654321',
    EodReportNormalisationService.pairKey('C1234567', 'B7654321'),
    'Pair key should use C::B format.'
  );

  assertEquals_(
    'B7654321::ABCDE',
    EodReportNormalisationService.bOwnerKey('B7654321', 'abcde'),
    'B owner key should use B::OWNER format with normalized owner.'
  );

  assertEquals_(
    '::B7654321',
    EodReportNormalisationService.pairKey('', 'B7654321'),
    'Pair key should document blank C part behaviour.'
  );

  assertEquals_(
    'B7654321::',
    EodReportNormalisationService.bOwnerKey('B7654321', ''),
    'B owner key should document blank owner part behaviour.'
  );

  const cNumber = EodReportNormalisationService.normalizeCNumber(' c-123 4567 ');
  const bNumber = EodReportNormalisationService.normalizeBNumber(' b-765 4321 ');

  assertEquals_(
    'C1234567::B7654321',
    EodReportNormalisationService.pairKey(cNumber, bNumber),
    'Normalized C/B inputs should produce stable pair keys.'
  );
}

function testOutstandingOrdersCustomerOwnerGate_() {
  const outcome = runOutstandingOrdersRowTest_({
    customerName: 'Old Customer',
    carrier: 'AP',
    state: 'NSW',
    match: {
      owner: 'ABCDE',
      orderNumber: '123',
      customerName: 'New Customer',
      carrierCode: 'NXM',
      customerState: 'VIC'
    }
  });

  assertEquals_(
    'ABCDE',
    outcome.context.values['Owner'],
    'Exact Order+B match should write the Outstanding Orders owner.'
  );

  assertEquals_(
    'New Customer',
    outcome.context.values['Customer Name'],
    'Customer Name should be corrected from the selected Order+B line.'
  );

  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected Customer Name',
    'Customer correction should add a correction note.'
  );
}

function testOutstandingOrdersCustomerOwnerGateBlocks_() {
  const outcome = runOutstandingOrdersRowTest_({
    customerName: 'Old Customer',
    carrier: 'AP',
    state: 'NSW',
    match: {
      owner: '',
      orderNumber: '123',
      customerName: 'New Customer',
      carrierCode: 'NXM',
      customerState: 'VIC'
    }
  });

  assertEquals_(
    'Old Customer',
    outcome.context.values['Customer Name'],
    'Customer Name should stay unchanged when selected Order+B owner is unusable.'
  );

  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'matched Outstanding Orders line has no usable Owner',
    'Missing selected Order+B owner should add a blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing selected Order+B owner should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Missing selected Order+B owner should not count as not found.');
}

function testOutstandingOrdersCarrierStateGuards_() {
  let outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: '',
      state: '',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AP',
        customerState: 'SA'
      }
    });

    assertEquals_('AP', outcome.context.values['Carrier'], 'Blank Carrier should be filled from valid report Carrier.');
    assertEquals_('SA', outcome.context.values['State'], 'Blank State should be filled from valid report State.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'BAD',
      state: 'BAD',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AC',
        customerState: 'QLD'
      }
    });

    assertEquals_('AC', outcome.context.values['Carrier'], 'Invalid Carrier should be corrected from valid report Carrier.');
    assertEquals_('QLD', outcome.context.values['State'], 'Invalid State should be corrected from valid report State.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'NXM',
      state: 'SA',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('NXM', outcome.context.values['Carrier'], 'Existing valid Carrier should be preserved.');
    assertEquals_('SA', outcome.context.values['State'], 'Existing valid State should be preserved.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'BAD',
      state: 'BAD',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AUSPOST',
        customerState: 'BADSTATE'
      }
    });

    assertEquals_('BAD', outcome.context.values['Carrier'], 'Invalid Carrier should stay unchanged when report Carrier is invalid.');
    assertEquals_('BAD', outcome.context.values['State'], 'Invalid State should stay unchanged when report State is invalid.');

    const notes = outcome.validationRows[0].notes.join('\n');

    assertContains_(notes, 'Carrier not corrected', 'Invalid report Carrier should add a validation note.');
    assertContains_(notes, 'State not corrected', 'Invalid report State should add a validation note.');
    assertEquals_(2, outcome.result.blocked, 'Invalid report Carrier/State should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Invalid report Carrier/State should not count as not found.');
}

function testOutstandingOrdersGroupsByOrderAndBNumber_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234501',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234502',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234503',
        qtyOrd: '2'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234504',
        qtyOrd: '3'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OABC',
        qtyOrd: '4'
      })
    ])
  );

  const order = lookup.byOrderNumber['1400001'];

  assertEquals_(11, order.orderTotalQtyOrd, 'Order total should include valid numeric Qty Ord even when Search Criteria B is invalid.');
  assertEquals_(1, order.bNumbers.B1234501.qtyOrdSum, 'First B group quantity should be stored.');
  assertEquals_(1, order.bNumbers.B1234502.qtyOrdSum, 'Second B group quantity should be stored.');
  assertEquals_(2, order.bNumbers.B1234503.qtyOrdSum, 'Third B group quantity should be stored.');
  assertEquals_(3, order.bNumbers.B1234504.qtyOrdSum, 'Fourth B group quantity should be stored.');
  assertEquals_(
    undefined,
    order.bNumbers.OABC,
    'Invalid Search Criteria B should not become a matchable B group.'
  );
}

function testOutstandingOrdersSummaryMatchesCorrectOrderBLine_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234502: [
        { owner: 'TESTA' }
      ]
    }
  });

  try {
    const context = buildMockOutstandingOrdersContext_({
      'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
      'Owner': '',
      'Order No.': '1400001',
      'Customer Name': 'Old Customer',
      'Carrier': '',
      'State': '',
      'B Number': 'B1234502'
    });
    const validationRows = EodReportValidationService.create(1);
    const result = OutstandingOrdersEodReportService.createResult_();
    const lookup = OutstandingOrdersEodReportService.buildLookup_(
      buildMockOutstandingOrdersReport_([
        buildOutstandingOrdersCsvRow_({
          orderNo: 'TESTA1400001',
          customerName: 'Wrong B Customer',
          carrierCode: 'AP',
          customerState: 'NSW',
          searchCriteria: 'BB&V1990&OB1234501',
          qtyOrd: '1'
        }),
        buildOutstandingOrdersCsvRow_({
          orderNo: 'TESTA1400001',
          customerName: 'Right B Customer',
          carrierCode: 'NXM',
          customerState: 'VIC',
          searchCriteria: 'BB&V1990&OB1234502',
          qtyOrd: '1'
        })
      ])
    );

    OutstandingOrdersEodReportService.applyRow_(
      context,
      validationRows,
      0,
      lookup,
      '2026-05-01',
      result
    );

    assertEquals_('TESTA', context.values['Owner'], 'Matched Order+B line should write Owner.');
    assertEquals_('Right B Customer', context.values['Customer Name'], 'Matched Order+B line should correct Customer Name.');
    assertEquals_('NXM', context.values['Carrier'], 'Matched Order+B line should fill Carrier.');
    assertEquals_('VIC', context.values['State'], 'Matched Order+B line should fill State.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersRepeatedSameBQty_() {
  const rows = [1, 1, 2, 1].map(qtyOrd => buildOutstandingOrdersCsvRow_({
    orderNo: 'TESTB1400002',
    searchCriteria: 'BB&V2000&OB0234567',
    qtyOrd: String(qtyOrd)
  }));
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_(rows)
  );
  const order = lookup.byOrderNumber['1400002'];
  const group = lookup.byOrderNumberAndBNumber['1400002::B0234567'];

  assertEquals_(5, order.orderTotalQtyOrd, 'Repeated same-B rows should sum to order total.');
  assertEquals_(5, group.qtyOrdSum, 'Repeated same-B rows should sum to B group quantity.');
  assertEquals_(false, group.ambiguous, 'Repeated identical same-B rows should not be ambiguous.');
  assertEquals_(4, group.rows.length, 'Repeated same-B rows should be preserved on the group.');
}

function testOutstandingOrdersCanonicalIdentityNotAmbiguous_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer   One',
        carrierCode: 'ap',
        customerState: ' vic ',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'CUSTOMER ONE',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      })
    ])
  );
  const group = lookup.byOrderNumberAndBNumber['123::B1234567'];

  assertEquals_(
    false,
    group.ambiguous,
    'Same Order+B rows with canonical-equivalent customer/carrier/state should not be ambiguous.'
  );
}

function testOutstandingOrdersAmbiguousGroupBlocks_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer One',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer Two',
        carrierCode: 'NXM',
        customerState: 'NSW',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '2'
      })
    ])
  );
  const builtGroup = lookup.byOrderNumberAndBNumber['123::B1234567'];

  assertEquals_(true, builtGroup.ambiguous, 'Conflicting same Order+B identity fields should mark group ambiguous.');
  assertContains_(
    builtGroup.ambiguityReasons.join(','),
    'customerName',
    'Conflicting customerName should be recorded as an ambiguity reason.'
  );
  assertContains_(
    builtGroup.ambiguityReasons.join(','),
    'carrierCode',
    'Conflicting carrierCode should be recorded as an ambiguity reason.'
  );

  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234567: [
        { owner: 'ABCDE' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        searchCriteriaBNumber: 'B1234567',
        customerName: 'New Customer',
        carrierCode: 'AP',
        customerState: 'VIC',
        ambiguous: true,
        ambiguityReasons: ['customerName']
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Ambiguous group should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Ambiguous group should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Ambiguous group should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Ambiguous group should not fill State.');
    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'ambiguous Outstanding Orders lines',
      'Ambiguous group should add a blocked note.'
    );
    assertEquals_(1, outcome.result.blocked, 'Ambiguous group should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Ambiguous group should not count as not found.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersCanonicalIdentityAmbiguous_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer One',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Different Customer',
        carrierCode: 'NXM',
        customerState: 'NSW',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      })
    ])
  );
  const group = lookup.byOrderNumberAndBNumber['123::B1234567'];
  const reasons = group.ambiguityReasons.join(',');

  assertEquals_(true, group.ambiguous, 'Genuinely different normalized identity fields should be ambiguous.');
  assertContains_(reasons, 'customerName', 'Different normalized customer should be an ambiguity reason.');
  assertContains_(reasons, 'carrierCode', 'Different normalized carrier should be an ambiguity reason.');
  assertContains_(reasons, 'customerState', 'Different normalized state should be an ambiguity reason.');
}

function testOutstandingOrdersMissingBMatchBlocks_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B7654321: [
        { owner: 'ABCDE' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      bNumber: 'B7654321',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        searchCriteriaBNumber: 'B1234567',
        customerName: 'Other B Customer',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Missing B match should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Missing B match should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Missing B match should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Missing B match should not fill State.');
    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'no Outstanding Orders line matched',
      'Missing B match should add a blocked note.'
    );
    assertEquals_(1, outcome.result.blocked, 'Missing B match should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Missing B match should not count as not found.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersDoesNotFillFromSameOrderOtherB_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234502: [
        { owner: 'TESTA' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      bNumber: 'B1234502',
      match: {
        owner: 'TESTA',
        orderNumber: '1400001',
        searchCriteriaBNumber: 'B1234501',
        customerName: 'Other Stock Line',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Same-order other B line should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Same-order other B line should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Same-order other B line should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Same-order other B line should not fill State.');
    assertEquals_(1, outcome.result.blocked, 'Same-order other B should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Same-order other B should not count as not found.');
  } finally {
    restore();
  }
}

function testEodResultCountersIncludeBlocked_() {
  let result = OutstandingOrdersEodReportService.createResult_();

  assertEquals_(0, result.blocked, 'Outstanding Orders result should include blocked counter.');

  result = PalletAndProductByMembersEodReportService.createResult_();

  assertEquals_(0, result.blocked, 'Pallet/Product result should include blocked counter.');
}

function testEodResultFormattingIncludesBlocked_() {
  const formatted = EodReportCoordinator.formatResult_('TEST REPORT', {
    checked: 1,
    filled: 2,
    corrected: 3,
    mismatched: 4,
    blocked: 5,
    notFound: 6
  });

  assertContains_(formatted, 'blocked=5', 'EOD result formatting should include blocked counter.');
}

function testPalletProductExactMatchSetsLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('A-01-02', outcome.context.values['Location'], 'Exact C+B match should set Location.');
}

function testPalletProductExactMatchFillsMember_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('M001', outcome.context.values['Member'], 'Exact C+B match should fill Member through B+Owner.');
}

function testPalletProductBMatchOwnerGateCorrects_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'B owner match should correct C Number.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'B owner match should set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected C Number',
    'B owner match should add a correction note.'
  );
}

function testPalletProductBMatchOwnerMismatchBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Owner mismatch should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Owner mismatch should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Pallet/Product row found for B B1234567 and Owner ABCDE',
    'Owner mismatch should add a missing B+Owner row note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Owner mismatch should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Owner mismatch should not count as not found.');
}

function testPalletProductBMatchMissingOwnerBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': '',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Missing owner should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Missing owner should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no confirmed Outstanding Orders owner was available',
    'Missing owner should add a blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing owner should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Missing owner should not count as not found.');
}

function testPalletProductBMatchAmbiguousOwnerBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'Confirmed B+Owner row should correct C Number despite global B ownership ambiguity.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'Confirmed B+Owner row should set Location despite global B ownership ambiguity.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected C Number',
    'Confirmed B+Owner row should add a correction note.'
  );
  assertEquals_(0, outcome.result.blocked, 'Global B ownership ambiguity alone should not count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Ambiguous B ownership should not count as not found.');
}

function testPalletProductOutstandingOrdersOwnerNarrowsGlobalAmbiguity_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'B-09-09',
        cNumber: 'C9999999',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'B+Owner row should correct C Number.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'B+Owner row should set Location.');
  assertEquals_('M001', outcome.context.values['Member'], 'B+Owner row should fill Member.');
}

function testPalletProductConfirmedOwnerMissingRowBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'B-09-09',
        cNumber: 'C9999999',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Missing B+Owner row should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Missing B+Owner row should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Pallet/Product row found for B B1234567 and Owner ABCDE',
    'Missing B+Owner row should add a specific blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing B+Owner row should count as blocked.');
}

function testPalletProductConfirmedOwnerConflictsBlock_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-03',
        cNumber: 'C7654322',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Conflicting B+Owner rows should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Conflicting B+Owner rows should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'conflicting C/location rows found for B B1234567 and Owner ABCDE',
    'Conflicting B+Owner rows should add a specific blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Conflicting B+Owner rows should count as blocked.');
}

function testPalletProductCMatchDoesNotCorrectB_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B9999999'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('B9999999', outcome.context.values['B Number'], 'C Number must not correct trusted B Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'C-only evidence must not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'B Number not corrected: C Number cannot override trusted B Number.',
    'C mismatch should explain that C cannot override B.'
  );
  assertEquals_(1, outcome.result.blocked, 'C cannot override trusted B should count as blocked.');
  assertEquals_(1, outcome.result.mismatched, 'C+B contradiction should still count as mismatched.');
  assertEquals_(0, outcome.result.notFound, 'C+B contradiction should not count as not found.');
}

function testPalletProductCOnlyEvidenceDoesNotSetLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': ''
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['B Number'], 'C-only evidence must not fill B Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'C-only evidence must not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'C-only evidence cannot set Location.',
    'C-only evidence should explain that Location is not trusted.'
  );
  assertEquals_(1, outcome.result.blocked, 'C-only evidence should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'C-only evidence should not count as not found.');
}

function testPalletProductMismatchDoesNotOverwriteLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B9999999'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1111111',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'B-03-04',
        cNumber: 'C7654321',
        bNumber: 'B2222222',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Mismatch branch should not overwrite Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'mismatch',
    'Mismatch branch should keep mismatch validation note.'
  );
}

function testPalletProductNoteRequiresUniqueProduct_() {
  let outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      })
    ]
  });

  assertContains_(
    outcome.context.notes['B Number'],
    'Product Code: P001',
    'Unique product tuple should set B Number note.'
  );
  assertEquals_('P001', outcome.context.values['Product Code'], 'Unique product tuple should set Product Code.');
  assertEquals_('Product One', outcome.context.values['Product Description'], 'Unique product tuple should set Product Description.');
  assertEquals_('2020', outcome.context.values['Vintage'], 'Unique product tuple should set Vintage.');
  assertEquals_('750ML', outcome.context.values['Bottle Size'], 'Unique product tuple should set Bottle Size.');

  outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    notes: {
      'B Number': 'OLD NOTE'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P002',
        productDescription: 'Product Two'
      })
    ]
  });

  assertEquals_('OLD NOTE', outcome.context.notes['B Number'], 'Ambiguous product tuple should not replace B Number note.');
}

function testPalletProductMemberRequiresUniqueBAndOwner_() {
  let outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('M001', outcome.context.values['Member'], 'Unique B+Owner Member should fill Member.');

  outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('', outcome.context.values['Member'], 'Ambiguous B+Owner Member should not fill Member.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Member No match',
    'Ambiguous B+Owner Member should add validation note.'
  );
}

function testPromptRules_() {
  const prompt = PromptService.buildExtractionPrompt();

  assertContains_(prompt, 'Part Pick Form', 'Prompt should describe Part Pick Form.');
  assertContains_(prompt, 'Fields to extract', 'Prompt should include fields section.');
  assertContains_(prompt, 'ORDER NUMBER', 'Prompt missing order number field.');
  assertContains_(prompt, 'ORIGINAL LOCATION', 'Prompt missing original location field.');
  assertContains_(prompt, 'B CODE', 'Prompt missing B code field.');
  assertContains_(prompt, 'CARTON NUMBER', 'Prompt missing carton number field.');
  assertContains_(prompt, 'Q LABEL', 'Prompt missing Q label field.');

  assertContains_(prompt, 'Return the handwritten value as written', 'Prompt should preserve raw handwritten values.');
  assertContains_(prompt, 'Do not infer', 'Prompt should prevent inference.');
  assertContains_(prompt, 'Return ONLY valid JSON', 'Prompt missing JSON-only rule.');

  assertTruthy_(
    prompt.indexOf('exactly ONE page') > -1 || prompt.indexOf('exactly one page') > -1,
    'Prompt should say the PDF is exactly one page now that PdfService splits batches.'
  );
}

function testSheetSetup_() {
  ensureLocalTestSetup_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  [
    CONFIG.sheets.extractedSheetName,
    CONFIG.summary.sheetName,
    CONFIG.sheets.logSheetName,
    CONFIG.sheets.processedSheetName,
    CONFIG.sheets.configSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName,
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName
  ].forEach(sheetName => {
    assertTruthy_(ss.getSheetByName(sheetName), `Missing sheet: ${sheetName}`);
  });
}

function testSheetSetupProtectsImplementationSheets_() {
  ensureLocalTestSetup_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const internalSheetNames = [
    CONFIG.sheets.extractedSheetName,
    CONFIG.sheets.logSheetName,
    CONFIG.sheets.processedSheetName,
    CONFIG.sheets.configSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName,
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName
  ];

  internalSheetNames.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);

    assertInternalSheetProtected_(sheet, sheetName);
  });

  const summarySheet = ss.getSheetByName(CONFIG.summary.sheetName);

  assertEquals_(
    0,
    SheetService.getScriptInternalProtections_(summarySheet).length,
    'Summary sheet must not keep HX internal sheet protection.'
  );
}

function testSheetSetupFormatsProcessedAtTimestamp_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.sheets.extractedSheetName);
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  assertCellNumberFormat_(
    sheet,
    2,
    headers,
    'Processed At',
    SheetService.dateTimeNumberFormat,
    'Processed At should display full date and time.'
  );
}

function testSheetSetupFormatsEmailReceivedAtTimestamp_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.sheets.extractedSheetName);
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  assertCellNumberFormat_(
    sheet,
    2,
    headers,
    'Email Received At',
    SheetService.dateTimeNumberFormat,
    'Email Received At should display full date and time.'
  );
}

function testSheetSetupKeepsFormDatesDateOnly_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.sheets.extractedSheetName);
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  assertCellNumberFormat_(
    sheet,
    2,
    headers,
    'Date',
    SheetService.dateNumberFormat,
    'Date should remain date-only.'
  );

  assertCellNumberFormat_(
    sheet,
    2,
    headers,
    'Signoff Date',
    SheetService.dateNumberFormat,
    'Signoff Date should remain date-only.'
  );
}

function testSheetProtectionHelperIdempotent_() {
  const effectiveUser = buildMockUser_('owner@example.com');
  const sheet = buildMockProtectableSheet_('Part Picks', []);

  SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);
  SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);

  const activeProtections = sheet.protections.filter(protection => !protection.removed);

  assertEquals_(1, activeProtections.length, 'Repeated protection setup should not create duplicates.');
  assertEquals_(
    SheetService.internalProtectionDescription,
    activeProtections[0].getDescription(),
    'Internal protection description should be recognizable.'
  );
  assertEquals_(false, activeProtections[0].domainEdit, 'Domain editing should be disabled.');
  assertEquals_(false, activeProtections[0].warningOnly, 'Internal protection should not be warning-only.');
  assertEquals_(
    1,
    activeProtections[0].editors.length,
    'Only the effective user should remain as explicit editor.'
  );
  assertEquals_(
    'owner@example.com',
    activeProtections[0].editors[0].getEmail(),
    'Effective user should be retained as editor.'
  );
}

function testNewInternalSheetsAreHiddenAndProtected_() {
  ensureLocalTestSetup_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const effectiveUser = Session.getEffectiveUser();
  const effectiveEmail = SheetService.getUserEmail_(effectiveUser);
  const newInternalSheetNames = [
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName
  ];

  newInternalSheetNames.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    const protection = assertInternalSheetProtected_(sheet, sheetName);

    assertEquals_(true, SheetService.shouldHideImplementationSheet_(sheetName), `${sheetName} should use the normal internal sheet hiding rule.`);

    if (typeof sheet.isSheetHidden === 'function') {
      assertEquals_(true, sheet.isSheetHidden(), `${sheetName} should be hidden by setup.`);
    }

    if (effectiveEmail) {
      const editorEmails = protection.getEditors().map(editor =>
        SheetService.getUserEmail_(editor)
      );

      assertTruthy_(
        editorEmails.indexOf(effectiveEmail) > -1,
        `${sheetName} should explicitly retain the effective user as protection editor.`
      );
    }
  });

  assertEquals_(
    false,
    SheetService.shouldHideImplementationSheet_(CONFIG.summary.sheetName),
    'Summary should remain visible/editable.'
  );

  const summarySheet = ss.getSheetByName(CONFIG.summary.sheetName);
  if (typeof summarySheet.isSheetHidden === 'function') {
    assertEquals_(false, summarySheet.isSheetHidden(), 'Summary should remain visible after setup.');
  }
}

function testInternalSheetProtectionRetainsOnlyEffectiveUser_() {
  const effectiveUser = buildMockUser_('owner@example.com');
  const newInternalSheetNames = [
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName
  ];

  newInternalSheetNames.forEach(sheetName => {
    const sheet = buildMockProtectableSheet_(sheetName, []);

    SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);

    const protection = sheet.protections[0];

    assertEquals_(true, SheetService.shouldHideImplementationSheet_(sheetName), `${sheetName} should use the normal internal sheet hiding rule.`);
    assertEquals_(false, protection.domainEdit, `${sheetName} domain editing should be disabled.`);
    assertEquals_(
      'owner@example.com',
      protection.editors[0].getEmail(),
      `${sheetName} should explicitly retain the effective user as editor.`
    );
  });

  assertEquals_(
    true,
    SheetService.shouldHideImplementationSheet_(CONFIG.sheets.extractedSheetName),
    'Older internal implementation sheets should remain hideable.'
  );
  assertEquals_(
    false,
    SheetService.shouldHideImplementationSheet_(CONFIG.summary.sheetName),
    'Summary should remain visible/editable.'
  );
}

function testSummaryProtectionCleanup_() {
  const hxProtection = buildMockProtection_(SheetService.internalProtectionDescription);
  const manualProtection = buildMockProtection_('Manual finance lock');
  const summarySheet = buildMockProtectableSheet_(
    CONFIG.summary.sheetName,
    [hxProtection, manualProtection]
  );

  SheetService.removeScriptInternalProtections_(summarySheet);

  assertEquals_(true, hxProtection.removed, 'HX internal protection should be removed from summary.');
  assertEquals_(false, manualProtection.removed, 'Manual summary protections should not be removed.');
}

function assertInternalSheetProtected_(sheet, sheetName) {
  assertTruthy_(sheet, `Missing internal sheet: ${sheetName}`);

  const protections = SheetService.getScriptInternalProtections_(sheet);

  assertEquals_(
    1,
    protections.length,
    `Expected exactly one HX internal sheet protection on ${sheetName}.`
  );
  assertEquals_(
    SheetService.internalProtectionDescription,
    protections[0].getDescription(),
    `Unexpected protection description on ${sheetName}.`
  );

  return protections[0];
}

function testSummaryCheckboxValidation_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const headers = sheet
    .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const refreshCol = getColumnIndex_(headers, 'Refresh EOD');

  assertTruthy_(refreshCol > 0, 'Refresh EOD column missing.');

  const rule = sheet
    .getRange(CONFIG.summary.headerRow + 1, refreshCol)
    .getDataValidation();

  assertTruthy_(rule, 'Refresh EOD data validation missing.');
  assertEquals_(
    SpreadsheetApp.DataValidationCriteria.CHECKBOX,
    rule.getCriteriaType(),
    'Refresh EOD should use checkbox validation.'
  );
}

function testSummarySendEmailCheckboxValidation_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const headers = sheet
    .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const sendCol = getColumnIndex_(headers, 'Send Email');

  assertTruthy_(sendCol > 0, 'Send Email column missing.');

  const rule = sheet
    .getRange(CONFIG.summary.headerRow + 1, sendCol)
    .getDataValidation();

  assertTruthy_(rule, 'Send Email data validation missing.');
  assertEquals_(
    SpreadsheetApp.DataValidationCriteria.CHECKBOX,
    rule.getCriteriaType(),
    'Send Email should use checkbox validation.'
  );
}

function testSummaryRefreshEditFilter_() {
  const refreshCol = CONFIG.summary.columns.length + 1;

  assertEquals_(
    false,
    isSummaryRefreshEdit_(null),
    'Missing edit event should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      sheetName: 'Wrong Sheet',
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Wrong sheet should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol - 1,
      value: 'TRUE'
    })),
    'Wrong column should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Header row should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'FALSE'
    })),
    'Unchecked edit should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE',
      numRows: 2
    })),
    'Multi-row edit should be ignored.'
  );

  assertEquals_(
    true,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Checked Refresh EOD data-row edit should be accepted.'
  );

  assertEquals_(
    'refresh_eod',
    getSummaryEditRoute_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Edit router should route Refresh EOD edits.'
  );
}

function testSummaryRefreshEditHandlerCallsRefresh_() {
  const event = buildMockSummaryRefreshEditEvent_({
    row: CONFIG.summary.headerRow + 3,
    col: CONFIG.summary.columns.length + 1,
    value: 'TRUE'
  });
  const lock = buildMockLock_();
  const originalRefresh = EodReportCoordinator.refreshSummaryRow;
  let called = false;

  EodReportCoordinator.refreshSummaryRow = (sheet, rowNumber) => {
    called = true;
    assertEquals_(CONFIG.summary.sheetName, sheet.getName(), 'Handler should pass summary sheet.');
    assertEquals_(CONFIG.summary.headerRow + 3, rowNumber, 'Handler should pass edited row.');
  };

  try {
    refreshSummaryRowFromEdit_(event, lock);
  } finally {
    EodReportCoordinator.refreshSummaryRow = originalRefresh;
  }

  assertEquals_(true, called, 'Checked refresh edit should call row refresh.');
  assertEquals_(false, event.range.valueSet, 'Handler should reset checkbox after success.');
  assertEquals_(true, lock.released, 'Handler should release lock after success.');
}

function testSummaryRefreshEditHandlerResetsAfterFailure_() {
  const event = buildMockSummaryRefreshEditEvent_({
    row: CONFIG.summary.headerRow + 3,
    col: CONFIG.summary.columns.length + 1,
    value: 'TRUE'
  });
  const lock = buildMockLock_();
  const originalRefresh = EodReportCoordinator.refreshSummaryRow;

  EodReportCoordinator.refreshSummaryRow = () => {
    throw new Error('forced refresh failure');
  };

  try {
    refreshSummaryRowFromEdit_(event, lock);
    throw new Error('Expected refresh failure.');
  } catch (err) {
    assertContains_(String(err), 'forced refresh failure', 'Unexpected failure from refresh helper.');
  } finally {
    EodReportCoordinator.refreshSummaryRow = originalRefresh;
  }

  assertEquals_(false, event.range.valueSet, 'Handler should reset checkbox after failure.');
  assertEquals_(true, lock.released, 'Handler should release lock after failure.');
}

function testSummaryRefreshTriggerDuplicateCheck_() {
  const handlerName = 'handleSummaryRefreshEdit';
  const triggers = [
    { getHandlerFunction: () => 'processPrinterEmails' },
    { getHandlerFunction: () => handlerName }
  ];

  assertEquals_(
    true,
    hasProjectTriggerForHandler_(triggers, handlerName),
    'Duplicate trigger helper should detect existing refresh trigger.'
  );

  assertEquals_(
    false,
    hasProjectTriggerForHandler_(triggers, 'missingHandler'),
    'Duplicate trigger helper should allow missing handler.'
  );
}

function testDailyEodCacheWarmupTriggerDuplicateCheck_() {
  const createdHandlers = [];
  const scriptApp = buildMockScriptAppForTimeTrigger_([], createdHandlers);

  installDailyEodCacheWarmupTrigger_({
    scriptApp
  });

  assertEquals_(1, createdHandlers.length, 'Warmup trigger installer should create one trigger.');
  assertEquals_(
    'warmTodayEodReportCache',
    createdHandlers[0].handlerName,
    'Warmup trigger should point to the warmup handler.'
  );
  assertEquals_(1, createdHandlers[0].everyDays, 'Warmup trigger should run daily.');
  assertEquals_(5, createdHandlers[0].atHour, 'Warmup trigger should run around 5am.');

  installDailyEodCacheWarmupTrigger_({
    scriptApp: buildMockScriptAppForTimeTrigger_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' },
      { getHandlerFunction: () => 'warmTodayEodReportCache' }
    ], createdHandlers)
  });

  assertEquals_(1, createdHandlers.length, 'Warmup trigger installer should avoid duplicate warmup triggers.');
  assertEquals_(
    true,
    hasProjectTriggerForHandler_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' }
    ], 'handleSummaryRefreshEdit'),
    'Summary refresh trigger helper should remain separate.'
  );
  assertEquals_(
    false,
    hasProjectTriggerForHandler_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' }
    ], 'warmTodayEodReportCache'),
    'Summary refresh trigger should not count as a warmup trigger.'
  );
}

function testSummarySendEmailEditFilter_() {
  const sendCol = CONFIG.summary.columns.length + 1;

  assertEquals_(
    false,
    isSummarySendEmailEdit_(null),
    'Missing edit event should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      sheetName: 'Wrong Sheet',
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Wrong sheet should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol - 1,
      value: 'TRUE'
    })),
    'Wrong column should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow,
      col: sendCol,
      value: 'TRUE'
    })),
    'Header row should be ignored.'
  );

  assertEquals_(
    true,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'FALSE'
    })),
    'Unchecked Send Email edits should be accepted so sent rows can be restored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE',
      numRows: 2
    })),
    'Multi-row edit should be ignored.'
  );

  assertEquals_(
    true,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Checked Send Email data-row edit should be accepted.'
  );

  assertEquals_(
    'send_email',
    getSummaryEditRoute_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Edit router should route Send Email edits.'
  );

  assertEquals_(
    'send_email',
    getSummaryEditRoute_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'FALSE'
    })),
    'Edit router should route unchecked Send Email edits.'
  );
}

function testSummarySendEmailSendsValidRowOnce_() {
  const result = runSummaryEmailServiceTest_({});
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('sent', result.sendResult.status, 'Valid row should send.');
  assertEquals_(1, result.sentEmails.length, 'Valid row should send exactly once.');
  assertEquals_(
    SummaryEmailService.STATUS_SENT,
    ledgerEntry.status,
    'Successful send should mark SENT in the internal ledger.'
  );
  assertTruthy_(ledgerEntry.sentAt, 'Successful send should set sent timestamp in ledger.');
  assertEquals_(
    CONFIG.summaryEmail.recipient,
    ledgerEntry.recipient,
    'Successful send should record recipient in ledger.'
  );
  assertEquals_(true, result.sheet.getValueByHeader('Send Email'), 'Successful send should leave checkbox checked.');
  assertEquals_(1, result.sheet.protections.length, 'Successful send should best-effort protect the sent checkbox.');
  assertEquals_('Send Email', result.sheet.protections[0].headerName, 'Sent checkbox protection should target Send Email.');
  assertEquals_('', ledgerEntry.error, 'Successful send should clear ledger error.');
}

function testSummarySendEmailSentLedgerPreventsDuplicate_() {
  const sendKey = buildTestSummaryEmailSendKey_();
  const result = runSummaryEmailServiceTest_({
    ledger: {
      [sendKey]: {
        sendKey,
        status: SummaryEmailService.STATUS_SENT
      }
    }
  });

  assertEquals_('already_sent', result.sendResult.status, 'SENT ledger status should skip send.');
  assertEquals_(0, result.sentEmails.length, 'SENT ledger status should not send.');
  assertEquals_(true, result.sheet.getValueByHeader('Send Email'), 'Already sent row should remain checked.');
}

function testSummarySendEmailManualUncheckAfterSentRestored_() {
  const sendKey = buildTestSummaryEmailSendKey_();
  const result = runSummaryEmailServiceTest_({
    values: {
      'Send Email': false
    },
    ledger: {
      [sendKey]: {
        sendKey,
        status: SummaryEmailService.STATUS_SENT,
        sentAt: new Date('2026-06-01T10:00:00+10:00')
      }
    }
  });

  assertEquals_('already_sent', result.sendResult.status, 'Sent ledger status should skip send.');
  assertEquals_(0, result.sentEmails.length, 'Manual uncheck after sent should not resend.');
  assertEquals_(true, result.sheet.getValueByHeader('Send Email'), 'Manual uncheck after sent should be restored.');
}

function testSummarySendEmailEditHandlerRestoresSentUncheckWithoutDuplicate_() {
  const sendKey = buildTestSummaryEmailSendKey_();
  const sentEmails = [];
  const ledger = {
    [sendKey]: {
      sendKey,
      summaryKey: TEST_PREFIX + 'SUMMARY_EMAIL',
      recipient: CONFIG.summaryEmail.recipient,
      status: SummaryEmailService.STATUS_SENT,
      sentAt: new Date('2026-06-01T10:00:00+10:00')
    }
  };
  const sheet = buildMockSummaryEmailSheet_({
    values: {
      'Send Email': false
    }
  });
  const lock = buildMockLock_();
  const range = sheet.getRange(
    CONFIG.summary.headerRow + 1,
    getColumnIndex_(['_Key', ...CONFIG.summary.columns.map(column => column.header)], 'Send Email')
  );

  SummaryEmailService.setMailSenderForTest_(email => {
    sentEmails.push(email);
  });
  SummaryEmailService.setDriveFileGetterForTest_(fileId => buildMockPdfDriveFile_(fileId));
  SummaryEmailService.setSpreadsheetUrlForTest_(
    'https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit'
  );
  SummaryEmailService.setLedgerForTest_(ledger);

  try {
    SummaryEmailService.sendSummaryRowFromEdit({
      range,
      value: 'FALSE'
    }, lock);
  } finally {
    SummaryEmailService.resetTestDoubles_();
  }

  assertEquals_(true, lock.released, 'Send Email edit handler should release the lock.');
  assertEquals_(0, sentEmails.length, 'Restoring a sent checkbox should not send a duplicate email.');
  assertEquals_(true, sheet.getValueByHeader('Send Email'), 'Sent unchecked edit should be immediately restored.');
  assertEquals_(SummaryEmailService.STATUS_SENT, ledger[sendKey].status, 'Sent ledger entry should remain successful.');
}

function testSummarySendEmailBlockingStatusPreventsDuplicate_() {
  [
    SummaryEmailService.STATUS_SENDING,
    SummaryEmailService.STATUS_UNKNOWN,
    SummaryEmailService.STATUS_SEND_FAILED_BLOCKED,
    'MANUAL_REVIEW'
  ].forEach(status => {
    const sendKey = buildTestSummaryEmailSendKey_();
    const result = runSummaryEmailServiceTest_({
      ledger: {
        [sendKey]: {
          sendKey,
          status
        }
      }
    });

    assertEquals_('blocked', result.sendResult.status, `${status} should block send.`);
    assertEquals_(0, result.sentEmails.length, `${status} should not send.`);
    assertEquals_(false, result.sheet.getValueByHeader('Send Email'), `${status} should reset checkbox.`);
  });
}

function testSummarySendEmailValidationFailureResets_() {
  const result = runSummaryEmailServiceTest_({
    values: {
      'PDF': ''
    },
    formulaByHeader: {
      'PDF': ''
    }
  });
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('validation_failed', result.sendResult.status, 'Missing PDF should fail validation.');
  assertEquals_(0, result.sentEmails.length, 'Validation failure should not send.');
  assertEquals_(
    SummaryEmailService.STATUS_VALIDATION_FAILED,
    ledgerEntry.status,
    'Validation failure should set internal ledger status.'
  );
  assertContains_(
    ledgerEntry.error,
    'PDF Drive link',
    'Validation failure should write PDF error to ledger.'
  );
  assertEquals_(false, result.sheet.getValueByHeader('Send Email'), 'Validation failure should reset checkbox.');
}

function testSummarySendEmailMissingPdfBlocks_() {
  const result = runSummaryEmailServiceTest_({
    driveFileGetter() {
      throw new Error('missing file');
    }
  });

  assertEquals_('validation_failed', result.sendResult.status, 'Unreadable PDF should fail validation.');
  assertEquals_(0, result.sentEmails.length, 'Unreadable PDF should not send.');
  assertContains_(
    getOnlySummaryEmailLedgerEntry_(result.ledger).error,
    'missing file',
    'Unreadable PDF should write Drive error to ledger.'
  );
  assertEquals_(false, result.sheet.getValueByHeader('Send Email'), 'Unreadable PDF should reset checkbox.');
}

function testSummarySendEmailSubjectPlaceholders_() {
  const result = runSummaryEmailServiceTest_({
    values: {
      'Member': '',
      'Order No.': ''
    }
  });

  assertEquals_(
    'HX Part Pick: (blank member) - (blank order)',
    result.sentEmails[0].subject,
    'Blank subject fields should use placeholders.'
  );
}

function testSummarySendEmailBodyIncludesLinks_() {
  const result = runSummaryEmailServiceTest_({});
  const body = result.sentEmails[0].body;

  assertContains_(body, 'HX Part Pick', 'Email body should include heading.');
  assertContains_(body, 'Spreadsheet: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit', 'Email body should include spreadsheet link.');
  assertContains_(body, 'PDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view', 'Email body should include PDF link.');
  assertContains_(body, 'Carrier: AP', 'Email body should include row details.');
  assertContains_(body, 'Product Code: P001', 'Email body should include Product Code.');
  assertContains_(body, 'Product Description: Product One', 'Email body should include Product Description.');
  assertContains_(body, 'Vintage: 2020', 'Email body should include Vintage.');
  assertContains_(body, 'Bottle Size: 750ML', 'Email body should include Bottle Size.');
  assertNotContains_(body, 'Date Completed:', 'Email body should not include Date Completed.');
  assertNotContains_(body, 'SLA:', 'Email body should not include SLA.');
  assertNotContains_(body, 'Validation / Status Note:', 'Email body should not include validation note heading.');
  assertNotContains_(body, 'Validation note for test', 'Email body should not include validation note.');
  assertContains_(
    body,
    '\nSpreadsheet: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit\nPDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view',
    'Email body should end with inline spreadsheet and PDF links.'
  );
  assertEquals_(
    'PDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view',
    body.split('\n').pop(),
    'PDF link should be the final email body line.'
  );
}

function testSummarySendEmailAttachesPdfBlob_() {
  const result = runSummaryEmailServiceTest_({});
  const attachments = result.sentEmails[0].attachments;

  assertEquals_(1, attachments.length, 'Email should include one attachment.');
  assertEquals_('test.pdf', attachments[0].name, 'PDF blob should be attached and named.');
}

function testSummarySendEmailExceptionBlocksRetry_() {
  const result = runSummaryEmailServiceTest_({
    mailSender() {
      throw new Error('forced send failure');
    }
  });
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('send_failed_blocked', result.sendResult.status, 'Send exception should block retry.');
  assertEquals_(
    SummaryEmailService.STATUS_SEND_FAILED_BLOCKED,
    ledgerEntry.status,
    'Send exception should write blocked ledger status.'
  );
  assertContains_(
    ledgerEntry.error,
    'forced send failure',
    'Send exception should write ledger error.'
  );
  assertEquals_(false, result.sheet.getValueByHeader('Send Email'), 'Send exception should reset checkbox.');
}

function testCoordinatorRefreshProcessesOneRow_() {
  const sheet = buildMockSummarySheet_();
  const originalApply = EodReportCoordinator.applyToSummaryRows_;
  let captured = null;

  EodReportCoordinator.applyToSummaryRows_ = (actualSheet, startRow, rowCount) => {
    captured = { actualSheet, startRow, rowCount };
  };

  try {
    EodReportCoordinator.refreshSummaryRow(sheet, CONFIG.summary.headerRow + 4);
  } finally {
    EodReportCoordinator.applyToSummaryRows_ = originalApply;
  }

  assertTruthy_(captured, 'Coordinator refresh should call EOD row-range path.');
  assertEquals_(sheet, captured.actualSheet, 'Coordinator refresh should use the provided sheet.');
  assertEquals_(CONFIG.summary.headerRow + 4, captured.startRow, 'Coordinator refresh should use edited row.');
  assertEquals_(1, captured.rowCount, 'Coordinator refresh should process exactly one row.');
}

function testCoordinatorRefreshDoesNotAppend_() {
  const sheet = buildMockSummarySheet_();
  const originalApply = EodReportCoordinator.applyToSummaryRows_;
  const originalAppend = SummaryService.appendMissingSummaryRows;

  EodReportCoordinator.applyToSummaryRows_ = () => {};
  SummaryService.appendMissingSummaryRows = () => {
    throw new Error('appendMissingSummaryRows must not be called during refresh.');
  };

  try {
    EodReportCoordinator.refreshSummaryRow(sheet, CONFIG.summary.headerRow + 4);
  } finally {
    EodReportCoordinator.applyToSummaryRows_ = originalApply;
    SummaryService.appendMissingSummaryRows = originalAppend;
  }
}

function testCoordinatorRefreshUsesCurrentRowValues_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const headers = sheet
    .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const rowNumber = getNextTestSummaryRow_(sheet);
  const row = new Array(headers.length).fill('');
  const orderCol = getColumnIndex_(headers, 'Order No.');
  let seenOrder = '';

  assertTruthy_(orderCol > 0, 'Summary Order No. column missing.');

  row[0] = TEST_PREFIX + 'REFRESH_CURRENT_VALUES';
  row[orderCol - 1] = '7654321';

  sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .setValues([row]);

  const originalOutstanding = OutstandingOrdersEodReportService.applyToSummaryRows;
  const originalPallet = PalletAndProductByMembersEodReportService.applyToSummaryRows;

  OutstandingOrdersEodReportService.applyToSummaryRows = (context) => {
    seenOrder = context.value('Order No.', 0);
    return OutstandingOrdersEodReportService.createResult_();
  };

  PalletAndProductByMembersEodReportService.applyToSummaryRows = () =>
    PalletAndProductByMembersEodReportService.createResult_();

  try {
    EodReportCoordinator.refreshSummaryRow(sheet, rowNumber);
  } finally {
    OutstandingOrdersEodReportService.applyToSummaryRows = originalOutstanding;
    PalletAndProductByMembersEodReportService.applyToSummaryRows = originalPallet;
  }

  assertEquals_(
    '7654321',
    String(seenOrder),
    'Coordinator refresh should read current summary row values.'
  );
}

function testAppendMockRawRow_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'RAW_APPEND';
  const ctx = buildMockAppendContext_(processingKey);

  SheetService.appendPartPickRow(ctx);

  const rawSheet = SheetService.getSheet_(CONFIG.sheets.extractedSheetName);
  const row = findRowByFirstColumnValue_(rawSheet, processingKey);

  assertTruthy_(row.rowNumber > 0, 'Mock raw row was not appended.');

  const headers = rawSheet
    .getRange(1, 1, 1, rawSheet.getLastColumn())
    .getValues()[0];

  assertCellDisplayValue_(
    rawSheet,
    row.rowNumber,
    headers,
    'Order Number',
    '140O385',
    'Raw row order number should not be normalised.'
  );

  assertCellDisplayValue_(
    rawSheet,
    row.rowNumber,
    headers,
    'Location',
    '1 g20 e2',
    'Raw row location should not be normalised.'
  );

  assertCellDisplayValue_(
    rawSheet,
    row.rowNumber,
    headers,
    'B Number',
    '0888230',
    'Raw row B number should not be normalised.'
  );

  assertCellDisplayValue_(
    rawSheet,
    row.rowNumber,
    headers,
    'C Number',
    '1637376',
    'Raw row C number should not be normalised.'
  );

  assertCellDisplayValue_(
    rawSheet,
    row.rowNumber,
    headers,
    'Total Units',
    '25/276',
    'Raw row total units should not be normalised.'
  );
}

function testRepairAppendMissingSummaryRows_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'REPAIR_APPEND_MISSING';
  const ctx = buildMockAppendContext_(processingKey);

  SheetService.appendPartPickRow(ctx);

  withEodAppendStub_(() => {
    repairAppendMissingSummaryRows();
  });

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const find = findRowByFirstColumnValue_(summarySheet, processingKey);

  assertTruthy_(find.rowNumber > 0, 'Repair helper did not append existing raw row.');
}

function testRepairAppendIgnoresInflatedSummaryLastRow_() {
  ensureLocalTestSetup_();

  const existingKey = TEST_PREFIX + 'REPAIR_APPEND_PLACEMENT_EXISTING';
  const newKey = TEST_PREFIX + 'REPAIR_APPEND_PLACEMENT_NEW';
  let marker = null;

  SheetService.appendPartPickRow(buildMockAppendContext_(existingKey));

  withEodAppendStub_(() => {
    repairAppendMissingSummaryRows();
  });

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const existingFind = findRowByFirstColumnValue_(summarySheet, existingKey);

  assertTruthy_(
    existingFind.rowNumber > 0,
    'Repair placement setup did not append existing summary row.'
  );

  try {
    marker = setInflatedSummaryLastRowMarker_(summarySheet);

    SheetService.appendPartPickRow(buildMockAppendContext_(newKey));

    withEodAppendStub_(() => {
      repairAppendMissingSummaryRows();
    });

    const newFind = findRowByFirstColumnValue_(summarySheet, newKey);

    assertEquals_(
      existingFind.rowNumber + 1,
      newFind.rowNumber,
      'Repair helper should append after the last nonblank summary _Key.'
    );

    assertTruthy_(
      newFind.rowNumber !== marker.rowNumber + 1,
      'Repair helper incorrectly appended after an inflated non-key row.'
    );
  } finally {
    clearInflatedSummaryLastRowMarker_(summarySheet, marker);
  }
}

function testProcessorAppendsSummaryAfterThreadFailure_() {
  let waited = false;
  let released = false;
  let searchCalled = false;
  let summaryCalled = false;
  let errorLogged = false;
  const processedThreadIds = [];
  const originalLogError = LogService.error;
  const threads = [
    {
      getId: () => 'THREAD_FAIL'
    },
    {
      getId: () => 'THREAD_OK'
    }
  ];

  LogService.error = (status, messageId, filename, err) => {
    errorLogged = status === 'THREAD_FAILED_UNEXPECTED' &&
      err &&
      String(err.message || err).indexOf('thread exploded') > -1;
  };

  try {
    processPrinterEmails_({
      lockService: {
        getScriptLock: () => ({
          waitLock: timeoutMs => {
            waited = timeoutMs === 30000;
          },
          releaseLock: () => {
            released = true;
          }
        })
      },
      gmailService: {
        buildSearchQuery: () => 'in:inbox subject:"mock printer"'
      },
      gmailApp: {
        search: (query, start, max) => {
          searchCalled =
            query === 'in:inbox subject:"mock printer"' &&
            start === 0 &&
            max === CONFIG.gmail.maxThreadsPerRun;

          return threads;
        }
      },
      threadProcessor: thread => {
        const threadId = thread.getId();
        processedThreadIds.push(threadId);

        if (threadId === 'THREAD_FAIL') {
          throw new Error('thread exploded');
        }
      },
      summaryService: {
        appendMissingSummaryRows: () => {
          summaryCalled = true;
        }
      }
    });
  } finally {
    LogService.error = originalLogError;
  }

  assertEquals_(true, waited, 'Processor did not wait for the script lock.');
  assertEquals_(true, searchCalled, 'Processor did not run the configured Gmail search.');
  assertEquals_('THREAD_FAIL|THREAD_OK', processedThreadIds.join('|'), 'Processor did not continue after thread failure.');
  assertEquals_(true, errorLogged, 'Thread failure was not logged.');
  assertEquals_(true, summaryCalled, 'Summary append was skipped after thread failure.');
  assertEquals_(true, released, 'Processor did not release the script lock.');
}

function testSummaryAppendIgnoresInflatedLastRow_() {
  ensureLocalTestSetup_();

  const existingKey = TEST_PREFIX + 'SUMMARY_APPEND_PLACEMENT_EXISTING';
  const newKey = TEST_PREFIX + 'SUMMARY_APPEND_PLACEMENT_NEW';
  let marker = null;

  SheetService.appendPartPickRow(buildMockAppendContext_(existingKey));
  withEodAppendStub_(() => SummaryService.appendMissingSummaryRows());

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const existingFind = findRowByFirstColumnValue_(summarySheet, existingKey);

  assertTruthy_(
    existingFind.rowNumber > 0,
    'Summary placement setup did not append existing summary row.'
  );

  try {
    marker = setInflatedSummaryLastRowMarker_(summarySheet);

    SheetService.appendPartPickRow(buildMockAppendContext_(newKey));
    withEodAppendStub_(() => SummaryService.appendMissingSummaryRows());

    const newFind = findRowByFirstColumnValue_(summarySheet, newKey);

    assertEquals_(
      existingFind.rowNumber + 1,
      newFind.rowNumber,
      'Summary append should append after the last nonblank summary _Key.'
    );

    assertTruthy_(
      newFind.rowNumber !== marker.rowNumber + 1,
      'Summary append incorrectly used the inflated sheet last row.'
    );
  } finally {
    clearInflatedSummaryLastRowMarker_(summarySheet, marker);
  }
}

function testSummaryAppendOnly_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'SUMMARY_APPEND_ONLY';
  const ctx = buildMockAppendContext_(processingKey);

  SheetService.appendPartPickRow(ctx);
  const appendStats = withEodAppendStub_(() => SummaryService.appendMissingSummaryRows());

  assertTruthy_(
    appendStats.rawRowsScanned >= 1,
    'Summary append stats did not report scanned raw rows.'
  );

  assertTruthy_(
    appendStats.existingSummaryKeysFound >= 0,
    'Summary append stats did not report existing summary keys.'
  );

  assertTruthy_(
    appendStats.missingRowsAppended >= 1,
    'Summary append stats did not report appended missing rows.'
  );

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const firstFind = findRowByFirstColumnValue_(summarySheet, processingKey);

  if (firstFind.rowNumber <= 0) {
    const oldKeyRows = findRowsWhereFirstColumnStartsWith_(summarySheet, processingKey);

    if (oldKeyRows.length > 0) {
      throw new Error(
        'Summary row exists, but with an old/non-final key format. ' +
        'Fix SummaryService.buildSummaryKey_(raw) so it returns raw["Processing Key"] only.'
      );
    }

    throw new Error('Summary row was not appended.');
  }

  const headers = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];

  const customerCol = getColumnIndex_(headers, 'Customer Name');
  const carrierCol = getColumnIndex_(headers, 'Carrier');

  assertTruthy_(customerCol > 0, 'Summary Customer Name column missing.');
  assertTruthy_(carrierCol > 0, 'Summary Carrier column missing.');

  summarySheet
    .getRange(firstFind.rowNumber, customerCol)
    .setValue('MANUAL CUSTOMER OVERRIDE');

  summarySheet
    .getRange(firstFind.rowNumber, carrierCol)
    .setValue('MANUAL CARRIER SHOULD STAY');

  withEodAppendStub_(() => {
    SummaryService.appendMissingSummaryRows();
  });

  const secondFind = findRowByFirstColumnValue_(summarySheet, processingKey);

  assertEquals_(
    firstFind.rowNumber,
    secondFind.rowNumber,
    'Summary append-only failed: duplicate row was created.'
  );

  assertEquals_(
    'MANUAL CUSTOMER OVERRIDE',
    summarySheet.getRange(secondFind.rowNumber, customerCol).getValue(),
    'Summary append-only failed: manual customer edit was overwritten.'
  );

  assertEquals_(
    'MANUAL CARRIER SHOULD STAY',
    summarySheet.getRange(secondFind.rowNumber, carrierCol).getValue(),
    'Summary append-only failed: manual carrier edit was overwritten.'
  );
}

function testSummaryAppendPreservesTimestampValueAndFormat_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'SUMMARY_TIMESTAMP_FORMAT';
  const ctx = buildMockAppendContext_(processingKey);
  const expectedReceivedAt = ctx.message.getDate();

  SheetService.appendPartPickRow(ctx);

  const rawSheet = SheetService.getSheet_(CONFIG.sheets.extractedSheetName);
  const rawFind = findRowByFirstColumnValue_(rawSheet, processingKey);
  const rawHeaders = rawSheet
    .getRange(1, 1, 1, rawSheet.getLastColumn())
    .getValues()[0];
  const rawProcessedAtCol = getColumnIndex_(rawHeaders, 'Processed At');
  const rawReceivedAtCol = getColumnIndex_(rawHeaders, 'Email Received At');

  assertTruthy_(rawFind.rowNumber > 0, 'Raw timestamp test row was not appended.');
  assertTruthy_(rawProcessedAtCol > 0, 'Raw Processed At column missing.');
  assertTruthy_(rawReceivedAtCol > 0, 'Raw Email Received At column missing.');

  SheetService.setupSheets();

  const rawProcessedAtValue = rawSheet
    .getRange(rawFind.rowNumber, rawProcessedAtCol)
    .getValue();
  const rawReceivedAtValue = rawSheet
    .getRange(rawFind.rowNumber, rawReceivedAtCol)
    .getValue();

  assertTruthy_(
    rawProcessedAtValue instanceof Date,
    'Processed At should remain a Date object after setup formatting.'
  );
  assertTruthy_(
    rawReceivedAtValue instanceof Date,
    'Email Received At should remain a Date object after setup formatting.'
  );
  assertEquals_(
    expectedReceivedAt.getTime(),
    rawReceivedAtValue.getTime(),
    'Email Received At timestamp value should not be rewritten.'
  );

  withEodAppendStub_(() => SummaryService.appendMissingSummaryRows());

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const summaryFind = findRowByFirstColumnValue_(summarySheet, processingKey);
  const summaryHeaders = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];
  const scannedAtCol = getColumnIndex_(summaryHeaders, 'Scanned At');

  assertTruthy_(summaryFind.rowNumber > 0, 'Summary timestamp test row was not appended.');
  assertTruthy_(scannedAtCol > 0, 'Summary Scanned At column missing.');

  const summaryScannedAtValue = summarySheet
    .getRange(summaryFind.rowNumber, scannedAtCol)
    .getValue();

  assertTruthy_(
    summaryScannedAtValue instanceof Date,
    'Summary Scanned At should remain a Date object.'
  );
  assertEquals_(
    expectedReceivedAt.getTime(),
    summaryScannedAtValue.getTime(),
    'Summary append should preserve the Email Received At timestamp value.'
  );
  assertCellNumberFormat_(
    summarySheet,
    summaryFind.rowNumber,
    summaryHeaders,
    'Scanned At',
    SheetService.dateTimeNumberFormat,
    'Summary Scanned At should display full date and time.'
  );
}

function withEodAppendStub_(callback) {
  const originalApply = EodReportCoordinator.applyToSummaryRows;

  EodReportCoordinator.applyToSummaryRows = () => {};

  try {
    return callback();
  } finally {
    EodReportCoordinator.applyToSummaryRows = originalApply;
  }
}

function setInflatedSummaryLastRowMarker_(sheet) {
  const markerRow = Math.max(1000, sheet.getLastRow() + 25);
  const markerCol = 2;

  if (sheet.getMaxRows() < markerRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), markerRow - sheet.getMaxRows());
  }

  sheet
    .getRange(markerRow, markerCol)
    .setValue(false);

  return {
    rowNumber: markerRow,
    columnNumber: markerCol
  };
}

function clearInflatedSummaryLastRowMarker_(sheet, marker) {
  if (!marker) {
    return;
  }

  sheet
    .getRange(marker.rowNumber, marker.columnNumber)
    .clearContent();
}

function testPageProcessingKey_() {
  const batchPdf = Utilities.newBlob(
    'batch pdf bytes',
    'application/pdf',
    'batch.pdf'
  );

  const pagePdf1a = {
    pageNumber: 1,
    filename: 'batch_page_1.pdf',
    blob: Utilities.newBlob(
      'generated page bytes version A',
      'application/pdf',
      'batch_page_1.pdf'
    )
  };

  const pagePdf1b = {
    pageNumber: 1,
    filename: 'batch_page_1.pdf',
    blob: Utilities.newBlob(
      'generated page bytes version B',
      'application/pdf',
      'batch_page_1.pdf'
    )
  };

  const pagePdf2 = {
    pageNumber: 2,
    filename: 'batch_page_2.pdf',
    blob: Utilities.newBlob(
      'generated page 2 bytes',
      'application/pdf',
      'batch_page_2.pdf'
    )
  };

  const key1a = buildPageProcessingKey_(batchPdf, pagePdf1a);
  const key1b = buildPageProcessingKey_(batchPdf, pagePdf1b);
  const key2 = buildPageProcessingKey_(batchPdf, pagePdf2);
  const batchKey = buildBatchProcessingKey_(batchPdf);
  const expectedBatchKey = `BATCH::${Utils.md5Hex(batchPdf.getBytes())}`;

  assertEquals_(
    expectedBatchKey,
    batchKey,
    'Batch key should use the original batch PDF bytes.'
  );

  assertEquals_(
    `${batchKey}::PAGE-1`,
    key1a,
    'Page key should remain compatible with existing BATCH::<md5>::PAGE-N keys.'
  );

  assertEquals_(
    key1a,
    key1b,
    'Same original batch PDF and page number should generate same processing key even if generated page bytes differ.'
  );

  assertTruthy_(
    key1a !== key2,
    'Different page numbers should generate different processing keys.'
  );

  assertContains_(key1a, 'PAGE-1', 'Page key should include page number.');
  assertContains_(key2, 'PAGE-2', 'Page key should include page number.');
}

function testLegacyPageKeyDoesNotSkipBatch_() {
  const batchPdf = Utilities.newBlob(
    'legacy migration batch pdf bytes',
    'application/pdf',
    'legacy_batch.pdf'
  );

  const pagePdfs = [
    {
      pageNumber: 1,
      filename: 'legacy_batch_page_1.pdf',
      blob: Utilities.newBlob(
        'page 1 bytes',
        'application/pdf',
        'legacy_batch_page_1.pdf'
      )
    },
    {
      pageNumber: 2,
      filename: 'legacy_batch_page_2.pdf',
      blob: Utilities.newBlob(
        'page 2 bytes',
        'application/pdf',
        'legacy_batch_page_2.pdf'
      )
    }
  ];

  const legacyPage1Key = buildPageProcessingKey_(batchPdf, pagePdfs[0]);
  const batchKey = buildBatchProcessingKey_(batchPdf);
  const status = buildBatchPageDedupeStatus_(batchPdf, pagePdfs, [legacyPage1Key]);

  assertEquals_(
    batchKey,
    status.batchProcessingKey,
    'Dedupe status should report the exact batch key.'
  );

  assertEquals_(
    false,
    status.skipBatchBeforeSplit,
    'A legacy page key must not skip the whole batch before splitting.'
  );

  assertEquals_(
    true,
    status.pages[0].skipPageAfterSplit,
    'Existing legacy page 1 key should skip page 1 after splitting.'
  );

  assertEquals_(
    false,
    status.pages[1].skipPageAfterSplit,
    'Missing page 2 key should leave page 2 eligible for processing.'
  );
}

function testPdfProcessorHealth_() {
  const endpoint = CONFIG.pdf && CONFIG.pdf.processorEndpoint;

  assertTruthy_(endpoint, 'CONFIG.pdf.processorEndpoint missing.');

  const healthUrl = endpoint.replace(/\/split$/, '/health');

  const response = UrlFetchApp.fetch(healthUrl, {
    method: 'get',
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  Logger.log(`PDF processor health status: ${status}`);
  Logger.log(`PDF processor health body: ${body}`);

  assertEquals_(200, status, `PDF processor health failed: ${body}`);
  assertContains_(body, 'ok', 'PDF processor health response should contain ok.');
}

/**
 * Mock builders
 */

function buildMockSummaryRefreshEditEvent_(options) {
  const refreshCol = options.refreshCol || CONFIG.summary.columns.length + 1;
  const headers = new Array(Math.max(refreshCol, options.col || refreshCol)).fill('');

  headers[0] = '_Key';
  headers[refreshCol - 1] = 'Refresh EOD';

  const sheet = buildMockSummarySheet_(options.sheetName, headers);
  const range = {
    valueSet: undefined,
    getNumRows: () => options.numRows || 1,
    getNumColumns: () => options.numCols || 1,
    getSheet: () => sheet,
    getRow: () => options.row,
    getColumn: () => options.col,
    setValue(value) {
      this.valueSet = value;
    }
  };

  return {
    range,
    value: options.value
  };
}

function buildMockSummarySendEmailEditEvent_(options) {
  const sendCol = options.sendCol || CONFIG.summary.columns.length + 1;
  const headers = new Array(Math.max(sendCol, options.col || sendCol)).fill('');

  headers[0] = '_Key';
  headers[sendCol - 1] = 'Send Email';

  const sheet = buildMockSummarySheet_(options.sheetName, headers);
  const range = {
    valueSet: undefined,
    getNumRows: () => options.numRows || 1,
    getNumColumns: () => options.numCols || 1,
    getSheet: () => sheet,
    getRow: () => options.row,
    getColumn: () => options.col,
    setValue(value) {
      this.valueSet = value;
    }
  };

  return {
    range,
    value: options.value
  };
}

function buildMockSummarySheet_(sheetName, headers) {
  const headerValues = headers || [
    '_Key',
    ...CONFIG.summary.columns.map(column => column.header)
  ];

  return {
    getName: () => sheetName || CONFIG.summary.sheetName,
    getLastColumn: () => headerValues.length,
    getRange(row, col, rowCount, colCount) {
      return {
        getValues: () => {
          if (row === Number(CONFIG.summary.headerRow || 2)) {
            return [headerValues.slice(col - 1, col - 1 + colCount)];
          }

          return [new Array(colCount).fill('')];
        }
      };
    }
  };
}

function runSummaryEmailServiceTest_(options) {
  const settings = options || {};
  const sentEmails = [];
  const ledger = settings.ledger || {};
  const sheet = buildMockSummaryEmailSheet_(settings);

  SummaryEmailService.setMailSenderForTest_(settings.mailSender || function(email) {
    sentEmails.push(email);
  });
  SummaryEmailService.setDriveFileGetterForTest_(settings.driveFileGetter || function(fileId) {
    return buildMockPdfDriveFile_(fileId);
  });
  SummaryEmailService.setSpreadsheetUrlForTest_(
    settings.spreadsheetUrl || 'https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit'
  );
  SummaryEmailService.setLedgerForTest_(ledger);

  try {
    return {
      sheet,
      sentEmails,
      ledger,
      sendResult: SummaryEmailService.sendSummaryRowEmail(
        sheet,
        settings.rowNumber || CONFIG.summary.headerRow + 1
      )
    };
  } finally {
    SummaryEmailService.resetTestDoubles_();
  }
}

function buildTestSummaryEmailSendKey_() {
  return [
    TEST_PREFIX + 'SUMMARY_EMAIL',
    CONFIG.summaryEmail.recipient,
    'PDF_FILE_ID_1234567890'
  ].join('::');
}

function getOnlySummaryEmailLedgerEntry_(ledger) {
  const keys = Object.keys(ledger || {});

  assertEquals_(1, keys.length, 'Expected exactly one summary email ledger entry.');

  return ledger[keys[0]];
}

function buildMockSummaryEmailSheet_(options) {
  const settings = options || {};
  const headers = [
    '_Key',
    ...CONFIG.summary.columns.map(column => column.header)
  ];
  const rowValues = headers.map(header => {
    const defaults = {
      '_Key': TEST_PREFIX + 'SUMMARY_EMAIL',
      '*': '',
      'PDF': 'Open PDF',
      'Scanned At': new Date('2026-06-01T09:30:00+10:00'),
      'Carrier': 'AP',
      'State': 'VIC',
      'Customer Name': 'Example Customer',
      'Member': 'MEM123',
      'Owner': 'OWN01',
      'Order No.': '1234567',
      'Location': '1G20E2',
      'C Number': 'C123456',
      'B Number': 'B1234567',
      'Product Code': 'P001',
      'Product Description': 'Product One',
      'Vintage': '2020',
      'Bottle Size': '750ML',
      'Date Completed': '2026-06-01',
      'SLA': '0.5',
      'Refresh EOD': false,
      'Email Sent At': '',
      'Email Sent To': '',
      'Email Status': '',
      'Email Error': '',
      'Send Email': true
    };

    const overrides = settings.values || {};

    return Object.prototype.hasOwnProperty.call(overrides, header)
      ? overrides[header]
      : defaults[header] || '';
  });
  const notesByHeader = Object.assign(
    {
      '*': 'Validation note for test'
    },
    settings.notesByHeader || {}
  );
  const formulaByHeader = Object.assign(
    {
      'PDF': '=HYPERLINK("https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view","Open PDF")'
    },
    settings.formulaByHeader || {}
  );
  const richTextUrlByHeader = settings.richTextUrlByHeader || {};
  const protections = [];
  const sheet = {
    getName: () => settings.sheetName || CONFIG.summary.sheetName,
    getLastColumn: () => headers.length,
    getRange(row, col, rowCount, colCount) {
      return buildMockSummaryEmailRange_({
        sheet,
        headers,
        rowValues,
        notesByHeader,
        formulaByHeader,
        richTextUrlByHeader,
        protections,
        row,
        col,
        rowCount: rowCount || 1,
        colCount: colCount || 1
      });
    },
    getValueByHeader(headerName) {
      return rowValues[headers.indexOf(headerName)];
    },
    protections
  };

  return sheet;
}

function buildMockSummaryEmailRange_(state) {
  const headerName = state.headers[state.col - 1];

  return {
    getSheet() {
      return state.sheet;
    },
    getRow() {
      return state.row;
    },
    getColumn() {
      return state.col;
    },
    getNumRows() {
      return state.rowCount;
    },
    getNumColumns() {
      return state.colCount;
    },
    getValues() {
      if (state.row === Number(CONFIG.summary.headerRow || 2)) {
        return [state.headers.slice(state.col - 1, state.col - 1 + state.colCount)];
      }

      return [state.rowValues.slice(state.col - 1, state.col - 1 + state.colCount)];
    },
    getDisplayValues() {
      if (state.row === Number(CONFIG.summary.headerRow || 2)) {
        return [state.headers.slice(state.col - 1, state.col - 1 + state.colCount)];
      }

      return [state.rowValues
        .slice(state.col - 1, state.col - 1 + state.colCount)
        .map(value => value instanceof Date ? value.toISOString() : String(value || ''))];
    },
    getValue() {
      return state.rowValues[state.col - 1];
    },
    getDisplayValue() {
      const value = state.rowValues[state.col - 1];

      return value instanceof Date ? value.toISOString() : String(value || '');
    },
    setValue(value) {
      state.rowValues[state.col - 1] = value;
      return this;
    },
    getFormula() {
      return state.formulaByHeader[headerName] || '';
    },
    getRichTextValue() {
      const url = state.richTextUrlByHeader[headerName] || '';

      return {
        getLinkUrl: () => url
      };
    },
    getNote() {
      return state.notesByHeader[headerName] || '';
    },
    protect() {
      const protection = buildMockProtection_(SummaryEmailService.sentProtectionDescription);

      state.protections.push({
        headerName,
        protection
      });

      return protection;
    }
  };
}

function buildMockPdfDriveFile_(fileId) {
  const blob = {
    fileId,
    name: '',
    setName(name) {
      this.name = name;
      return this;
    }
  };

  return {
    getMimeType: () => MimeType.PDF,
    getName: () => 'test.pdf',
    getBlob: () => blob
  };
}

function buildMockEodReportCacheSheet_() {
  return buildMockEodReportCacheSheets_().metadata;
}

function buildMockEodReportCacheSheets_() {
  return {
    metadata: buildMockSheetWithHeaders_([
      'Cache Key',
      'Report Key',
      'Date Key',
      'Source Message ID',
      'Source Filename',
      'Source Date',
      'Cached At',
      'Header Row',
      'Headers JSON',
      'Row Count',
      'Status',
      'Error'
    ]),
    rows: {
      outstandingOrders: buildMockSheetWithHeaders_([
        'Cache Key',
        'Report Key',
        'Date Key',
        'Source Message ID',
        'Source Filename',
        'Source Date',
        'Cached At',
        'Report Row',
        'Order No.',
        'Customer Name',
        'Carrier Code',
        'Customer State',
        'Search Criteria',
        'Qty Ord',
        'Order Type'
      ]),
      palletAndProductByMembers: buildMockSheetWithHeaders_([
        'Cache Key',
        'Report Key',
        'Date Key',
        'Source Message ID',
        'Source Filename',
        'Source Date',
        'Cached At',
        'Report Row',
        'Bin Location',
        'Child pallet no.',
        'Original pallet no.',
        'Owner',
        'Member No',
        'Product Code',
        'Product Description',
        'Vintage',
        'Bottle Size'
      ])
    }
  };
}

function buildMockSheetWithHeaders_(headers) {
  const state = {
    headers: headers.slice(),
    appendRowCalls: 0,
    setValuesCalls: 0
  };
  const sheet = {
    dataRows: [],
    getLastRow() {
      return 1 + this.dataRows.length;
    },
    getLastColumn() {
      return Math.max(
        state.headers.length,
        this.dataRows.reduce((max, row) => Math.max(max, row.length), 0)
      );
    },
    getRange(row, col, rowCount, colCount) {
      return {
        getValues: () => {
          const source = row === 1
            ? [state.headers]
            : sheet.dataRows.slice(row - 2, row - 2 + rowCount);

          return source.map(sourceRow => {
            const output = sourceRow.slice(col - 1, col - 1 + colCount);

            while (output.length < colCount) {
              output.push('');
            }

            return output;
          });
        },
        setValues(values) {
          state.setValuesCalls++;
          values.forEach((valueRow, index) => {
            if (row + index === 1) {
              state.headers = valueRow.slice();
              return;
            }

            sheet.dataRows[row - 2 + index] = valueRow.slice();
          });
        }
      };
    },
    clearContents() {
      state.headers = [];
      this.dataRows.length = 0;
    },
    setFrozenRows() {},
    appendRow(row) {
      state.appendRowCalls++;
      this.dataRows.push(row.slice());
    },
    get appendRowCalls() {
      return state.appendRowCalls;
    },
    get setValuesCalls() {
      return state.setValuesCalls;
    }
  };

  return sheet;
}

function buildMockEodCsvReport_(reportKey, dateKey, options) {
  const settings = options || {};
  const isPalletReport = reportKey === 'palletAndProductByMembers';
  const headers = settings.headers || (isPalletReport
    ? [
      'Bin Location',
      'Child pallet no.',
      'Original pallet no.',
      'Owner',
      'Member No',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size'
    ]
    : [
      'Order No.',
      'Customer Name',
      'Carrier Code',
      'Customer State',
      'Search Criteria',
      'Qty Ord',
      'Order Type'
    ]);
  const rows = settings.rows || (isPalletReport
    ? [['A0101', 'C1234567', 'B1234567', 'ABCDE', 'M001', 'P001', 'Product One', '2020', '750ML']]
    : [['ABCDE123', 'Same Customer', 'AP', 'VIC', 'BB&V1990&OB1234567', '1', 'OL']]);

  return {
    reportKey,
    displayName: isPalletReport ? 'PALLET AND PRODUCT BY MEMBERS' : 'OUTSTANDING ORDERS',
    filename: isPalletReport ? 'RP_Pallet_and_Product_by_Member.csv' : 'RP_OUTSTANDING_ORDERS.csv',
    subject: isPalletReport
      ? 'EOD Reports - RP_Pallet_and_Product_by_Member.csv'
      : 'EOD Reports - RP_OUTSTANDING_ORDERS.csv',
    messageId: `${reportKey}-MSG1`,
    messageDate: new Date(`${dateKey}T09:00:00+10:00`),
    dateKey,
    headerRow: 3,
    headers,
    rows: rows.filter(row => EodReportCsvService.isReportCacheableRow_(reportKey, row, headers))
  };
}

function buildWarmupSideEffectGuards_() {
  const originals = [];
  let sideEffectCount = 0;

  function guard(target, key) {
    if (!target || typeof target[key] !== 'function') {
      return;
    }

    const original = target[key];
    originals.push({
      target,
      key,
      original
    });
    target[key] = function() {
      sideEffectCount++;
      throw new Error(`Unexpected warmup side effect: ${key}`);
    };
  }

  guard(SummaryService, 'appendMissingSummaryRows');
  guard(SheetService, 'appendPartPickRow');
  guard(DedupeService, 'markProcessed');
  guard(SummaryEmailService, 'sendSummaryRowFromEdit');
  guard(GeminiService, 'extractPdf');
  guard(DriveService, 'archivePdf');
  guard(GmailService, 'buildSearchQuery');
  guard(LabelService, 'setupLabels');

  return {
    count() {
      return sideEffectCount;
    },
    restore() {
      originals.forEach(entry => {
        entry.target[entry.key] = entry.original;
      });
    }
  };
}

function buildMockScriptAppForTimeTrigger_(triggers, createdHandlers) {
  return {
    getProjectTriggers: () => triggers,
    newTrigger(handlerName) {
      const created = {
        handlerName,
        everyDays: 0,
        atHour: -1
      };

      return {
        timeBased() {
          return this;
        },
        everyDays(days) {
          created.everyDays = days;
          return this;
        },
        atHour(hour) {
          created.atHour = hour;
          return this;
        },
        create() {
          createdHandlers.push(created);
          return created;
        }
      };
    }
  };
}

function buildMockLock_() {
  return {
    released: false,
    releaseLock() {
      this.released = true;
    }
  };
}

function buildMockUser_(email) {
  return {
    getEmail: () => email
  };
}

function buildMockProtectableSheet_(name, protections) {
  const sheet = {
    protections: protections || [],
    getName: () => name,
    getProtections: () => sheet.protections.filter(protection => !protection.removed),
    protect() {
      const protection = buildMockProtection_('');

      sheet.protections.push(protection);

      return protection;
    }
  };

  return sheet;
}

function buildMockProtection_(description, options) {
  const settings = options || {};
  const protection = {
    description: description || '',
    removed: false,
    domainEdit: settings.domainEdit == null ? true : settings.domainEdit,
    warningOnly: settings.warningOnly == null ? true : settings.warningOnly,
    editors: settings.editors || [
      buildMockUser_('owner@example.com'),
      buildMockUser_('normal.user@example.com')
    ],

    getDescription() {
      return this.description;
    },

    setDescription(value) {
      this.description = value;
      return this;
    },

    remove() {
      this.removed = true;
    },

    canDomainEdit() {
      return this.domainEdit;
    },

    setDomainEdit(value) {
      this.domainEdit = value;
      return this;
    },

    isWarningOnly() {
      return this.warningOnly;
    },

    setWarningOnly(value) {
      this.warningOnly = value;
      return this;
    },

    addEditor(user) {
      const email = user && user.getEmail ? user.getEmail() : '';

      if (
        email &&
        !this.editors.some(editor => editor.getEmail() === email)
      ) {
        this.editors.push(user);
      }

      return this;
    },

    getEditors() {
      return this.editors.slice();
    },

    removeEditors(editors) {
      const removeEmails = {};

      (editors || []).forEach(editor => {
        removeEmails[editor.getEmail()] = true;
      });

      this.editors = this.editors.filter(editor => !removeEmails[editor.getEmail()]);

      return this;
    }
  };

  return protection;
}

function runPalletProductRowTest_(options) {
  const context = buildMockPalletProductContext_(options.values || {}, options.notes || {});
  const validationRows = EodReportValidationService.create(1);
  const result = PalletAndProductByMembersEodReportService.createResult_();
  const lookup = buildMockPalletProductLookup_(options.records || []);

  PalletAndProductByMembersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    lookup,
    '2026-05-01',
    result
  );

  return {
    context,
    validationRows,
    result
  };
}

function buildMockPalletProductContext_(values, notes) {
  const baseValues = {
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Member': '',
    'Location': '',
    'C Number': '',
    'B Number': ''
  };

  Object.keys(values).forEach(key => {
    baseValues[key] = values[key];
  });

  return {
    rowCount: 1,
    values: baseValues,
    notes,

    value(headerName) {
      return this.values[headerName] || '';
    },

    setValue(headerName, rowIndex, value) {
      this.values[headerName] = value;
    },

    setNote(headerName, rowIndex, value) {
      this.notes[headerName] = value;
    }
  };
}

function buildMockPalletProductLookup_(records) {
  const lookup = {
    filename: 'RP_Pallet_and_Product_by_Member.csv',
    dateKey: '2026-05-01',
    byPair: {},
    byCNumber: {},
    byBNumber: {},
    byBNumberAndOwner: {}
  };

  records.forEach((record, index) => {
    const normalized = buildPalletProductRecord_(record);

    normalized.reportRow = index + 4;

    if (normalized.cNumber && normalized.bNumber) {
      lookup.byPair[
        EodReportNormalisationService.pairKey(normalized.cNumber, normalized.bNumber)
      ] = normalized;
    }

    EodReportNormalisationService.addLookupRecord(lookup.byCNumber, normalized.cNumber, normalized);
    EodReportNormalisationService.addLookupRecord(lookup.byBNumber, normalized.bNumber, normalized);

    if (normalized.bNumber && normalized.owner) {
      EodReportNormalisationService.addLookupRecord(
        lookup.byBNumberAndOwner,
        EodReportNormalisationService.bOwnerKey(normalized.bNumber, normalized.owner),
        normalized
      );
    }
  });

  return lookup;
}

function buildPalletProductRecord_(record) {
  return {
    reportRow: record.reportRow || 4,
    location: String(record.location || '').trim(),
    cNumber: EodReportNormalisationService.normalizeCNumber(record.cNumber),
    bNumber: EodReportNormalisationService.normalizeBNumber(record.bNumber),
    owner: EodReportNormalisationService.normalizeOwner(record.owner),
    memberNo: EodReportNormalisationService.normalizeMember(record.memberNo),
    productCode: String(record.productCode || '').trim(),
    productDescription: String(record.productDescription || '').trim(),
    vintage: String(record.vintage || '').trim(),
    bottleSize: String(record.bottleSize || '').trim()
  };
}

function buildMockAppendContext_(processingKey) {
  const mockMessage = {
    getDate: () => new Date('2026-05-01T09:30:00+10:00'),
    getId: () => 'MOCK_MESSAGE_ID'
  };

  const mockPdf = {
    getName: () => 'mock_scan_page_1.pdf'
  };

  const mockArchiveFile = {
    getUrl: () => 'https://drive.google.com/mock-pdf'
  };

  const mockForm = {
    form_date: '30/4/26',
    state: 'VIC',
    weather_status: 'SHIP',
    picker: 'Warehouse User',
    order_number: '140O385',
    customer_name: 'Example Customer',
    member_code: null,
    original_location: '1 g20 e2',
    b_code: '0888230',
    carton_number: '1637376',
    wine_description: 'Clarendon Hills Brookman',
    vintage: '2008',
    bottles_missing: '02 bottles',
    total_bottle_count: '25/276',
    total_carton_count: '2 x 12pk, 1 x 3pk',
    q_label: '1051890',
    special_instructions: null,
    incomplete_reason: 'BOTTLE NOT IN BOX',
    carrier: 'AUSTRALIA POST',
    picker_initials: null,
    picker_signoff_date: '1/05/26',
    external_misc_notes: 'Diagonal line across page',
    needs_review: false,
    review_reasons: []
  };

  return {
    message: mockMessage,
    pdf: mockPdf,
    archiveFile: mockArchiveFile,
    form: mockForm,
    processingKey,
    extractionStatus: 'AUTO_EXTRACTED',
    extractionError: ''
  };
}

function summaryRowToObject_(row) {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const values = {};

  headers.forEach((header, index) => {
    values[header] = row[index];
  });

  return values;
}

function runOutstandingOrdersRowTest_(options) {
  const match = options.match;
  const matchBNumber = match.searchCriteriaBNumber || options.bNumber || 'B1234567';
  const context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': match.orderNumber,
    'Customer Name': options.customerName,
    'Carrier': options.carrier,
    'State': options.state,
    'B Number': options.bNumber || matchBNumber
  });

  const validationRows = EodReportValidationService.create(1);
  const result = OutstandingOrdersEodReportService.createResult_();
  const group = {
    orderNumber: match.orderNumber,
    searchCriteriaBNumber: matchBNumber,
    owner: match.owner || '',
    customerName: match.customerName || '',
    carrierCode: match.carrierCode || '',
    customerState: match.customerState || '',
    qtyOrdSum: match.qtyOrdSum || 0,
    ambiguous: match.ambiguous || false,
    ambiguityReasons: match.ambiguityReasons || [],
    rows: match.rows || [match]
  };
  const lookup = {
    byOrderNumber: {},
    byOrderNumberAndBNumber: {}
  };
  const orderLookup = {
    orderNumber: match.orderNumber,
    orderTotalQtyOrd: group.qtyOrdSum,
    bNumbers: {}
  };

  orderLookup.bNumbers[matchBNumber] = group;
  lookup.byOrderNumber[match.orderNumber] = orderLookup;
  lookup.byOrderNumberAndBNumber[
    `${match.orderNumber}::${matchBNumber}`
  ] = group;

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    lookup,
    '2026-05-01',
    result
  );

  return {
    context,
    validationRows,
    result
  };
}

function buildMockOutstandingOrdersReport_(rows) {
  return {
    filename: 'RP_OUTSTANDING_ORDERS.csv',
    dateKey: '2026-05-01',
    headerRow: 3,
    headers: [
      'Order No.',
      'Customer Name',
      'Carrier Code',
      'Customer State',
      'Search Criteria',
      'Qty Ord',
      'Order Type'
    ],
    rows
  };
}

function buildOutstandingOrdersCsvRow_(row) {
  return [
    row.orderNo || 'ABCDE123',
    row.customerName || 'Same Customer',
    row.carrierCode || 'AP',
    row.customerState || 'VIC',
    row.searchCriteria || 'BB&V1990&OB1234567',
    row.qtyOrd == null ? '' : row.qtyOrd,
    row.orderType || 'OL'
  ];
}

function buildMockOutstandingOrdersContext_(values) {
  return {
    rowCount: 1,
    values,

    value(headerName) {
      return this.values[headerName] || '';
    },

    setValue(headerName, rowIndex, value) {
      this.values[headerName] = value;
    }
  };
}

function stubPalletLookupForTest_(lookup) {
  const original = PalletAndProductByMembersEodReportService.getLookupForDate;

  PalletAndProductByMembersEodReportService.getLookupForDate = () => lookup;

  return function restore() {
    PalletAndProductByMembersEodReportService.getLookupForDate = original;
  };
}

/**
 * Test result output
 */

function runTest_(name, fn, results) {
  const startedAt = new Date();

  try {
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

/**
 * Assertions
 */

function assertTruthy_(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertEquals_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(`${message} Expected "${expected}", got "${actual}".`);
  }
}

function assertContains_(value, expectedSubstring, message) {
  const text = String(value || '');

  if (text.indexOf(expectedSubstring) === -1) {
    throw new Error(`${message} Missing "${expectedSubstring}".`);
  }
}

function assertNotContains_(value, unexpectedSubstring, message) {
  const text = String(value || '');

  if (text.indexOf(unexpectedSubstring) !== -1) {
    throw new Error(`${message} Found "${unexpectedSubstring}".`);
  }
}

function assertCellDisplayValue_(sheet, rowNumber, headers, headerName, expected, message) {
  const col = getColumnIndex_(headers, headerName);

  assertTruthy_(col > 0, `Column not found: ${headerName}`);

  const actual = sheet.getRange(rowNumber, col).getDisplayValue();

  assertEquals_(
    String(expected),
    String(actual),
    message
  );
}

function assertCellNumberFormat_(sheet, rowNumber, headers, headerName, expected, message) {
  const col = getColumnIndex_(headers, headerName);

  assertTruthy_(col > 0, `Column not found: ${headerName}`);

  const actual = sheet.getRange(rowNumber, col).getNumberFormat();

  assertEquals_(
    String(expected),
    String(actual),
    message
  );
}

/**
 * Sheet helpers
 */

function findRowByFirstColumnValue_(sheet, value) {
  if (sheet.getLastRow() < 2) {
    return {
      rowNumber: -1,
      rowValues: []
    };
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]) === String(value)) {
      return {
        rowNumber: index + 2,
        rowValues: values[index]
      };
    }
  }

  return {
    rowNumber: -1,
    rowValues: []
  };
}

function findRowsWhereFirstColumnStartsWith_(sheet, prefix) {
  const matches = [];

  if (sheet.getLastRow() < 2) {
    return matches;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  values.forEach((row, index) => {
    const value = String(row[0] || '');

    if (value.startsWith(prefix)) {
      matches.push({
        rowNumber: index + 2,
        rowValues: row
      });
    }
  });

  return matches;
}

function deleteRowsWhereFirstColumnStartsWith_(sheet, prefix) {
  const maxRows = sheet.getMaxRows();

  if (maxRows < 2) return;

  const values = sheet
    .getRange(2, 1, maxRows - 1, 1)
    .getValues();

  for (let index = values.length - 1; index >= 0; index--) {
    const value = String(values[index][0] || '');

    if (value.startsWith(prefix)) {
      sheet.deleteRow(index + 2);
    }
  }
}

function getNextTestSummaryRow_(sheet) {
  if (
    typeof SummaryService !== 'undefined' &&
    typeof SummaryService.getNextSummaryAppendRow_ === 'function'
  ) {
    return SummaryService.getNextSummaryAppendRow_(sheet);
  }

  const startRow = Number(CONFIG.summary.headerRow || 2) + 1;
  const maxRows = sheet.getMaxRows();

  if (maxRows < startRow) {
    return startRow;
  }

  const values = sheet
    .getRange(startRow, 1, maxRows - startRow + 1, 1)
    .getValues();

  let lastKeyRow = startRow - 1;

  values.forEach((row, index) => {
    if (String(row[0] || '').trim()) {
      lastKeyRow = startRow + index;
    }
  });

  return Math.max(lastKeyRow + 1, startRow);
}

function getColumnIndex_(headers, headerName) {
  return headers.indexOf(headerName) + 1;
}
