/**
 * SummaryAppendWriterService.js
 *
 * Writes final Summary drafts to the sheet in one visible append:
 * - expands capacity first,
 * - writes only writable columns (never Date Completed / SLA / checkbox /
 *   Notes columns) in contiguous column groups with validations cleared,
 * - writes notes/backgrounds sparsely (only columns that actually have any).
 *
 * Also owns append placement: existing keys and the next append row.
 */

const SummaryAppendWriterService = {
  appendFinalSummaryDrafts_(sheet, startRow, headers, drafts) {
    if (!drafts || drafts.length === 0) {
      return;
    }

    this.ensureSummaryAppendCapacity_(
      sheet,
      startRow,
      drafts.length,
      headers.length
    );

    const rowsToAppend = drafts.map(draft => draft.values);

    this.writeFinalSummaryRows_(
      sheet,
      startRow,
      headers,
      rowsToAppend
    );

    this.writeDraftNotesAndBackgrounds_(sheet, startRow, headers, drafts);
  },

  writeFinalSummaryRows_(sheet, startRow, headers, rowsToAppend) {
    if (!rowsToAppend || rowsToAppend.length === 0) {
      return;
    }

    const writableColumns = this.getFinalAppendWritableColumns_(
      headers,
      rowsToAppend[0].length
    );
    const groups = [];

    writableColumns.forEach(col => {
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.endCol + 1 === col) {
        lastGroup.endCol = col;
        return;
      }

      groups.push({ startCol: col, endCol: col });
    });

    groups.forEach(group => {
      const width = group.endCol - group.startCol + 1;
      const values = rowsToAppend.map(row =>
        row.slice(group.startCol - 1, group.endCol)
      );
      const range = sheet.getRange(
        startRow,
        group.startCol,
        rowsToAppend.length,
        width
      );

      if (typeof range.clearDataValidations === 'function') {
        range.clearDataValidations();
      } else {
        range.setDataValidation(null);
      }

      range.setValues(values);
    });
  },

  writeDraftNotesAndBackgrounds_(sheet, startRow, headers, drafts) {
    headers.forEach((header, index) => {
      const notes = drafts.map(draft => [draft.notes[index] || '']);
      const backgrounds = drafts.map(draft => [draft.backgrounds[index] || '']);
      const shouldWriteNotes = notes.some(row => row[0]);
      const shouldWriteBackgrounds = backgrounds.some(row => row[0]);

      if (!shouldWriteNotes && !shouldWriteBackgrounds) {
        return;
      }

      const range = sheet.getRange(startRow, index + 1, drafts.length, 1);

      if (shouldWriteNotes) {
        range.setNotes(notes);
      }

      if (shouldWriteBackgrounds) {
        range.setBackgrounds(backgrounds);
      }
    });
  },

  ensureSummaryAppendCapacity_(sheet, startRow, rowCount, columnCount) {
    const requiredRows = startRow + rowCount - 1;

    if (
      typeof sheet.getMaxRows === 'function' &&
      typeof sheet.insertRowsAfter === 'function' &&
      sheet.getMaxRows() < requiredRows
    ) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
    }

    if (
      typeof sheet.getMaxColumns === 'function' &&
      typeof sheet.insertColumnsAfter === 'function' &&
      sheet.getMaxColumns() < columnCount
    ) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        columnCount - sheet.getMaxColumns()
      );
    }
  },

  getFinalAppendWritableColumns_(headers, rowWidth) {
    const blockedHeaders = {};

    [
      'Date Completed',
      'SLA',
      SummarySchemaService.getRefreshEodHeader_(),
      SummarySchemaService.getSendEmailHeader_(),
      'Notes'
    ].forEach(header => {
      blockedHeaders[header] = true;
    });

    return headers
      .map((header, index) => {
        const col = index + 1;

        if (col > rowWidth || blockedHeaders[header]) {
          return 0;
        }

        return col;
      })
      .filter(col => col > 0);
  },

  getExistingSummaryKeys_(sheet) {
    const keys = new Set();
    const startRow = SummarySchemaService.summaryDataStartRow_();

    if (sheet.getLastRow() < startRow) {
      return keys;
    }

    const values = sheet
      .getRange(startRow, 1, sheet.getLastRow() - startRow + 1, 1)
      .getValues();

    values.forEach(row => {
      const key = row[0];

      if (key) {
        keys.add(String(key));
      }
    });

    return keys;
  },

  getNextSummaryAppendRow_(sheet) {
    const startRow = SummarySchemaService.summaryDataStartRow_();
    const maxRows = sheet.getMaxRows();

    if (maxRows < startRow) {
      return startRow;
    }

    const values = sheet
      .getRange(startRow, 1, maxRows - startRow + 1, 1)
      .getValues();

    let lastKeyRow = startRow - 1;

    values.forEach((row, index) => {
      if (String(row[0] || '').trim()) {
        lastKeyRow = startRow + index;
      }
    });

    return Math.max(lastKeyRow + 1, startRow);
  }
};
