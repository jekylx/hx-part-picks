/**
 * SummaryEditRoutingService.js
 *
 * Strict routing for Summary sheet edits. handleSummaryRefreshEdit (Code.js)
 * uses getSummaryEditRoute_ to decide between the queued Refresh path and the
 * Send Email path. Edit handling stays lightweight: no long work and no lock
 * is taken while classifying the edit.
 */

function isSummaryRefreshEdit_(e) {
  return isSummaryCheckboxEditForHeader_(e, SummaryService.getRefreshEodHeader_());
}

function isSummarySendEmailEdit_(e) {
  return isSummaryCheckboxColumnEditForHeader_(e, SummaryService.getSendEmailHeader_());
}

function getSummaryEditRoute_(e) {
  if (isSummaryRefreshEdit_(e)) {
    return 'refresh_eod';
  }

  if (isSummarySendEmailEdit_(e)) {
    return 'send_email';
  }

  return '';
}

function isSummaryCheckboxEditForHeader_(e, headerName) {
  if (!isSummaryCheckboxColumnEditForHeader_(e, headerName)) {
    return false;
  }

  return isCheckedEditValue_(e.value);
}

function isSummaryCheckboxColumnEditForHeader_(e, headerName) {
  if (!e || !e.range) {
    return false;
  }

  const range = e.range;

  if (
    range.getNumRows() !== 1 ||
    range.getNumColumns() !== 1
  ) {
    return false;
  }

  const sheet = range.getSheet();

  if (!sheet || sheet.getName() !== CONFIG.summary.sheetName) {
    return false;
  }

  if (range.getRow() <= Number(CONFIG.summary.headerRow || 2)) {
    return false;
  }

  const actionColumn = getSummaryColumnIndexByHeader_(sheet, headerName);

  if (actionColumn <= 0 || range.getColumn() !== actionColumn) {
    return false;
  }

  return true;
}

function isCheckedEditValue_(value) {
  return value === true || String(value || '').toUpperCase() === 'TRUE';
}

function getSummaryColumnIndexByHeader_(sheet, headerName) {
  const headerRow = Number(CONFIG.summary.headerRow || 2);

  if (!sheet || sheet.getLastColumn() < 1) {
    return 0;
  }

  const headers = sheet
    .getRange(headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  return headers.indexOf(headerName) + 1;
}
