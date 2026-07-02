/**
 * SummaryRefreshService.js
 *
 * Queued Summary refresh worker.
 *
 * Flow:
 * - A checked Refresh checkbox edit is validated (SummaryEditRoutingService)
 *   and schedules the worker; the checkbox stays checked as "pending".
 * - processPendingSummaryRefreshes (Code.js) runs the worker under a script
 *   lock: it scans checked Refresh rows, groups contiguous rows, refreshes
 *   checked rows only, clears successful checkboxes, captures per-row/group
 *   failures, respects the execution deadline and schedules a continuation
 *   trigger when needed (never a duplicate).
 * - The Summary menu item "Refresh Checked Rows" calls the same worker.
 */

function processPendingSummaryRefreshes_(deps) {
  const services = deps || {};
  const lockService = services.lockService || LockService;
  const logger = services.logger || Logger;
  const now = services.now || (() => Date.now());
  const lock = lockService.getScriptLock();
  const stats = {
    checkedRowsFound: 0,
    rowsRefreshed: 0,
    rowsFailed: 0,
    rowsSkipped: 0,
    groupsProcessed: 0,
    continuationScheduled: false,
    deadlineHit: false
  };

  if (!lock.tryLock(1000)) {
    logPendingSummaryRefreshBatch_(logger, stats, 'lock_unavailable');
    return stats;
  }

  try {
    const spreadsheetApp = services.spreadsheetApp || SpreadsheetApp;
    const spreadsheet = spreadsheetApp.getActive();
    const sheet = spreadsheet && spreadsheet.getSheetByName(CONFIG.summary.sheetName);

    if (!sheet) {
      throw new Error(`Summary sheet not found: ${CONFIG.summary.sheetName}`);
    }

    const refreshColumn = getSummaryColumnIndexByHeader_(
      sheet,
      SummaryService.getRefreshEodHeader_()
    );

    if (refreshColumn <= 0) {
      throw new Error(`Summary Refresh column not found: ${SummaryService.getRefreshEodHeader_()}`);
    }

    const deadline = Number(services.deadline || (now() + (4.5 * 60 * 1000)));
    const checkedRows = getPendingSummaryRefreshRows_(sheet, refreshColumn);
    const groups = groupContiguousRows_(checkedRows);

    stats.checkedRowsFound = checkedRows.length;

    for (let index = 0; index < groups.length; index++) {
      if (isPendingSummaryRefreshDeadlineNear_(now, deadline)) {
        stats.deadlineHit = true;
        stats.rowsSkipped += countRowsInGroups_(groups.slice(index));
        break;
      }

      const group = groups[index];
      const groupResult = refreshPendingSummaryRefreshGroup_(
        sheet,
        refreshColumn,
        group.startRow,
        group.rowCount
      );

      stats.groupsProcessed++;
      stats.rowsRefreshed += groupResult.rowsRefreshed;
      stats.rowsFailed += groupResult.rowsFailed;

      if (
        index < groups.length - 1 &&
        isPendingSummaryRefreshDeadlineNear_(now, deadline)
      ) {
        stats.deadlineHit = true;
        stats.rowsSkipped += countRowsInGroups_(groups.slice(index + 1));
        break;
      }
    }

    if (stats.deadlineHit) {
      clearPendingSummaryRefreshTriggers_(services);
      stats.continuationScheduled = schedulePendingSummaryRefreshWorker_(
        Object.assign({}, services, { skipLock: true })
      );
    } else {
      clearPendingSummaryRefreshTriggers_(services);
    }

    logPendingSummaryRefreshBatch_(logger, stats, 'complete');

    return stats;
  } catch (err) {
    logPendingSummaryRefreshError_(err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function schedulePendingSummaryRefreshWorker_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;
  const lockService = services.lockService || LockService;
  const lock = services.skipLock ? null : lockService.getScriptLock();
  let locked = !!services.skipLock;

  if (!services.skipLock && typeof lock.tryLock === 'function') {
    locked = lock.tryLock(1000);
  } else if (!services.skipLock) {
    lock.waitLock(1000);
    locked = true;
  }

  if (!locked) {
    return false;
  }

  try {
    if (hasPendingSummaryRefreshTrigger_(services)) {
      return false;
    }

    scriptApp
      .newTrigger('processPendingSummaryRefreshes')
      .timeBased()
      .after(60 * 1000)
      .create();

    return true;
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

function clearPendingSummaryRefreshTriggers_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;
  const triggers = scriptApp.getProjectTriggers();

  (triggers || []).forEach(trigger => {
    if (
      trigger &&
      typeof trigger.getHandlerFunction === 'function' &&
      trigger.getHandlerFunction() === 'processPendingSummaryRefreshes'
    ) {
      scriptApp.deleteTrigger(trigger);
    }
  });
}

function hasPendingSummaryRefreshTrigger_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;

  return hasProjectTriggerForHandler_(
    scriptApp.getProjectTriggers(),
    'processPendingSummaryRefreshes'
  );
}

function getPendingSummaryRefreshRows_(sheet, refreshColumn) {
  const dataStartRow = Number(CONFIG.summary.headerRow || 2) + 1;
  const lastRow = sheet.getLastRow();

  if (lastRow < dataStartRow) {
    return [];
  }

  const values = sheet
    .getRange(dataStartRow, refreshColumn, lastRow - dataStartRow + 1, 1)
    .getValues();
  const rows = [];

  values.forEach((row, index) => {
    if (isCheckedEditValue_(row[0])) {
      rows.push(dataStartRow + index);
    }
  });

  return rows;
}

function groupContiguousRows_(rows) {
  const groups = [];

  (rows || []).forEach(rowNumber => {
    const last = groups[groups.length - 1];

    if (last && last.startRow + last.rowCount === rowNumber) {
      last.rowCount++;
      return;
    }

    groups.push({
      startRow: rowNumber,
      rowCount: 1
    });
  });

  return groups;
}

function refreshPendingSummaryRefreshGroup_(sheet, refreshColumn, startRow, rowCount) {
  const result = {
    rowsRefreshed: 0,
    rowsFailed: 0
  };

  try {
    EodReportCoordinator.applyToSummaryRowsOrThrow(sheet, startRow, rowCount);
    clearSummaryRefreshCheckboxes_(sheet, refreshColumn, startRow, rowCount);
    result.rowsRefreshed += rowCount;
    return result;
  } catch (err) {
    for (let offset = 0; offset < rowCount; offset++) {
      const rowNumber = startRow + offset;

      try {
        EodReportCoordinator.applyToSummaryRowsOrThrow(sheet, rowNumber, 1);
        sheet.getRange(rowNumber, refreshColumn).setValue(false);
        result.rowsRefreshed++;
      } catch (rowErr) {
        EodReportCoordinator.writeRefreshFailure_(sheet, rowNumber, rowErr);
        EodReportCoordinator.logError_('EOD_REPORT_PENDING_REFRESH_ROW_FAILED', '', rowErr);
        sheet.getRange(rowNumber, refreshColumn).setValue(false);
        result.rowsFailed++;
      }
    }
  }

  return result;
}

function clearSummaryRefreshCheckboxes_(sheet, refreshColumn, startRow, rowCount) {
  const values = new Array(rowCount).fill(null).map(() => [false]);

  sheet
    .getRange(startRow, refreshColumn, rowCount, 1)
    .setValues(values);
}

function isPendingSummaryRefreshDeadlineNear_(now, deadline) {
  return now() >= deadline - 10000;
}

function countRowsInGroups_(groups) {
  return (groups || []).reduce((total, group) => total + group.rowCount, 0);
}

function logPendingSummaryRefreshBatch_(logger, stats, status) {
  const details = [
    `status=${status}`,
    `checkedRowsFound=${stats.checkedRowsFound}`,
    `rowsRefreshed=${stats.rowsRefreshed}`,
    `rowsFailed=${stats.rowsFailed}`,
    `rowsSkipped=${stats.rowsSkipped}`,
    `groupsProcessed=${stats.groupsProcessed}`,
    `continuationScheduled=${stats.continuationScheduled}`,
    `deadlineHit=${stats.deadlineHit}`
  ].join(' ');

  if (logger && typeof logger.log === 'function') {
    logger.log(`processPendingSummaryRefreshes ${details}`);
  }
}

function logPendingSummaryRefreshError_(err) {
  if (
    typeof LogService !== 'undefined' &&
    typeof LogService.error === 'function'
  ) {
    LogService.error('EOD_REPORT_PENDING_REFRESH_FAILED', '', '', err, '');
    return;
  }

  Logger.log(`EOD_REPORT_PENDING_REFRESH_FAILED: ${err && err.stack ? err.stack : String(err)}`);
}
