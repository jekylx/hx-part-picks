/**
 * PendingSummaryRefreshWorkerTest.js — processPendingSummaryRefreshes worker:
 * scans checked rows, groups contiguous rows, refreshes checked rows only,
 * clears successes, deadline continuation, per-row failure handling.
 */

function getPendingSummaryRefreshWorkerTestCases_() {
  return [
    { name: 'Summary pending refresh worker scans checked rows', fn: testPendingSummaryRefreshWorkerScansCheckedRows_, suite: 'summary' },
    { name: 'Summary pending refresh worker refreshes checked rows only', fn: testPendingSummaryRefreshWorkerRefreshesCheckedOnly_, suite: 'summary' },
    { name: 'Summary pending refresh worker skips unchecked gaps', fn: testPendingSummaryRefreshWorkerSkipsUncheckedGaps_, suite: 'summary' },
    { name: 'Summary pending refresh worker clears success checkboxes', fn: testPendingSummaryRefreshWorkerClearsSuccess_, suite: 'summary' },
    { name: 'Summary pending refresh worker resumes at deadline', fn: testPendingSummaryRefreshWorkerDeadlineContinuation_, suite: 'summary' },
    { name: 'Summary pending refresh worker clears triggers when complete', fn: testPendingSummaryRefreshWorkerClearsTriggersOnComplete_, suite: 'summary' },
    { name: 'Summary pending refresh worker continues after row failure', fn: testPendingSummaryRefreshWorkerContinuesAfterFailure_, suite: 'summary' }
  ];
}

function testPendingSummaryRefreshWorkerScansCheckedRows_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, false, 'TRUE', false]
  });

  withMockPendingSummaryRefreshApply_(calls => {
    const stats = processPendingSummaryRefreshes_(env.deps);

    assertEquals_(2, stats.checkedRowsFound, 'Worker should count checked Refresh rows.');
    assertEquals_(2, calls.length, 'Non-contiguous checked rows should be processed separately.');
  });
}

function testPendingSummaryRefreshWorkerRefreshesCheckedOnly_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, true, false]
  });

  withMockPendingSummaryRefreshApply_(calls => {
    const stats = processPendingSummaryRefreshes_(env.deps);

    assertEquals_(1, calls.length, 'Contiguous checked rows should be one group.');
    assertEquals_(CONFIG.summary.headerRow + 1, calls[0].startRow, 'Worker should start at first checked row.');
    assertEquals_(2, calls[0].rowCount, 'Worker should refresh only checked contiguous rows.');
    assertEquals_(2, stats.rowsRefreshed, 'Worker should report refreshed rows.');
  });
}

function testPendingSummaryRefreshWorkerSkipsUncheckedGaps_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, false, true]
  });

  withMockPendingSummaryRefreshApply_(calls => {
    processPendingSummaryRefreshes_(env.deps);

    assertEquals_(2, calls.length, 'Unchecked row between checked rows must split groups.');
    assertEquals_(CONFIG.summary.headerRow + 1, calls[0].startRow, 'First group row mismatch.');
    assertEquals_(1, calls[0].rowCount, 'First group should contain one checked row.');
    assertEquals_(CONFIG.summary.headerRow + 3, calls[1].startRow, 'Second group should skip unchecked row.');
    assertEquals_(1, calls[1].rowCount, 'Second group should contain one checked row.');
  });
}

function testPendingSummaryRefreshWorkerClearsSuccess_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, true]
  });

  withMockPendingSummaryRefreshApply_(() => {
    processPendingSummaryRefreshes_(env.deps);
  });

  assertEquals_(false, env.getRefreshValue(0), 'Successful row 1 should be unchecked.');
  assertEquals_(false, env.getRefreshValue(1), 'Successful row 2 should be unchecked.');
}

function testPendingSummaryRefreshWorkerDeadlineContinuation_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, false, true],
    nowValues: [0, 100000]
  });

  withMockPendingSummaryRefreshApply_(calls => {
    const stats = processPendingSummaryRefreshes_(
      Object.assign({}, env.deps, { deadline: 20000 })
    );

    assertEquals_(1, calls.length, 'Worker should process one checked group before stopping.');
    assertEquals_(true, stats.deadlineHit, 'Worker should stop when deadline is near.');
    assertEquals_(true, stats.continuationScheduled, 'Worker should schedule continuation.');
    assertEquals_(1, stats.rowsSkipped, 'Worker should leave remaining checked rows pending.');
  });

  assertEquals_(false, env.getRefreshValue(0), 'Processed row should be unchecked.');
  assertEquals_(true, env.getRefreshValue(2), 'Unprocessed row should remain checked.');
  assertEquals_(1, env.createdHandlers.length, 'Exactly one continuation trigger should be created.');
}

function testPendingSummaryRefreshWorkerClearsTriggersOnComplete_() {
  const trigger = { getHandlerFunction: () => 'processPendingSummaryRefreshes' };
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true],
    triggers: [trigger]
  });

  withMockPendingSummaryRefreshApply_(() => {
    const stats = processPendingSummaryRefreshes_(env.deps);

    assertEquals_(false, stats.deadlineHit, 'Complete worker should not hit deadline.');
  });

  assertEquals_(1, env.deletedTriggers.length, 'Complete worker should delete temporary trigger.');
  assertEquals_(trigger, env.deletedTriggers[0], 'Worker should delete pending refresh trigger.');
}

function testPendingSummaryRefreshWorkerContinuesAfterFailure_() {
  const env = buildPendingSummaryRefreshWorkerEnv_({
    refreshValues: [true, true, true]
  });
  const originalFailureWriter = EodReportCoordinator.writeRefreshFailure_;
  const failureRows = [];

  EodReportCoordinator.writeRefreshFailure_ = (sheet, rowNumber, err) => {
    failureRows.push({ sheet, rowNumber, err });
  };

  try {
    withMockPendingSummaryRefreshApply_(calls => {
      calls.failGroups = { [`${CONFIG.summary.headerRow + 1}:3`]: true };
      calls.failRows = { [CONFIG.summary.headerRow + 2]: true };

      const stats = processPendingSummaryRefreshes_(env.deps);

      assertEquals_(2, stats.rowsRefreshed, 'Worker should continue refreshing after a bad row.');
      assertEquals_(1, stats.rowsFailed, 'Worker should count failed row.');
      assertEquals_(4, calls.length, 'Worker should retry failed group row-by-row.');
    });
  } finally {
    EodReportCoordinator.writeRefreshFailure_ = originalFailureWriter;
  }

  assertEquals_(1, failureRows.length, 'Worker should write one failure note.');
  assertEquals_(CONFIG.summary.headerRow + 2, failureRows[0].rowNumber, 'Failure note should target bad row.');
  assertEquals_(false, env.getRefreshValue(0), 'Successful row before failure should be unchecked.');
  assertEquals_(false, env.getRefreshValue(1), 'Failed handled row should be unchecked.');
  assertEquals_(false, env.getRefreshValue(2), 'Successful row after failure should be unchecked.');
}

function buildPendingSummaryRefreshWorkerEnv_(options) {
  const settings = options || {};
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const refreshHeader = summaryRefreshHeaderForTest_();
  const refreshCol = headers.indexOf(refreshHeader) + 1;
  const dataRows = (settings.refreshValues || []).map((value, index) => {
    const row = new Array(headers.length).fill('');

    row[0] = `TEST::PENDING-REFRESH-${index + 1}`;
    row[refreshCol - 1] = value;

    return row;
  });
  const sheet = buildMockMigratableSummarySheet_(headers, dataRows);
  const createdHandlers = [];
  const scriptApp = buildMockScriptAppForTimeTrigger_(
    settings.triggers || [],
    createdHandlers
  );
  const nowValues = (settings.nowValues || [0]).slice();
  const logger = { entries: [], log(message) { this.entries.push(message); } };
  const deps = {
    spreadsheetApp: {
      getActive() {
        return {
          getSheetByName(name) {
            return name === CONFIG.summary.sheetName ? sheet : null;
          }
        };
      }
    },
    lockService: buildMockLockService_(settings.lock || {}),
    scriptApp,
    logger,
    now() {
      return nowValues.length > 1 ? nowValues.shift() : nowValues[0];
    }
  };

  return {
    sheet,
    deps,
    createdHandlers,
    deletedTriggers: scriptApp.deletedTriggers,
    logger,
    getRefreshValue(index) {
      return sheet
        .getRange(CONFIG.summary.headerRow + 1 + index, refreshCol)
        .getValue();
    }
  };
}

function withMockPendingSummaryRefreshApply_(fn) {
  const originalApply = EodReportCoordinator.applyToSummaryRowsOrThrow;
  const calls = [];

  EodReportCoordinator.applyToSummaryRowsOrThrow = (sheet, startRow, rowCount) => {
    calls.push({ sheet, startRow, rowCount });

    if (calls.failGroups && calls.failGroups[`${startRow}:${rowCount}`]) {
      throw new Error(`forced group failure ${startRow}:${rowCount}`);
    }

    if (rowCount === 1 && calls.failRows && calls.failRows[startRow]) {
      throw new Error(`forced row failure ${startRow}`);
    }
  };

  try {
    return fn(calls);
  } finally {
    EodReportCoordinator.applyToSummaryRowsOrThrow = originalApply;
  }
}
