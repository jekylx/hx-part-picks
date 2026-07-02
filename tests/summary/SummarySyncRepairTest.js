/**
 * SummarySyncRepairTest.js — repairAppendMissingSummaryRows sync path.
 */

function getSummarySyncRepairTestCases_() {
  return [
    { name: 'Summary sync appends existing raw rows', fn: testRepairAppendMissingSummaryRows_, suite: 'summary' },
    { name: 'Summary sync ignores inflated summary last row', fn: testRepairAppendIgnoresInflatedSummaryLastRow_, suite: 'summary' }
  ];
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

  assertTruthy_(find.rowNumber > 0, 'Summary sync did not append existing raw row.');
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
      'Summary sync should append after the last nonblank summary _Key.'
    );

    assertTruthy_(
      newFind.rowNumber !== marker.rowNumber + 1,
      'Summary sync incorrectly appended after an inflated non-key row.'
    );
  } finally {
    clearInflatedSummaryLastRowMarker_(summarySheet, marker);
  }
}
