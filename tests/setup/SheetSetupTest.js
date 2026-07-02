/**
 * SheetSetupTest.js — setup() creates expected sheets and applies
 * timestamp/date-only number formats.
 */

function getSheetSetupTestCases_() {
  return [
    { name: 'Sheet setup creates expected sheets', fn: testSheetSetup_, suite: 'sheet_setup' },
    { name: 'Sheet setup protects implementation sheets', fn: testSheetSetupProtectsImplementationSheets_, suite: 'sheet_setup' },
    { name: 'Sheet setup formats Processed At as timestamp', fn: testSheetSetupFormatsProcessedAtTimestamp_, suite: 'sheet_setup' },
    { name: 'Sheet setup formats Email Received At as timestamp', fn: testSheetSetupFormatsEmailReceivedAtTimestamp_, suite: 'sheet_setup' },
    { name: 'Sheet setup keeps raw form dates date-only', fn: testSheetSetupKeepsFormDatesDateOnly_, suite: 'sheet_setup' }
  ];
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
