/**
 * EodCoordinatorRefreshTest.js — EodReportCoordinator sheet/range refresh path:
 * single-row refresh, no appends, quantity/product tuple cell writes,
 * Missing Units protection, summary context header requirements.
 */

function getEodCoordinatorRefreshTestCases_() {
  return [
    { name: 'EOD summary context requires live header columns', fn: testEodSummaryContextRequiresLiveHeaders_, suite: 'summary' },
    { name: 'EOD lookup applied log survives stale log validation', fn: testEodLookupAppliedLogSurvivesStaleLogValidation_, suite: 'summary' },
    { name: 'Coordinator refresh processes exactly one summary row', fn: testCoordinatorRefreshProcessesOneRow_, suite: 'summary' },
    { name: 'Coordinator refresh does not append summary rows', fn: testCoordinatorRefreshDoesNotAppend_, suite: 'summary' },
    { name: 'Coordinator refresh uses current summary row values', fn: testCoordinatorRefreshUsesCurrentRowValues_, suite: 'summary' },
    { name: 'Coordinator refresh writes order quantity fields', fn: testCoordinatorRefreshWritesQuantityCells_, suite: 'summary' },
    { name: 'Coordinator refresh does not overwrite Missing Units', fn: testCoordinatorRefreshDoesNotOverwriteMissingUnits_, suite: 'summary' },
    { name: 'Coordinator refresh writes product tuple cells and B note', fn: testCoordinatorRefreshWritesProductTupleCells_, suite: 'summary' }
  ];
}

function testEodSummaryContextRequiresLiveHeaders_() {
  const sheet = buildMockMigratableSummarySheet_(
    SummaryService.getConfiguredSummaryHeaders_(),
    []
  );
  const requiredHeaders = [
    'Location',
    'C Number',
    'B Number',
    'Order Qty',
    'B Qty',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA',
    summaryRefreshHeaderForTest_(),
    summarySendEmailHeaderForTest_()
  ];

  requiredHeaders.forEach(headerName => {
    assertTruthy_(
      EodReportSummaryContextService.create(sheet, CONFIG.summary.headerRow + 1, 1)
        .getColumnIndex(headerName) > 0,
      `${headerName} should be found by live header name.`
    );
  });

  const brokenHeaders = SummaryService
    .getConfiguredSummaryHeaders_()
    .filter(header => header !== 'Product Code');
  const brokenSheet = buildMockMigratableSummarySheet_(brokenHeaders, []);

  try {
    EodReportSummaryContextService.create(brokenSheet, CONFIG.summary.headerRow + 1, 1);
    throw new Error('Expected missing Product Code to fail.');
  } catch (err) {
    assertContains_(
      String(err),
      'Required summary column not found: Product Code',
      'Missing required product columns should fail loudly.'
    );
  }
}

function testEodLookupAppliedLogSurvivesStaleLogValidation_() {
  const sheet = buildProductTupleSummarySheet_();
  const logSheet = buildMockValidationBlockingLogSheet_();
  const restoreLookups = stubCoordinatorProductTupleLookups_();
  const originalGetSheet = SheetService.getSheet_;

  SheetService.getSheet_ = sheetName => {
    assertEquals_(
      CONFIG.sheets.logSheetName,
      sheetName,
      'EOD logging should append to the configured log sheet.'
    );
    return logSheet;
  };

  try {
    EodReportCoordinator.applyToSummaryRows(
      sheet,
      Number(CONFIG.summary.headerRow || 2) + 1,
      1
    );
  } finally {
    SheetService.getSheet_ = originalGetSheet;
    restoreLookups();
  }

  assertEquals_(1, logSheet.rows.length, 'EOD lookup should write one success log row.');
  assertEquals_(
    'EOD_REPORT_LOOKUP_APPLIED',
    logSheet.rows[0][2],
    'EOD lookup success should be logged even when the log row had stale validation.'
  );
  assertContains_(
    logSheet.rows[0][5],
    'Summary rows:',
    'EOD lookup log should include row details.'
  );
  assertSummaryProductTupleWritten_(sheet, 'EOD path with logging should still write product tuple cells.');
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

function testCoordinatorRefreshWritesQuantityCells_() {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const row = new Array(headers.length).fill('');
  const rowNumber = Number(CONFIG.summary.headerRow || 2) + 1;

  row[headers.indexOf('_Key')] = TEST_PREFIX + 'REFRESH_QTY';
  row[headers.indexOf('Scanned At')] = new Date('2026-05-01T09:30:00+10:00');
  row[headers.indexOf('Order No.')] = '7654321';
  row[headers.indexOf('B Number')] = 'B1234567';

  const sheet = buildMockMigratableSummarySheet_(headers, [row]);
  const originalOutstandingLookup = OutstandingOrdersEodReportService.getLookupForDate_;
  const originalPallet = PalletAndProductByMembersEodReportService.applyToSummaryRows;

  OutstandingOrdersEodReportService.getLookupForDate_ = () => ({
    byOrderNumber: {
      7654321: {
        orderNumber: '7654321',
        orderTotalQtyOrd: 9,
        ambiguous: false,
        bNumbers: {}
      }
    },
    byOrderNumberAndBNumber: {
      '7654321::B1234567': {
        orderNumber: '7654321',
        searchCriteriaBNumber: 'B1234567',
        owner: 'ABCDE',
        customerName: 'Example Customer',
        carrierCode: 'AP',
        customerState: 'VIC',
        qtyOrdSum: 4,
        ambiguous: false,
        ambiguityReasons: [],
        rows: []
      }
    }
  });

  PalletAndProductByMembersEodReportService.applyToSummaryRows = () =>
    PalletAndProductByMembersEodReportService.createResult_();

  try {
    EodReportCoordinator.refreshSummaryRow(sheet, rowNumber);
  } finally {
    OutstandingOrdersEodReportService.getLookupForDate_ = originalOutstandingLookup;
    PalletAndProductByMembersEodReportService.applyToSummaryRows = originalPallet;
  }

  assertEquals_(9, sheet.getDataValueByHeader('Order Qty'), 'Manual Refresh EOD should write Order Qty.');
  assertEquals_(4, sheet.getDataValueByHeader('B Qty'), 'Manual Refresh EOD should write B Qty.');
}

function testCoordinatorRefreshDoesNotOverwriteMissingUnits_() {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const row = new Array(headers.length).fill('');
  const rowNumber = Number(CONFIG.summary.headerRow || 2) + 1;

  row[headers.indexOf('_Key')] = TEST_PREFIX + 'REFRESH_MISSING_UNITS';
  row[headers.indexOf('Scanned At')] = new Date('2026-05-01T09:30:00+10:00');
  row[headers.indexOf('Order No.')] = '7654321';
  row[headers.indexOf('B Number')] = 'B1234567';
  row[headers.indexOf('Missing Units')] = 2;

  const sheet = buildMockMigratableSummarySheet_(headers, [row]);
  const originalOutstandingLookup = OutstandingOrdersEodReportService.getLookupForDate_;
  const originalPallet = PalletAndProductByMembersEodReportService.applyToSummaryRows;

  OutstandingOrdersEodReportService.getLookupForDate_ = () => ({
    byOrderNumber: {
      7654321: {
        orderNumber: '7654321',
        orderTotalQtyOrd: 9,
        ambiguous: false,
        bNumbers: {}
      }
    },
    byOrderNumberAndBNumber: {
      '7654321::B1234567': {
        orderNumber: '7654321',
        searchCriteriaBNumber: 'B1234567',
        owner: 'ABCDE',
        customerName: 'Example Customer',
        carrierCode: 'AP',
        customerState: 'VIC',
        qtyOrdSum: 4,
        ambiguous: false,
        ambiguityReasons: [],
        rows: []
      }
    }
  });

  PalletAndProductByMembersEodReportService.applyToSummaryRows = () =>
    PalletAndProductByMembersEodReportService.createResult_();

  try {
    EodReportCoordinator.refreshSummaryRow(sheet, rowNumber);
  } finally {
    OutstandingOrdersEodReportService.getLookupForDate_ = originalOutstandingLookup;
    PalletAndProductByMembersEodReportService.applyToSummaryRows = originalPallet;
  }

  assertEquals_(2, sheet.getDataValueByHeader('Missing Units'), 'Manual Refresh EOD must not overwrite Missing Units.');
  assertEquals_(9, sheet.getDataValueByHeader('Order Qty'), 'Manual Refresh EOD should still write Order Qty.');
}

function testCoordinatorRefreshWritesProductTupleCells_() {
  const sheet = buildProductTupleSummarySheet_();
  const restore = stubCoordinatorProductTupleLookups_();

  try {
    EodReportCoordinator.refreshSummaryRow(
      sheet,
      Number(CONFIG.summary.headerRow || 2) + 1
    );
  } finally {
    restore();
  }

  assertSummaryProductTupleWritten_(sheet, 'Refresh should write product tuple cells.');
}
