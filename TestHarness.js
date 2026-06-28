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
  runTest_('Prompt contains raw extraction rules', testPromptRules_, results);
  runTest_('Sheet setup creates expected sheets', testSheetSetup_, results);
  runTest_('Raw row append keeps raw values', testAppendMockRawRow_, results);
  runTest_('Summary appends missing rows only', testSummaryAppendOnly_, results);
  runTest_('Page processing key is stable and unique', testPageProcessingKey_, results);
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

  assertEquals_('guestprint@edg.com.au', CONFIG.gmail.from, 'Incorrect printer sender.');
  assertEquals_('Message from', CONFIG.gmail.subjectContains, 'Incorrect subject matcher.');

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

  assertContains_(query, 'from:guestprint@edg.com.au', 'Gmail query missing sender.');
  assertContains_(query, 'subject:"Message from"', 'Gmail query missing subject.');
  assertContains_(query, 'has:attachment', 'Gmail query missing attachment filter.');
  assertContains_(query, 'filename:pdf', 'Gmail query missing PDF filter.');
  assertContains_(query, '-label:"PartPick/Processed"', 'Gmail query missing processed-label exclusion.');
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
    .getRange(1, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];

  const customerCol = getColumnIndex_(headers, 'Customer Name');
  const notesCol = getColumnIndex_(headers, 'Notes');

  assertTruthy_(customerCol > 0, 'Summary Customer Name column missing.');
  assertTruthy_(notesCol > 0, 'Summary Notes column missing.');

  summarySheet
    .getRange(firstFind.rowNumber, customerCol)
    .setValue('MANUAL CUSTOMER OVERRIDE');

  summarySheet
    .getRange(firstFind.rowNumber, notesCol)
    .setValue('MANUAL NOTE SHOULD STAY');

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
    'MANUAL NOTE SHOULD STAY',
    summarySheet.getRange(secondFind.rowNumber, notesCol).getValue(),
    'Summary append-only failed: manual notes were overwritten.'
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