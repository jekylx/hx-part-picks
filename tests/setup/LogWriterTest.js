/**
 * LogWriterTest.js — log writer safety: stale validation cleared before
 * append, rows/columns expanded before writes.
 */

function getLogWriterTestCases_() {
  return [
    { name: 'Log writer clears stale validation before append', fn: testLogWriterClearsStaleValidation_, suite: 'sheet_setup' },
    { name: 'Log writer expands rows before append', fn: testLogWriterExpandsRowsBeforeAppend_, suite: 'sheet_setup' },
    { name: 'Log writer expands columns before clearing validation', fn: testLogWriterExpandsColumnsBeforeClear_, suite: 'sheet_setup' }
  ];
}

function testLogWriterClearsStaleValidation_() {
  const originalGetSheet = SheetService.getSheet_;
  const logSheet = buildMockValidationBlockingLogSheet_();

  SheetService.getSheet_ = sheetName => {
    assertEquals_(
      CONFIG.sheets.logSheetName,
      sheetName,
      'Log writer should request the configured log sheet.'
    );
    return logSheet;
  };

  try {
    LogService.info('EOD_REPORT_LOOKUP_APPLIED', '', '', 'Summary rows: 40-40');
  } finally {
    SheetService.getSheet_ = originalGetSheet;
  }

  assertEquals_(1, logSheet.rows.length, 'Log writer should append one log row.');
  assertEquals_(
    'EOD_REPORT_LOOKUP_APPLIED',
    logSheet.rows[0][2],
    'Log writer should write the status after clearing stale validation.'
  );
  assertEquals_(
    true,
    logSheet.clearDataValidationsCalled,
    'Log writer should clear validations on the target log row before writing.'
  );
  assertEquals_(
    true,
    logSheet.fullRowValidationCleared,
    'Log writer should clear stale validations across the full target log row width.'
  );
}

function testLogWriterExpandsRowsBeforeAppend_() {
  const originalGetSheet = SheetService.getSheet_;
  const logSheet = buildMockValidationBlockingLogSheet_({ maxRows: 1 });
  logSheet.rows.push(['existing log row']);

  SheetService.getSheet_ = () => logSheet;

  try {
    LogService.info('EOD_REPORT_LOOKUP_APPLIED', '', '', 'Summary rows: 40-40');
  } finally {
    SheetService.getSheet_ = originalGetSheet;
  }

  assertEquals_(2, logSheet.rows.length, 'Log writer should append after existing log row.');
  assertEquals_(
    1,
    logSheet.insertedRows,
    'Log writer should expand Processing Log rows before clearing validations.'
  );
  assertEquals_(
    'EOD_REPORT_LOOKUP_APPLIED',
    logSheet.rows[1][2],
    'Log writer should write after expanding Processing Log rows.'
  );
}

function testLogWriterExpandsColumnsBeforeClear_() {
  const originalGetSheet = SheetService.getSheet_;
  const logSheet = buildMockValidationBlockingLogSheet_({
    maxColumns: 5,
    lastColumn: 5
  });

  SheetService.getSheet_ = () => logSheet;

  try {
    LogService.info('EOD_REPORT_LOOKUP_APPLIED', '', '', 'Summary rows: 40-40');
  } finally {
    SheetService.getSheet_ = originalGetSheet;
  }

  assertEquals_(1, logSheet.rows.length, 'Log writer should append one log row.');
  assertEquals_(
    2,
    logSheet.insertedColumns,
    'Log writer should expand Processing Log columns to the log row width.'
  );
  assertEquals_(
    true,
    logSheet.fullRowValidationCleared,
    'Log writer should clear validations after Processing Log columns are expanded.'
  );
  assertEquals_(
    'EOD_REPORT_LOOKUP_APPLIED',
    logSheet.rows[0][2],
    'Log writer should write after expanding Processing Log columns.'
  );
}
