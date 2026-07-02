/*
 * TEMPORARY ONE-OFF MIGRATION FILE.
 * Remove this file after product columns have been backfilled and verified.
 * Not part of normal processing.
 * Do not call from setup().
 * Do not call from processPrinterEmails().
 * Preferred order:
 * 1. oneOffBackfillProductColumnsFromBNumberNotes()
 * 2. oneOffBackfillProductColumnsViaRefresh() for rows still missing products.
 */

const ONE_OFF_PRODUCT_BACKFILL_STATE_KEY = 'ONE_OFF_PRODUCT_BACKFILL_VIA_REFRESH_STATE';
const ONE_OFF_PRODUCT_BACKFILL_TRIGGER_HANDLER = 'oneOffProductBackfillViaRefreshTrigger_';
const ONE_OFF_PRODUCT_BACKFILL_TRIGGER_AFTER_MS = 60 * 1000;
const ONE_OFF_PRODUCT_BACKFILL_DEFAULT_BATCH_SIZE = 15;
const ONE_OFF_PRODUCT_BACKFILL_TIMEOUT_BUFFER_MS = 45000;
const ONE_OFF_PRODUCT_BACKFILL_MAX_RUN_MS = 5 * 60 * 1000;
const ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS = [
  'Product Code',
  'Product Description',
  'Vintage',
  'Bottle Size'
];
const ONE_OFF_PRODUCT_BACKFILL_REQUIRED_NOTE_HEADERS = [
  'B Number',
  ...ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS
];

function oneOffBackfillProductColumnsFromBNumberNotes(options) {
  const settings = options || {};
  const ss = settings.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.summary.sheetName);

  if (!sheet) {
    throw new Error(`Summary sheet not found: ${CONFIG.summary.sheetName}`);
  }

  const headerRow = oneOffProductBackfillSummaryHeaderRow_();
  const dataStartRow = headerRow + 1;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const stats = oneOffCreateProductBackfillStats_();

  if (lastColumn < 1) {
    stats.missingHeaders = ONE_OFF_PRODUCT_BACKFILL_REQUIRED_NOTE_HEADERS.slice();
    oneOffLogProductBackfillStats_('oneOffBackfillProductColumnsFromBNumberNotes', stats);
    throw new Error(`Required summary columns missing: ${stats.missingHeaders.join(', ')}`);
  }

  const headers = sheet
    .getRange(headerRow, 1, 1, lastColumn)
    .getValues()[0];
  const headerMap = oneOffGetProductBackfillHeaderMap_(headers);

  stats.missingHeaders = headerMap.missingHeaders;

  if (stats.missingHeaders.length > 0) {
    oneOffLogProductBackfillStats_('oneOffBackfillProductColumnsFromBNumberNotes', stats);
    throw new Error(`Required summary columns missing: ${stats.missingHeaders.join(', ')}`);
  }

  if (lastRow < dataStartRow) {
    oneOffLogProductBackfillStats_('oneOffBackfillProductColumnsFromBNumberNotes', stats);
    return stats;
  }

  const rowCount = lastRow - dataStartRow + 1;
  const allValues = sheet
    .getRange(dataStartRow, 1, rowCount, lastColumn)
    .getValues();
  const bNumberNotes = sheet
    .getRange(dataStartRow, headerMap.columns['B Number'], rowCount, 1)
    .getNotes();
  const result = oneOffBuildProductBackfillFromNotes_(
    headers,
    allValues,
    bNumberNotes,
    settings
  );

  ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.forEach(headerName => {
    const col = headerMap.columns[headerName];

    sheet
      .getRange(dataStartRow, col, rowCount, 1)
      .setValues(result.productColumnValues[headerName]);
  });

  oneOffLogProductBackfillStats_(
    'oneOffBackfillProductColumnsFromBNumberNotes',
    result.stats
  );
  return result.stats;
}

function oneOffBackfillProductColumnsViaRefresh(options) {
  return oneOffContinueProductBackfillViaRefresh_(options || {});
}

function oneOffProductBackfillViaRefreshTrigger_(options) {
  return oneOffContinueProductBackfillViaRefresh_(options || {});
}

function oneOffContinueProductBackfillViaRefresh_(options) {
  const settings = options || {};
  const ss = settings.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.summary.sheetName);
  const scriptApp = settings.scriptApp || ScriptApp;

  if (!sheet) {
    throw new Error(`Summary sheet not found: ${CONFIG.summary.sheetName}`);
  }

  const headers = sheet
    .getRange(
      oneOffProductBackfillSummaryHeaderRow_(),
      1,
      1,
      Math.max(sheet.getLastColumn(), 1)
    )
    .getValues()[0];
  const headerMap = oneOffGetRefreshBackfillHeaderMap_(headers);

  if (headerMap.missingHeaders.length > 0) {
    throw new Error(`Required summary columns missing: ${headerMap.missingHeaders.join(', ')}`);
  }

  const startedAt = Date.now();
  const dataStartRow = oneOffProductBackfillSummaryHeaderRow_() + 1;
  const lastRow = sheet.getLastRow();
  let state = oneOffGetProductBackfillViaRefreshState_(settings);

  if (!state) {
    state = oneOffCreateRefreshBackfillState_(settings, sheet);
  }

  state.batchSize = oneOffRefreshBackfillBatchSize_(settings, state.batchSize);
  state.totalRows = Math.max(0, lastRow - dataStartRow + 1);

  const maxRowsThisRun = state.batchSize;
  const batchStats = oneOffCreateRefreshBatchStats_(state.nextRow);

  while (
    state.nextRow <= lastRow &&
    batchStats.rowsScanned < maxRowsThisRun &&
    Date.now() - startedAt < ONE_OFF_PRODUCT_BACKFILL_MAX_RUN_MS - ONE_OFF_PRODUCT_BACKFILL_TIMEOUT_BUFFER_MS
  ) {
    const rowNumber = state.nextRow;
    const rowValues = sheet
      .getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), 1))
      .getValues()[0];
    const rowStatus = oneOffRefreshBackfillRowStatus_(rowValues, headerMap);

    batchStats.rowsScanned++;
    state.rowsScanned++;
    state.nextRow++;

    if (rowStatus === 'no_key') {
      batchStats.rowsSkippedNoKey++;
      state.rowsSkippedNoKey++;
      continue;
    }

    if (rowStatus === 'complete') {
      batchStats.rowsSkippedComplete++;
      state.rowsSkippedComplete++;
      continue;
    }

    try {
      EodReportCoordinator.refreshSummaryRow(sheet, rowNumber);
      batchStats.rowsRefreshed++;
      state.rowsRefreshed++;
    } catch (err) {
      batchStats.rowsFailed++;
      state.rowsFailed++;
      Logger.log(
        `oneOffBackfillProductColumnsViaRefresh row ${rowNumber} failed: ${
          err && err.stack ? err.stack : String(err)
        }`
      );
    }
  }

  state.complete = state.nextRow > lastRow;
  state.totalRows = Math.max(0, lastRow - dataStartRow + 1);
  state.updatedAt = new Date().toISOString();

  let triggerScheduled = false;

  if (state.complete) {
    oneOffClearProductBackfillViaRefreshTrigger_(scriptApp);
    oneOffDeleteProductBackfillViaRefreshState_(settings);
  } else {
    oneOffSetProductBackfillViaRefreshState_(state, settings);
    triggerScheduled = oneOffScheduleNextProductBackfillViaRefresh_(scriptApp, state, settings);
  }

  const result = oneOffBuildRefreshBackfillStatus_(state);

  Logger.log(
    [
      'oneOffBackfillProductColumnsViaRefresh:',
      `rowsScanned=${batchStats.rowsScanned}`,
      `rowsRefreshed=${batchStats.rowsRefreshed}`,
      `rowsSkippedComplete=${batchStats.rowsSkippedComplete}`,
      `rowsSkippedNoKey=${batchStats.rowsSkippedNoKey}`,
      `rowsFailed=${batchStats.rowsFailed}`,
      `nextRow=${result.nextRow}`,
      `lastRow=${lastRow}`,
      `batchSize=${state.batchSize}`,
      `complete=${result.complete}`,
      `triggerScheduled=${triggerScheduled}`
    ].join(' ')
  );

  return result;
}

function oneOffResetProductBackfillViaRefreshState(options) {
  const settings = options || {};

  oneOffClearProductBackfillViaRefreshTrigger_(settings.scriptApp || ScriptApp);
  oneOffDeleteProductBackfillViaRefreshState_(settings);

  Logger.log('oneOffResetProductBackfillViaRefreshState: state and temporary triggers cleared.');
  return oneOffGetProductBackfillViaRefreshStatus(settings);
}

function oneOffGetProductBackfillViaRefreshStatus(options) {
  const settings = options || {};
  const state = oneOffGetProductBackfillViaRefreshState_(settings);
  const ss = settings.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.summary.sheetName);
  const headerRow = oneOffProductBackfillSummaryHeaderRow_();
  const lastRow = sheet ? sheet.getLastRow() : headerRow;
  const totalRows = sheet ? Math.max(0, lastRow - headerRow) : 0;

  if (!state) {
    return oneOffBuildRefreshBackfillStatus_({
      nextRow: null,
      totalRows,
      rowsScanned: 0,
      rowsRefreshed: 0,
      rowsSkippedComplete: 0,
      rowsSkippedNoKey: 0,
      rowsFailed: 0,
      complete: true,
      batchSize: null,
      startedAt: null,
      updatedAt: null
    });
  }

  state.totalRows = totalRows;
  return oneOffBuildRefreshBackfillStatus_(state);
}

function oneOffParseProductBackfillNote_(note) {
  const text = String(note || '').trim();

  if (!text) {
    return null;
  }

  const parsed = {};
  const found = {};
  const lines = text.split(/\r?\n/);

  lines.forEach(line => {
    const match = String(line || '').match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);

    if (!match) {
      return;
    }

    const label = oneOffNormalizeProductBackfillHeader_(match[1]);
    const headerName = ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.find(header =>
      oneOffNormalizeProductBackfillHeader_(header) === label
    );

    if (!headerName || found[headerName]) {
      return;
    }

    found[headerName] = true;
    parsed[headerName] = oneOffNormalizeProductBackfillNoteValue_(match[2]);
  });

  const missing = ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.filter(header => !found[header]);

  if (missing.length > 0) {
    return null;
  }

  return parsed;
}

function oneOffBuildProductBackfillFromNotes_(headers, rows, bNumberNotes, options) {
  const settings = options || {};
  const stats = oneOffCreateProductBackfillStats_();
  const headerMap = oneOffGetProductBackfillHeaderMap_(headers);

  stats.missingHeaders = headerMap.missingHeaders;

  if (stats.missingHeaders.length > 0) {
    throw new Error(`Required summary columns missing: ${stats.missingHeaders.join(', ')}`);
  }

  const outputRows = rows.map(row => row.slice());

  (rows || []).forEach((row, rowIndex) => {
    const isRealRow = oneOffIsRealSummaryRow_(row, headerMap);

    if (!isRealRow) {
      return;
    }

    stats.rowsScanned++;

    const note = bNumberNotes && bNumberNotes[rowIndex]
      ? bNumberNotes[rowIndex][0]
      : '';

    if (!String(note || '').trim()) {
      stats.skippedNoNote++;
      return;
    }

    const parsed = oneOffParseProductBackfillNote_(note);

    if (!parsed) {
      stats.skippedUnparseableNote++;
      return;
    }

    const conflict = ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.some(headerName => {
      const colIndex = headerMap.indexes[headerName];
      const existing = oneOffNormalizeProductBackfillCellValue_(row[colIndex]);
      const next = oneOffNormalizeProductBackfillCellValue_(parsed[headerName]);

      return existing && existing !== next && settings.force !== true;
    });

    if (conflict) {
      stats.skippedExistingValues++;
      return;
    }

    let changed = false;

    ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.forEach(headerName => {
      const colIndex = headerMap.indexes[headerName];
      const before = row[colIndex];
      const after = parsed[headerName] || '';

      if (settings.force === true || oneOffNormalizeProductBackfillCellValue_(before) === '') {
        if (before !== after) {
          outputRows[rowIndex][colIndex] = after;
          changed = true;
        }
      }
    });

    if (changed) {
      stats.rowsUpdated++;
    }
  });

  const productColumnValues = {};

  ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.forEach(headerName => {
    const colIndex = headerMap.indexes[headerName];
    productColumnValues[headerName] = outputRows.map(row => [row[colIndex]]);
  });

  return {
    stats,
    rows: outputRows,
    productColumnValues
  };
}

function oneOffGetProductBackfillHeaderMap_(headers) {
  const columns = {};
  const indexes = {};
  const missingHeaders = [];

  ONE_OFF_PRODUCT_BACKFILL_REQUIRED_NOTE_HEADERS.forEach(headerName => {
    const expected = oneOffNormalizeProductBackfillHeader_(headerName);
    const index = (headers || []).findIndex(header =>
      oneOffNormalizeProductBackfillHeader_(header) === expected
    );

    if (index < 0) {
      missingHeaders.push(headerName);
      return;
    }

    columns[headerName] = index + 1;
    indexes[headerName] = index;
  });

  const keyIndex = (headers || []).findIndex(header =>
    oneOffNormalizeProductBackfillHeader_(header) === oneOffNormalizeProductBackfillHeader_('_Key')
  );

  if (keyIndex >= 0) {
    columns._Key = keyIndex + 1;
    indexes._Key = keyIndex;
  }

  return {
    columns,
    indexes,
    missingHeaders
  };
}

function oneOffGetRefreshBackfillHeaderMap_(headers) {
  const map = oneOffGetProductBackfillHeaderMap_(headers);

  if (map.indexes._Key == null) {
    map.missingHeaders.push('_Key');
  }

  return map;
}

function oneOffRefreshBackfillRowStatus_(row, headerMap) {
  if (!String(row[headerMap.indexes._Key] || '').trim()) {
    return 'no_key';
  }

  const hasBlankProductField = ONE_OFF_PRODUCT_BACKFILL_PRODUCT_HEADERS.some(headerName =>
    !String(row[headerMap.indexes[headerName]] || '').trim()
  );

  return hasBlankProductField ? 'process' : 'complete';
}

function oneOffCreateProductBackfillStats_() {
  return {
    rowsScanned: 0,
    rowsUpdated: 0,
    skippedNoNote: 0,
    skippedUnparseableNote: 0,
    skippedExistingValues: 0,
    missingHeaders: []
  };
}

function oneOffIsRealSummaryRow_(row, headerMap) {
  if (headerMap.indexes._Key != null) {
    return String(row[headerMap.indexes._Key] || '').trim() !== '';
  }

  return (row || []).some(value => String(value || '').trim() !== '');
}

function oneOffNormalizeProductBackfillHeader_(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function oneOffNormalizeProductBackfillNoteValue_(value) {
  const text = String(value || '').trim();

  return text === '(blank)' ? '' : text;
}

function oneOffNormalizeProductBackfillCellValue_(value) {
  return String(value || '').trim();
}

function oneOffCreateRefreshBackfillState_(options, sheet) {
  const headerRow = oneOffProductBackfillSummaryHeaderRow_();
  const lastRow = sheet ? sheet.getLastRow() : headerRow;
  const startedAt = new Date().toISOString();

  return {
    nextRow: headerRow + 1,
    totalRows: sheet ? Math.max(0, lastRow - headerRow) : 0,
    rowsScanned: 0,
    rowsRefreshed: 0,
    rowsSkippedComplete: 0,
    rowsSkippedNoKey: 0,
    rowsFailed: 0,
    complete: sheet ? lastRow < headerRow + 1 : true,
    batchSize: oneOffRefreshBackfillBatchSize_(options || {}),
    startedAt,
    updatedAt: startedAt
  };
}

function oneOffRefreshBackfillBatchSize_(options, fallback) {
  const raw = options && options.batchSize != null ? options.batchSize : fallback;
  const parsed = Number(raw || ONE_OFF_PRODUCT_BACKFILL_DEFAULT_BATCH_SIZE);

  if (!isFinite(parsed) || parsed <= 0) {
    return ONE_OFF_PRODUCT_BACKFILL_DEFAULT_BATCH_SIZE;
  }

  return Math.max(1, Math.min(25, Math.floor(parsed)));
}

function oneOffCreateRefreshBatchStats_(nextRow) {
  return {
    rowsScanned: 0,
    rowsRefreshed: 0,
    rowsSkippedComplete: 0,
    rowsSkippedNoKey: 0,
    rowsFailed: 0,
    nextRow,
    complete: false
  };
}

function oneOffBuildRefreshBackfillStatus_(state) {
  return {
    rowsScanned: state.rowsScanned || 0,
    rowsRefreshed: state.rowsRefreshed || 0,
    rowsSkippedComplete: state.rowsSkippedComplete || 0,
    rowsSkippedNoKey: state.rowsSkippedNoKey || 0,
    rowsFailed: state.rowsFailed || 0,
    nextRow: state.nextRow == null ? null : state.nextRow,
    totalRows: state.totalRows || 0,
    complete: !!state.complete,
    batchSize: state.batchSize == null ? null : state.batchSize,
    startedAt: state.startedAt || null,
    updatedAt: state.updatedAt || null
  };
}

function oneOffGetProductBackfillViaRefreshState_(options) {
  const props = oneOffGetProductBackfillViaRefreshProperties_(options);
  const text = props.getProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY);

  return text ? JSON.parse(text) : null;
}

function oneOffSetProductBackfillViaRefreshState_(state, options) {
  oneOffGetProductBackfillViaRefreshProperties_(options)
    .setProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY, JSON.stringify(state));
}

function oneOffDeleteProductBackfillViaRefreshState_(options) {
  oneOffGetProductBackfillViaRefreshProperties_(options)
    .deleteProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY);
}

function oneOffGetProductBackfillViaRefreshProperties_(options) {
  return options && options.properties
    ? options.properties
    : PropertiesService.getScriptProperties();
}

function oneOffScheduleNextProductBackfillViaRefresh_(scriptApp, state, options) {
  oneOffClearProductBackfillViaRefreshTrigger_(scriptApp);

  const trigger = scriptApp
    .newTrigger(ONE_OFF_PRODUCT_BACKFILL_TRIGGER_HANDLER)
    .timeBased()
    .after(oneOffProductBackfillTriggerDelayMs_(options || {}))
    .create();

  if (trigger && typeof trigger.getUniqueId === 'function') {
    state.triggerUniqueId = trigger.getUniqueId();
    oneOffSetProductBackfillViaRefreshState_(state, options);
  }

  return true;
}

function oneOffClearProductBackfillViaRefreshTrigger_(scriptApp) {
  if (!scriptApp || typeof scriptApp.getProjectTriggers !== 'function') {
    return 0;
  }

  let removed = 0;

  scriptApp.getProjectTriggers().forEach(trigger => {
    if (
      trigger &&
      typeof trigger.getHandlerFunction === 'function' &&
      trigger.getHandlerFunction() === ONE_OFF_PRODUCT_BACKFILL_TRIGGER_HANDLER
    ) {
      scriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return removed;
}

function oneOffProductBackfillTriggerDelayMs_(options) {
  const value = options && options.triggerAfterMs != null
    ? Number(options.triggerAfterMs)
    : ONE_OFF_PRODUCT_BACKFILL_TRIGGER_AFTER_MS;

  return isFinite(value) && value > 0 ? Math.floor(value) : ONE_OFF_PRODUCT_BACKFILL_TRIGGER_AFTER_MS;
}

function oneOffProductBackfillSummaryHeaderRow_() {
  const row = Number(CONFIG.summary.headerRow || 2);

  return row > 0 ? row : 2;
}

function oneOffLogProductBackfillStats_(name, stats) {
  Logger.log(`${name}: ${JSON.stringify(stats)}`);
}
