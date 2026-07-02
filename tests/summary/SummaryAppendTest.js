/**
 * SummaryAppendTest.js — append-only Summary behaviour on the real test
 * spreadsheet: raw values kept, inflated last row ignored, missing rows only,
 * timestamp values/format preserved.
 */

function getSummaryAppendTestCases_() {
  return [
    { name: 'Raw row append keeps raw values', fn: testAppendMockRawRow_, suite: 'summary' },
    { name: 'Summary append ignores inflated last row', fn: testSummaryAppendIgnoresInflatedLastRow_, suite: 'summary' },
    { name: 'Summary appends missing rows only', fn: testSummaryAppendOnly_, suite: 'summary' },
    { name: 'Summary append preserves timestamp values and display format', fn: testSummaryAppendPreservesTimestampValueAndFormat_, suite: 'summary' }
  ];
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
