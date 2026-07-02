/**
 * ValidationPlacementTest.js — Summary schema migration and validation
 * placement: checkbox validations, product column migration, Missing Units
 * insertion, idempotency, live-header validation placement.
 */

function getValidationPlacementTestCases_() {
  return [
    { name: 'Summary setup applies Refresh checkbox validation', fn: testSummaryCheckboxValidation_, suite: 'sheet_setup' },
    { name: 'Summary setup applies Email checkbox validation', fn: testSummarySendEmailCheckboxValidation_, suite: 'sheet_setup' },
    { name: 'Summary setup migrates product columns without overwriting existing columns', fn: testSummarySetupMigratesProductColumns_, suite: 'sheet_setup' },
    { name: 'Summary setup inserts Missing Units without overwriting data', fn: testSummarySetupInsertsMissingUnits_, suite: 'sheet_setup' },
    { name: 'Summary setup migration is idempotent', fn: testSummarySetupMigrationIdempotent_, suite: 'sheet_setup' },
    { name: 'Summary setup keeps validations on live header columns', fn: testSummarySetupValidationPlacement_, suite: 'sheet_setup' }
  ];
}

function testSummaryCheckboxValidation_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const refreshHeader = summaryRefreshHeaderForTest_();
  const headers = sheet
    .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const refreshCol = getColumnIndex_(headers, refreshHeader);

  assertTruthy_(refreshCol > 0, `${refreshHeader} column missing.`);

  const rule = sheet
    .getRange(CONFIG.summary.headerRow + 1, refreshCol)
    .getDataValidation();

  assertTruthy_(rule, `${refreshHeader} data validation missing.`);
  assertEquals_(
    SpreadsheetApp.DataValidationCriteria.CHECKBOX,
    rule.getCriteriaType(),
    `${refreshHeader} should use checkbox validation.`
  );
}

function testSummarySendEmailCheckboxValidation_() {
  ensureLocalTestSetup_();

  const sheet = SheetService.getSheet_(CONFIG.summary.sheetName);
  const sendHeader = summarySendEmailHeaderForTest_();
  const headers = sheet
    .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const sendCol = getColumnIndex_(headers, sendHeader);

  assertTruthy_(sendCol > 0, `${sendHeader} column missing.`);

  const rule = sheet
    .getRange(CONFIG.summary.headerRow + 1, sendCol)
    .getDataValidation();

  assertTruthy_(rule, `${sendHeader} data validation missing.`);
  assertEquals_(
    SpreadsheetApp.DataValidationCriteria.CHECKBOX,
    rule.getCriteriaType(),
    `${sendHeader} should use checkbox validation.`
  );
}

function testSummarySetupMigratesProductColumns_() {
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  // Legacy headers verify setup migrates old deployed sheets to Refresh/Email.
  const oldHeaders = [
    '_Key',
    '*',
    'PDF',
    'Scanned At',
    'Carrier',
    'State',
    'Customer Name',
    'Member',
    'Owner',
    'Order No.',
    'Location',
    'C Number',
    'B Number',
    'Date Completed',
    'SLA',
    'Refresh EOD',
    'Send Email',
    'Notes'
  ];
  const sheet = buildMockMigratableSummarySheet_(oldHeaders, [[
    TEST_PREFIX + 'SCHEMA',
    '',
    'Open PDF',
    new Date('2026-06-01T09:00:00+10:00'),
    'AP',
    'VIC',
    'Customer',
    'MEM1',
    'OWNER1',
    '1234567',
    'A0101',
    'C123',
    'B123',
    '2026-06-02',
    1.5,
    true,
    false,
    'manual note column'
  ]]);

  sheet
    .getRange(CONFIG.summary.headerRow + 1, oldHeaders.indexOf('B Number') + 1)
    .setNote('Keep B note');

  const restoreConditionalFormatBuilder = stubConditionalFormatRuleBuilderForTest_();

  try {
    SummaryService.setupSummaryHeaders_(sheet);
    SummaryService.formatSummary_(sheet);

    const headers = sheet.getHeaderValues();
    const expectedArea = [
      'Location',
      'C Number',
      'B Number',
      'Order Qty',
      'B Qty',
      'Missing Units',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      refreshHeader,
      sendHeader,
      'Notes'
    ];
    const locationIndex = headers.indexOf('Location');

    expectedArea.forEach((header, offset) => {
      assertEquals_(
        header,
        headers[locationIndex + offset],
        `${header} should be in the migrated Summary order.`
      );
    });

    assertEquals_('B123', sheet.getDataValueByHeader('B Number'), 'B Number data must stay put.');
    assertEquals_('', sheet.getDataValueByHeader('Order Qty'), 'Inserted Order Qty should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('B Qty'), 'Inserted B Qty should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('Missing Units'), 'Inserted Missing Units should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('Product Code'), 'Inserted Product Code should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('Product Description'), 'Inserted Product Description should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('Vintage'), 'Inserted Vintage should be blank.');
    assertEquals_('', sheet.getDataValueByHeader('Bottle Size'), 'Inserted Bottle Size should be blank.');
    assertEquals_('2026-06-02', sheet.getDataValueByHeader('Date Completed'), 'Date Completed data should shift right.');
    assertEquals_(1.5, sheet.getDataValueByHeader('SLA'), 'SLA data should shift right.');
    assertEquals_(true, sheet.getDataValueByHeader(refreshHeader), `${refreshHeader} data should shift right.`);
    assertEquals_(false, sheet.getDataValueByHeader(sendHeader), `${sendHeader} data should shift right.`);
    assertEquals_('manual note column', sheet.getDataValueByHeader('Notes'), 'Later user columns must be preserved.');
    assertEquals_('Keep B note', sheet.getNoteByHeader('B Number'), 'B Number notes must stay intact.');
    assertEquals_(
      SheetService.dateNumberFormat,
      sheet.getNumberFormatByHeader('Date Completed'),
      'Date Completed should keep date formatting after migration.'
    );
    assertEquals_('0.#', sheet.getNumberFormatByHeader('SLA'), 'SLA should keep number formatting after migration.');
    assertEquals_(
      SpreadsheetApp.DataValidationCriteria.CHECKBOX,
      sheet.getValidationTypeByHeader(refreshHeader),
      `${refreshHeader} checkbox validation should be on the migrated column.`
    );
    assertEquals_(
      SpreadsheetApp.DataValidationCriteria.CHECKBOX,
      sheet.getValidationTypeByHeader(sendHeader),
      `${sendHeader} checkbox validation should be on the migrated column.`
    );

    SummaryService.setupSummaryHeaders_(sheet);
    SummaryService.formatSummary_(sheet);

    const idempotentHeaders = sheet.getHeaderValues();
    expectedArea.forEach((header, offset) => {
      assertEquals_(
        header,
        idempotentHeaders[locationIndex + offset],
        `${header} should stay in the migrated Summary order after repeated setup.`
      );
    });

    [
      'Product Code',
      'Order Qty',
      'B Qty',
      'Missing Units',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      refreshHeader,
      sendHeader
    ].forEach(header => {
      assertEquals_(
        1,
        idempotentHeaders.filter(value => value === header).length,
        `${header} should not be duplicated by repeated migration setup.`
      );
    });

    assertEquals_('2026-06-02', sheet.getDataValueByHeader('Date Completed'), 'Date Completed data should survive repeated setup.');
    assertEquals_(1.5, sheet.getDataValueByHeader('SLA'), 'SLA data should survive repeated setup.');
    assertEquals_(true, sheet.getDataValueByHeader(refreshHeader), `${refreshHeader} data should survive repeated setup.`);
    assertEquals_(false, sheet.getDataValueByHeader(sendHeader), `${sendHeader} data should survive repeated setup.`);
    assertEquals_('manual note column', sheet.getDataValueByHeader('Notes'), 'Later user columns should survive repeated setup.');
  } finally {
    restoreConditionalFormatBuilder();
  }
}

function testSummarySetupInsertsMissingUnits_() {
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  const oldHeaders = [
    '_Key',
    '*',
    'PDF',
    'Scanned At',
    'Carrier',
    'State',
    'Customer Name',
    'Member',
    'Owner',
    'Order No.',
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
    refreshHeader,
    sendHeader,
    'Notes'
  ];
  const sheet = buildMockMigratableSummarySheet_(oldHeaders, [[
    TEST_PREFIX + 'SCHEMA_MISSING_UNITS',
    '',
    'Open PDF',
    new Date('2026-06-01T09:00:00+10:00'),
    'AP',
    'VIC',
    'Customer',
    'MEM1',
    'OWNER1',
    '1234567',
    'A0101',
    'C123',
    'B123',
    12,
    4,
    'P001',
    'Existing Product',
    '2020',
    '750ML',
    '2026-06-02',
    1.5,
    true,
    false,
    'manual note column'
  ]]);
  const productCol = oldHeaders.indexOf('Product Code') + 1;
  const productRule = {
    getCriteriaType() {
      return 'PRODUCT_RULE';
    }
  };

  sheet
    .getRange(CONFIG.summary.headerRow + 1, productCol)
    .setNote('Keep product note')
    .setNumberFormat('@')
    .setDataValidation(productRule);

  SummaryService.setupSummaryHeaders_(sheet);

  assertSummaryHeaderOrder_(sheet.getHeaderValues());
  assertEquals_('', sheet.getDataValueByHeader('Missing Units'), 'Inserted Missing Units should be blank.');
  assertEquals_('P001', sheet.getDataValueByHeader('Product Code'), 'Product Code data must shift right.');
  assertEquals_('Keep product note', sheet.getNoteByHeader('Product Code'), 'Product Code note must shift right.');
  assertEquals_('@', sheet.getNumberFormatByHeader('Product Code'), 'Product Code format must shift right.');
  assertEquals_('PRODUCT_RULE', sheet.getValidationTypeByHeader('Product Code'), 'Product Code validation must shift right.');
  assertEquals_(true, sheet.getDataValueByHeader(refreshHeader), `${refreshHeader} checkbox value must shift right.`);
  assertEquals_(false, sheet.getDataValueByHeader(sendHeader), `${sendHeader} checkbox value must shift right.`);

  SummaryService.setupSummaryHeaders_(sheet);

  const headers = sheet.getHeaderValues();
  assertSummaryHeaderOrder_(headers);
  assertEquals_(
    1,
    headers.filter(value => value === 'Missing Units').length,
    'Missing Units should not be duplicated by repeated setup.'
  );
  assertEquals_('P001', sheet.getDataValueByHeader('Product Code'), 'Product Code data must survive repeated setup.');
}

function testSummarySetupMigrationIdempotent_() {
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  // Legacy headers verify repeated setup keeps migrated columns stable.
  const oldHeaders = [
    '_Key',
    '*',
    'PDF',
    'Scanned At',
    'Carrier',
    'State',
    'Customer Name',
    'Member',
    'Owner',
    'Order No.',
    'Location',
    'C Number',
    'B Number',
    'Date Completed',
    'SLA',
    'Refresh EOD',
    'Send Email'
  ];
  const sheet = buildMockMigratableSummarySheet_(oldHeaders, [[
    TEST_PREFIX + 'SCHEMA_IDEMPOTENT',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'C123',
    'B123',
    '2026-06-02',
    1,
    false,
    false
  ]]);

  SummaryService.setupSummaryHeaders_(sheet);
  SummaryService.setupSummaryHeaders_(sheet);

  const headers = sheet.getHeaderValues();

  [
    'Order Qty',
    'B Qty',
    'Missing Units',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA',
    refreshHeader,
    sendHeader
  ].forEach(header => {
    assertEquals_(
      1,
      headers.filter(value => value === header).length,
      `${header} should not be duplicated by repeated setup.`
    );
  });
}

function testSummarySetupValidationPlacement_() {
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  // Legacy headers verify validations land on the migrated Refresh/Email columns.
  const oldHeaders = [
    '_Key',
    '*',
    'PDF',
    'Scanned At',
    'Carrier',
    'State',
    'Customer Name',
    'Member',
    'Owner',
    'Order No.',
    'Location',
    'C Number',
    'B Number',
    'Date Completed',
    'SLA',
    'Refresh EOD',
    'Send Email'
  ];
  const sheet = buildMockMigratableSummarySheet_(oldHeaders, [[
    TEST_PREFIX + 'SCHEMA_VALIDATION',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'C123',
    'B123',
    '',
    '',
    false,
    false
  ]]);
  const staleDateRule = buildMockValidationRule_('STALE_DATE_COMPLETED');
  const restoreConditionalFormatBuilder = stubConditionalFormatRuleBuilderForTest_();

  try {
    SummaryService.setupSummaryHeaders_(sheet);

    [
      'Order Qty',
      'B Qty',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size'
    ].forEach(header => {
      sheet
        .getRange(CONFIG.summary.headerRow + 1, sheet.getColumnByHeader(header))
        .setDataValidation(staleDateRule);
    });

    SummaryService.formatSummary_(sheet);

    assertTruthy_(
      sheet.getValidationTypeByHeader('Date Completed'),
      'Date Completed should have date validation on its live header column.'
    );

    [
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size'
    ].forEach(header => {
      assertEquals_(
        '',
        sheet.getValidationTypeByHeader(header),
        `${header} should not keep Date Completed validation.`
      );
    });

    assertEquals_(
      SpreadsheetApp.DataValidationCriteria.CHECKBOX,
      sheet.getValidationTypeByHeader(refreshHeader),
      `${refreshHeader} checkbox validation should be placed by header.`
    );
    assertEquals_(
      SpreadsheetApp.DataValidationCriteria.CHECKBOX,
      sheet.getValidationTypeByHeader(sendHeader),
      `${sendHeader} checkbox validation should be placed by header.`
    );

    assertSummaryHeaderOrder_(sheet.getHeaderValues());
  } finally {
    restoreConditionalFormatBuilder();
  }
}

function assertSummaryHeaderOrder_(headers) {
  const expected = [
    'Location',
    'C Number',
    'B Number',
    'Order Qty',
    'B Qty',
    'Missing Units',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA',
    summaryRefreshHeaderForTest_(),
    summarySendEmailHeaderForTest_()
  ];
  const locationIndex = headers.indexOf('Location');

  assertTruthy_(locationIndex > -1, 'Location column missing from Summary headers.');

  expected.forEach((header, offset) => {
    assertEquals_(
      header,
      headers[locationIndex + offset],
      `${header} should remain in the required Summary order.`
    );
  });
}
