/**
 * EodCoordinatorDraftTest.js — EodReportCoordinator draft enrichment path
 * (in-memory Summary drafts enriched before any visible append).
 */

function getEodCoordinatorDraftTestCases_() {
  return [
    { name: 'Coordinator append enrichment writes product tuple cells and B note', fn: testCoordinatorAppendWritesProductTupleCells_, suite: 'summary' },
    { name: 'Coordinator append enrichment does not overwrite Missing Units', fn: testCoordinatorAppendDoesNotOverwriteMissingUnits_, suite: 'summary' }
  ];
}

function testCoordinatorAppendWritesProductTupleCells_() {
  const sheet = buildProductTupleSummarySheet_();
  const restore = stubCoordinatorProductTupleLookups_();

  try {
    EodReportCoordinator.applyToSummaryRows(
      sheet,
      Number(CONFIG.summary.headerRow || 2) + 1,
      1
    );
  } finally {
    restore();
  }

  assertSummaryProductTupleWritten_(sheet, 'Append EOD enrichment should write product tuple cells.');
}

function testCoordinatorAppendDoesNotOverwriteMissingUnits_() {
  const sheet = buildProductTupleSummarySheet_();
  const restore = stubCoordinatorProductTupleLookups_();

  sheet
    .getRange(
      Number(CONFIG.summary.headerRow || 2) + 1,
      sheet.getColumnByHeader('Missing Units')
    )
    .setValue(2);

  try {
    EodReportCoordinator.applyToSummaryRows(
      sheet,
      Number(CONFIG.summary.headerRow || 2) + 1,
      1
    );
  } finally {
    restore();
  }

  assertEquals_(2, sheet.getDataValueByHeader('Missing Units'), 'Append EOD enrichment must not overwrite Missing Units.');
  assertSummaryProductTupleWritten_(sheet, 'Append EOD enrichment should still write product tuple cells.');
}
