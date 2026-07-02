/**
 * SummarySlaTest.js — SLA formulas must write only the SLA column
 * (never into or past stale Date Completed validation).
 */

function getSummarySlaTestCases_() {
  return [
    { name: 'Summary SLA formulas write only SLA column', fn: testSummaryApplySlaFormulasWritesOnlySlaColumn_, suite: 'summary' }
  ];
}

function testSummaryApplySlaFormulasWritesOnlySlaColumn_() {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const row = headers.map(header => {
    const values = {
      '_Key': TEST_PREFIX + 'SLA_ONLY',
      'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
      'Order No.': '7654321',
      'B Number': 'B1234567',
      'Missing Units': 2,
      'Date Completed': '2026-06-02',
      'SLA': 'old'
    };

    return Object.prototype.hasOwnProperty.call(values, header)
      ? values[header]
      : '';
  });
  const sheet = buildMockMigratableSummarySheet_(headers, [row]);
  const rowNumber = Number(CONFIG.summary.headerRow || 2) + 1;
  const before = sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];
  const staleDateRule = buildMockValidationRule_('STALE_DATE_COMPLETED');
  const dateCompletedCol = sheet.getColumnByHeader('Date Completed');
  const slaCol = sheet.getColumnByHeader('SLA');

  sheet
    .getRange(rowNumber, dateCompletedCol)
    .setDataValidation(staleDateRule);
  sheet
    .getRange(rowNumber, slaCol)
    .setDataValidation(staleDateRule);

  SummaryService.applySlaFormulas_(sheet, rowNumber, 1);

  const after = sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];

  headers.forEach((header, index) => {
    if (header === 'SLA') {
      assertContains_(after[index], '=IF(', 'SLA should receive the SLA formula.');
      return;
    }

    assertEquals_(
      before[index],
      after[index],
      `${header} should not be changed while applying SLA formulas.`
    );
  });

  assertEquals_(
    '2026-06-02',
    sheet.getDataValueByHeader('Date Completed'),
    'Date Completed value must not be written by SLA formula application.'
  );
  assertEquals_(
    'STALE_DATE_COMPLETED',
    sheet.getValidationTypeByHeader('Date Completed'),
    'Date Completed validation must remain untouched.'
  );
  assertEquals_(
    '',
    sheet.getValidationTypeByHeader('SLA'),
    'Only the SLA target validation should be cleared before formulas are written.'
  );
  assertEquals_(2, sheet.getDataValueByHeader('Missing Units'), 'Missing Units must stay untouched.');
}
