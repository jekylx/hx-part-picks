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

function runLocalTests() {
  const results = [];

  cleanupTestRows();

  runTest_('Config has required blocks', testConfigHasRequiredBlocks_, results);
  runTest_('Gmail query is correct', testGmailQuery_, results);
  runTest_('Order number normalisation accepts variable length', testOrderNumberNormalisation_, results);
  runTest_('Outstanding Orders order parsing accepts variable length', testOutstandingOrdersOrderParsing_, results);
  runTest_('EOD strict carrier/state validation helpers work', testEodStrictValidationHelpers_, results);
  runTest_('Outstanding Orders customer correction requires B owner confirmation', testOutstandingOrdersCustomerOwnerGate_, results);
  runTest_('Outstanding Orders blocks customer correction without B owner confirmation', testOutstandingOrdersCustomerOwnerGateBlocks_, results);
  runTest_('Outstanding Orders guards carrier and state corrections', testOutstandingOrdersCarrierStateGuards_, results);
  runTest_('Prompt contains raw extraction rules', testPromptRules_, results);
  runTest_('Sheet setup creates expected sheets', testSheetSetup_, results);
  runTest_('Raw row append keeps raw values', testAppendMockRawRow_, results);
  runTest_('Summary appends missing rows only', testSummaryAppendOnly_, results);
  runTest_('Batch and page processing keys are stable and unique', testPageProcessingKey_, results);
  runTest_('Legacy page key does not skip whole batch', testLegacyPageKeyDoesNotSkipBatch_, results);
  runTest_('PDF processor health endpoint works', testPdfProcessorHealth_, results);

  writeTestResults_(results);

  const failed = results.filter(result => result.status === 'FAIL');

  if (failed.length > 0) {
    throw new Error(`${failed.length} test(s) failed. Check "${TEST_RESULTS_SHEET_NAME}" sheet.`);
  }

  Logger.log(`All ${results.length} local tests passed.`);
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
  setup();

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
    '1400385',
    NormalisationService.normalizeOrderNumber_('140O385'),
    'Order number should apply OCR-safe digit cleanup.'
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
    null,
    NormalisationService.normalizeOrderNumber_(''),
    'Blank order number should be invalid.'
  );

  assertEquals_(
    null,
    NormalisationService.normalizeOrderNumber_('ABC'),
    'Order number with no digits should be invalid.'
  );
}

function testOutstandingOrdersOrderParsing_() {
  let parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABC121234567');

  assertEquals_('ABC12', parsed.owner, 'Owner with digits should remain valid.');
  assertEquals_('1234567', parsed.orderNumber, 'Seven digit order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE123');

  assertEquals_('ABCDE', parsed.owner, 'Letter owner should parse.');
  assertEquals_('123', parsed.orderNumber, 'Short order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE1234567890');

  assertEquals_('ABCDE', parsed.owner, 'Long order owner should parse.');
  assertEquals_('1234567890', parsed.orderNumber, 'Long order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('AB12');

  assertEquals_('', parsed.owner, 'Short owner should be invalid.');
  assertEquals_('', parsed.orderNumber, 'Short value should have no order after owner.');
}

function testEodStrictValidationHelpers_() {
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

  ['AUSPOST', 'AUSTRALIA POST', 'NEXDAY', ''].forEach(carrier => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidCarrier(carrier),
      `Carrier should be invalid: ${carrier}`
    );
  });

  ['NSW', 'VIC', 'ACT', 'WA', 'TAS', 'NT', 'QLD', 'SA'].forEach(state => {
    assertTruthy_(
      EodReportNormalisationService.isValidState(state),
      `State should be valid: ${state}`
    );
  });

  ['AUS', 'NZ', ''].forEach(state => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidState(state),
      `State should be invalid: ${state}`
    );
  });
}

function testOutstandingOrdersCustomerOwnerGate_() {
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
      'New Customer',
      outcome.context.values['Customer Name'],
      'Customer Name should be corrected when B owner confirms order owner.'
    );

    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'corrected Customer Name',
      'Customer correction should add a correction note.'
    );
  } finally {
    restore();
  }
}

function testOutstandingOrdersCustomerOwnerGateBlocks_() {
  let restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234567: [
        { owner: 'VWXYZ' }
      ]
    }
  });

  try {
    let outcome = runOutstandingOrdersRowTest_({
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
      'Old Customer',
      outcome.context.values['Customer Name'],
      'Customer Name should stay unchanged when B owner mismatches.'
    );

    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'does not match B Number owner VWXYZ',
      'Owner mismatch should add a blocked-correction note.'
    );
  } finally {
    restore();
  }

  restore = stubPalletLookupForTest_(null);

  try {
    let outcome = runOutstandingOrdersRowTest_({
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
      'Old Customer',
      outcome.context.values['Customer Name'],
      'Customer Name should stay unchanged when Pallet/Product lookup is missing.'
    );

    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'B Number owner could not confirm order owner',
      'Missing owner confirmation should add a blocked-correction note.'
    );
  } finally {
    restore();
  }

  restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234567: [
        { owner: 'ABCDE' },
        { owner: 'VWXYZ' }
      ]
    }
  });

  try {
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
      'Old Customer',
      outcome.context.values['Customer Name'],
      'Customer Name should stay unchanged when B owner is ambiguous.'
    );

    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'B Number owner could not confirm order owner',
      'Ambiguous owner confirmation should add a blocked-correction note.'
    );
  } finally {
    restore();
  }
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
  setup();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  [
    CONFIG.sheets.extractedSheetName,
    CONFIG.summary.sheetName,
    CONFIG.sheets.logSheetName,
    CONFIG.sheets.processedSheetName,
    CONFIG.sheets.configSheetName
  ].forEach(sheetName => {
    assertTruthy_(ss.getSheetByName(sheetName), `Missing sheet: ${sheetName}`);
  });
}

function testAppendMockRawRow_() {
  setup();

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

function testSummaryAppendOnly_() {
  setup();

  const processingKey = TEST_PREFIX + 'SUMMARY_APPEND_ONLY';
  const ctx = buildMockAppendContext_(processingKey);

  SheetService.appendPartPickRow(ctx);
  SummaryService.appendMissingSummaryRows();

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

  SummaryService.appendMissingSummaryRows();

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
    picker: 'Louise',
    order_number: '140O385',
    customer_name: 'Andrew Viner',
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

function runOutstandingOrdersRowTest_(options) {
  const match = options.match;
  const context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': match.orderNumber,
    'Customer Name': options.customerName,
    'Carrier': options.carrier,
    'State': options.state,
    'B Number': options.bNumber || 'B1234567'
  });

  const validationRows = EodReportValidationService.create(1);
  const result = OutstandingOrdersEodReportService.createResult_();
  const lookup = {
    byOrderNumber: {}
  };

  lookup.byOrderNumber[match.orderNumber] = [match];

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
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  const values = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues();

  for (let index = values.length - 1; index >= 0; index--) {
    const value = String(values[index][0] || '');

    if (value.startsWith(prefix)) {
      sheet.deleteRow(index + 2);
    }
  }
}

function getColumnIndex_(headers, headerName) {
  return headers.indexOf(headerName) + 1;
}
