/**
 * SummaryRefreshEditHandlerTest.js — Refresh checkbox edit handling:
 * strict edit filtering, queueing (checkbox stays checked as pending),
 * duplicate trigger avoidance, menu wiring.
 */

function getSummaryRefreshEditHandlerTestCases_() {
  return [
    { name: 'Summary refresh edit handler filters edits strictly', fn: testSummaryRefreshEditFilter_, suite: 'summary' },
    { name: 'Summary refresh edit handler queues checked rows', fn: testSummaryRefreshEditHandlerQueuesRefresh_, suite: 'summary' },
    { name: 'Summary refresh edit handler avoids duplicate worker triggers', fn: testSummaryRefreshEditHandlerAvoidsDuplicateWorkerTriggers_, suite: 'summary' },
    { name: 'Summary menu refresh item calls worker', fn: testSummaryMenuRefreshItem_, suite: 'summary' },
    { name: 'Summary refresh trigger duplicate check works', fn: testSummaryRefreshTriggerDuplicateCheck_, suite: 'summary' },
    { name: 'Daily EOD cache warmup trigger duplicate check works', fn: testDailyEodCacheWarmupTriggerDuplicateCheck_, suite: 'summary' }
  ];
}

function testSummaryRefreshEditFilter_() {
  const refreshCol = CONFIG.summary.columns.length + 1;

  assertEquals_(
    false,
    isSummaryRefreshEdit_(null),
    'Missing edit event should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      sheetName: 'Wrong Sheet',
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Wrong sheet should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol - 1,
      value: 'TRUE'
    })),
    'Wrong column should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Header row should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'FALSE'
    })),
    'Unchecked edit should be ignored.'
  );

  assertEquals_(
    false,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE',
      numRows: 2
    })),
    'Multi-row edit should be ignored.'
  );

  assertEquals_(
    true,
    isSummaryRefreshEdit_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Checked Refresh data-row edit should be accepted.'
  );

  assertEquals_(
    'refresh_eod',
    getSummaryEditRoute_(buildMockSummaryRefreshEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: refreshCol,
      value: 'TRUE'
    })),
    'Edit router should route Refresh edits.'
  );
}

function testSummaryRefreshEditHandlerQueuesRefresh_() {
  const event = buildMockSummaryRefreshEditEvent_({
    row: CONFIG.summary.headerRow + 3,
    col: CONFIG.summary.columns.length + 1,
    value: 'TRUE'
  });
  const originalRefresh = EodReportCoordinator.refreshSummaryRow;
  const originalScriptApp = ScriptApp;
  const originalLockService = LockService;
  const createdHandlers = [];

  EodReportCoordinator.refreshSummaryRow = () => {
    throw new Error('Refresh edit handler must not call one-row refresh directly.');
  };
  ScriptApp = buildMockScriptAppForTimeTrigger_([], createdHandlers);
  LockService = buildMockLockService_();

  try {
    handleSummaryRefreshEdit(event);
  } finally {
    EodReportCoordinator.refreshSummaryRow = originalRefresh;
    ScriptApp = originalScriptApp;
    LockService = originalLockService;
  }

  assertEquals_(1, createdHandlers.length, 'Checked refresh edit should schedule one worker trigger.');
  assertEquals_(
    'processPendingSummaryRefreshes',
    createdHandlers[0].handlerName,
    'Refresh edit should schedule pending worker.'
  );
  assertEquals_(undefined, event.range.valueSet, 'Refresh edit should leave checkbox checked as pending.');
}

function testSummaryRefreshEditHandlerAvoidsDuplicateWorkerTriggers_() {
  const event = buildMockSummaryRefreshEditEvent_({
    row: CONFIG.summary.headerRow + 3,
    col: CONFIG.summary.columns.length + 1,
    value: 'TRUE'
  });
  const originalScriptApp = ScriptApp;
  const originalLockService = LockService;
  const createdHandlers = [];

  ScriptApp = buildMockScriptAppForTimeTrigger_([
    { getHandlerFunction: () => 'processPendingSummaryRefreshes' }
  ], createdHandlers);
  LockService = buildMockLockService_();

  try {
    handleSummaryRefreshEdit(event);
    handleSummaryRefreshEdit(event);
  } finally {
    ScriptApp = originalScriptApp;
    LockService = originalLockService;
  }

  assertEquals_(0, createdHandlers.length, 'Repeated edits should not create duplicate worker triggers.');
  assertEquals_(undefined, event.range.valueSet, 'Duplicate scheduling should still leave checkbox pending.');
}

function testSummaryMenuRefreshItem_() {
  const calls = [];
  const ui = {
    createMenu(name) {
      calls.push({ type: 'menu', name });
      return {
        addItem(label, functionName) {
          calls.push({ type: 'item', label, functionName });
          return this;
        },
        addToUi() {
          calls.push({ type: 'addToUi' });
        }
      };
    }
  };

  addSummaryMenu_(ui);

  assertEquals_('Summary', calls[0].name, 'Custom menu should be named Summary.');
  assertEquals_('Refresh Checked Rows', calls[1].label, 'Menu should include refresh command.');
  assertEquals_(
    'processPendingSummaryRefreshes',
    calls[1].functionName,
    'Menu item should call the pending refresh worker.'
  );
}

function testSummaryRefreshTriggerDuplicateCheck_() {
  const handlerName = 'handleSummaryRefreshEdit';
  const triggers = [
    { getHandlerFunction: () => 'processPrinterEmails' },
    { getHandlerFunction: () => handlerName }
  ];

  assertEquals_(
    true,
    hasProjectTriggerForHandler_(triggers, handlerName),
    'Duplicate trigger helper should detect existing refresh trigger.'
  );

  assertEquals_(
    false,
    hasProjectTriggerForHandler_(triggers, 'missingHandler'),
    'Duplicate trigger helper should allow missing handler.'
  );
}

function testDailyEodCacheWarmupTriggerDuplicateCheck_() {
  const createdHandlers = [];
  const scriptApp = buildMockScriptAppForTimeTrigger_([], createdHandlers);

  installDailyEodCacheWarmupTrigger_({
    scriptApp
  });

  assertEquals_(1, createdHandlers.length, 'Warmup trigger installer should create one trigger.');
  assertEquals_(
    'warmTodayEodReportCache',
    createdHandlers[0].handlerName,
    'Warmup trigger should point to the warmup handler.'
  );
  assertEquals_(1, createdHandlers[0].everyDays, 'Warmup trigger should run daily.');
  assertEquals_(5, createdHandlers[0].atHour, 'Warmup trigger should run around 5am.');

  installDailyEodCacheWarmupTrigger_({
    scriptApp: buildMockScriptAppForTimeTrigger_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' },
      { getHandlerFunction: () => 'warmTodayEodReportCache' }
    ], createdHandlers)
  });

  assertEquals_(1, createdHandlers.length, 'Warmup trigger installer should avoid duplicate warmup triggers.');
  assertEquals_(
    true,
    hasProjectTriggerForHandler_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' }
    ], 'handleSummaryRefreshEdit'),
    'Summary refresh trigger helper should remain separate.'
  );
  assertEquals_(
    false,
    hasProjectTriggerForHandler_([
      { getHandlerFunction: () => 'handleSummaryRefreshEdit' }
    ], 'warmTodayEodReportCache'),
    'Summary refresh trigger should not count as a warmup trigger.'
  );
}

function buildMockSummaryRefreshEditEvent_(options) {
  const refreshCol = options.refreshCol || CONFIG.summary.columns.length + 1;
  const headers = new Array(Math.max(refreshCol, options.col || refreshCol)).fill('');

  headers[0] = '_Key';
  headers[refreshCol - 1] = summaryRefreshHeaderForTest_();

  const sheet = buildMockSummarySheet_(options.sheetName, headers);
  const range = {
    valueSet: undefined,
    getNumRows: () => options.numRows || 1,
    getNumColumns: () => options.numCols || 1,
    getSheet: () => sheet,
    getRow: () => options.row,
    getColumn: () => options.col,
    setValue(value) {
      this.valueSet = value;
    }
  };

  return {
    range,
    value: options.value
  };
}
