/**
 * SummaryDraftAppendTest.js — draft-based Summary append:
 * raw -> in-memory draft -> EOD enrichment attempt -> single visible append.
 * Rows must never appear first and then be patched by initial enrichment.
 */

function getSummaryDraftAppendTestCases_() {
  return [
    { name: 'Summary append enriches drafts before visible append', fn: testSummaryAppendEnrichesDraftsBeforeAppend_, suite: 'summary' },
    { name: 'Summary append records draft EOD blocks before append', fn: testSummaryAppendDraftBlockedNotes_, suite: 'summary' },
    { name: 'Summary append continues after one draft enrichment failure', fn: testSummaryAppendContinuesAfterDraftFailure_, suite: 'summary' },
    { name: 'Summary append live EOD path writes product tuple cells', fn: testSummaryAppendLiveEodPathWritesProductTupleCells_, suite: 'summary' }
  ];
}

function testSummaryAppendEnrichesDraftsBeforeAppend_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'DRAFT_BEFORE_APPEND';
  const ctx = buildMockAppendContext_(processingKey);
  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const originalEnrich = EodReportCoordinator.enrichSummaryDrafts;
  const originalApply = EodReportCoordinator.applyToSummaryRows;
  let enrichCalled = false;
  let sheetWasEmptyDuringEnrich = false;
  let oldSheetPathCalled = false;

  EodReportCoordinator.enrichSummaryDrafts = drafts => {
    enrichCalled = true;
    sheetWasEmptyDuringEnrich =
      findRowByFirstColumnValue_(summarySheet, processingKey).rowNumber <= 0;

    drafts.forEach(draft => {
      const productCol = draft.headers.indexOf('Product Code');

      draft.values[productCol] = 'P-DRAFT';
    });

    return drafts;
  };
  EodReportCoordinator.applyToSummaryRows = () => {
    oldSheetPathCalled = true;
  };

  try {
    SheetService.appendPartPickRow(ctx);
    SummaryService.appendMissingSummaryRows();
  } finally {
    EodReportCoordinator.enrichSummaryDrafts = originalEnrich;
    EodReportCoordinator.applyToSummaryRows = originalApply;
  }

  const find = findRowByFirstColumnValue_(summarySheet, processingKey);
  const headers = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];

  assertEquals_(true, enrichCalled, 'Summary append must call draft enrichment.');
  assertEquals_(true, sheetWasEmptyDuringEnrich, 'Summary row was visible before draft enrichment completed.');
  assertEquals_(false, oldSheetPathCalled, 'Summary append must not call sheet-based EOD enrichment.');
  assertTruthy_(find.rowNumber > 0, 'Summary row was not appended after draft enrichment.');
  assertCellDisplayValue_(
    summarySheet,
    find.rowNumber,
    headers,
    'Product Code',
    'P-DRAFT',
    'Final appended row should include draft-enriched values.'
  );
}

function testSummaryAppendDraftBlockedNotes_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'DRAFT_BLOCKED_NOTES';
  const ctx = buildMockAppendContext_(processingKey);
  const originalOutstandingLookup = OutstandingOrdersEodReportService.getLookupForDate_;
  const originalPalletLookup = PalletAndProductByMembersEodReportService.getLookupForDate_;
  const originalLogInfo = LogService.info;
  const originalLogError = LogService.error;

  OutstandingOrdersEodReportService.getLookupForDate_ = () => null;
  PalletAndProductByMembersEodReportService.getLookupForDate_ = () => null;
  LogService.info = () => {};
  LogService.error = () => {};

  try {
    SheetService.appendPartPickRow(ctx);
    SummaryService.appendMissingSummaryRows();
  } finally {
    OutstandingOrdersEodReportService.getLookupForDate_ = originalOutstandingLookup;
    PalletAndProductByMembersEodReportService.getLookupForDate_ = originalPalletLookup;
    LogService.info = originalLogInfo;
    LogService.error = originalLogError;
  }

  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const find = findRowByFirstColumnValue_(summarySheet, processingKey);
  const headers = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];
  const validationCol = getColumnIndex_(headers, CONFIG.eodReports.validation.summaryColumn);
  const validationRange = summarySheet.getRange(find.rowNumber, validationCol);
  const actualColour = validationRange.getBackgrounds()[0][0];

  assertTruthy_(find.rowNumber > 0, 'Summary row should append even when EOD reports are missing.');
  assertContains_(
    validationRange.getNote(),
    'no report found',
    'Draft EOD no-match note should be written during final append.'
  );
  assertEquals_(
    '#fff2cc',
    String(actualColour || '').trim().toLowerCase(),
    'Draft EOD no-match colour should be written during final append.'
  );
}

function testSummaryAppendContinuesAfterDraftFailure_() {
  ensureLocalTestSetup_();

  const firstKey = TEST_PREFIX + 'DRAFT_FAILURE_ONE';
  const secondKey = TEST_PREFIX + 'DRAFT_FAILURE_TWO';
  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const originalApplyDrafts = EodReportCoordinator.applyToSummaryDrafts_;
  const originalLogError = LogService.error;
  let attempts = 0;

  EodReportCoordinator.applyToSummaryDrafts_ = drafts => {
    attempts++;

    if (attempts === 1) {
      throw new Error('forced draft failure');
    }

    const draft = drafts[0];
    const productCol = draft.headers.indexOf('Product Code');

    draft.values[productCol] = 'P-SECOND';
  };
  LogService.error = () => {};

  try {
    SheetService.appendPartPickRow(buildMockAppendContext_(firstKey));
    SheetService.appendPartPickRow(buildMockAppendContext_(secondKey));
    SummaryService.appendMissingSummaryRows();
  } finally {
    EodReportCoordinator.applyToSummaryDrafts_ = originalApplyDrafts;
    LogService.error = originalLogError;
  }

  const firstFind = findRowByFirstColumnValue_(summarySheet, firstKey);
  const secondFind = findRowByFirstColumnValue_(summarySheet, secondKey);
  const headers = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];
  const validationCol = getColumnIndex_(headers, CONFIG.eodReports.validation.summaryColumn);

  assertTruthy_(firstFind.rowNumber > 0, 'Failed draft should still append with validation note.');
  assertTruthy_(secondFind.rowNumber > 0, 'A failed draft must not block later drafts.');
  assertContains_(
    summarySheet.getRange(firstFind.rowNumber, validationCol).getNote(),
    'forced draft failure',
    'Failed draft should capture enrichment failure before append.'
  );
  assertCellDisplayValue_(
    summarySheet,
    secondFind.rowNumber,
    headers,
    'Product Code',
    'P-SECOND',
    'Later draft should append with its enriched value.'
  );
}

function testSummaryAppendLiveEodPathWritesProductTupleCells_() {
  ensureLocalTestSetup_();

  const processingKey = TEST_PREFIX + 'LIVE_EOD_APPEND_PRODUCT_TUPLE';
  const ctx = buildMockAppendContext_(processingKey);
  const summarySheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const headers = summarySheet
    .getRange(CONFIG.summary.headerRow, 1, 1, summarySheet.getLastColumn())
    .getValues()[0];
  const targetRow = SummaryService.getNextSummaryAppendRow_(summarySheet);
  const staleRule = SpreadsheetApp
    .newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText('Enter a valid completed date, e.g. 13/06/2026.')
    .build();
  const staleValidationHeaders = [
    'Member',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA'
  ];
  const originalOutstandingLookup = OutstandingOrdersEodReportService.getLookupForDate_;
  const originalPalletLookup = PalletAndProductByMembersEodReportService.getLookupForDate_;
  const originalLogInfo = LogService.info;
  const originalLogError = LogService.error;
  const logs = [];
  let errorLogged = false;

  ctx.form.order_number = '7654321';
  ctx.form.b_code = '1234567';
  ctx.form.carton_number = '7654321';
  ctx.form.original_location = '';

  staleValidationHeaders.forEach(headerName => {
    const col = getColumnIndex_(headers, headerName);

    assertTruthy_(col > 0, `${headerName} column missing.`);

    summarySheet
      .getRange(targetRow, col)
      .setDataValidation(staleRule);
  });

  OutstandingOrdersEodReportService.getLookupForDate_ = () => ({
    byOrderNumber: {
      7654321: {
        orderNumber: '7654321',
        orderTotalQtyOrd: 6,
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

  PalletAndProductByMembersEodReportService.getLookupForDate_ = () =>
    buildMockPalletProductLookup_([
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      })
    ]);

  LogService.info = (status, messageId, filename, details) => {
    logs.push({ status, details });
  };
  LogService.error = () => {
    errorLogged = true;
  };

  try {
    SheetService.appendPartPickRow(ctx);
    SummaryService.appendMissingSummaryRows();
  } finally {
    OutstandingOrdersEodReportService.getLookupForDate_ = originalOutstandingLookup;
    PalletAndProductByMembersEodReportService.getLookupForDate_ = originalPalletLookup;
    LogService.info = originalLogInfo;
    LogService.error = originalLogError;
  }

  const find = findRowByFirstColumnValue_(summarySheet, processingKey);

  assertTruthy_(find.rowNumber > 0, 'Summary append did not create the live-path row.');

  assertSummaryRowProductTupleWritten_(
    summarySheet,
    find.rowNumber,
    'Summary append live EOD path should write product tuple cells.'
  );
  assertCellDisplayValue_(
    summarySheet,
    find.rowNumber,
    headers,
    'Order Qty',
    '6',
    'Summary append live EOD path should write Order Qty.'
  );
  assertCellDisplayValue_(
    summarySheet,
    find.rowNumber,
    headers,
    'B Qty',
    '4',
    'Summary append live EOD path should write B Qty.'
  );
  assertCellDisplayValue_(
    summarySheet,
    find.rowNumber,
    headers,
    'Missing Units',
    '2',
    'Summary append live EOD path should not let EOD overwrite Missing Units.'
  );
  assertCellDisplayValue_(
    summarySheet,
    find.rowNumber,
    headers,
    'Date Completed',
    '',
    'Summary append live EOD path must not write Date Completed.'
  );

  const slaCol = getColumnIndex_(headers, 'SLA');

  assertTruthy_(slaCol > 0, 'SLA column missing.');
  assertContains_(
    summarySheet.getRange(find.rowNumber, slaCol).getFormula(),
    '=IF(',
    'Summary append live EOD path should apply SLA formula.'
  );
  assertEquals_(false, errorLogged, 'Live EOD path should not log an EOD failure.');

  const appliedLog = logs.find(log => log.status === 'EOD_REPORT_LOOKUP_APPLIED');

  assertTruthy_(appliedLog, 'Live EOD path should log EOD_REPORT_LOOKUP_APPLIED.');
  assertContains_(
    appliedLog.details,
    'PALLET AND PRODUCT BY MEMBERS checked=1 filled=1',
    'Pallet/Product filled counter should match the visible written product/member cells.'
  );
}
