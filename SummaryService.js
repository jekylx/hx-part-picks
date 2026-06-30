const SummaryService = {
  appendMissingSummaryRows() {
    // Summary is append-only. Existing summary rows may contain manual edits,
    // so this flow only adds rows for raw Processing Keys that are not already
    // present and then enriches those newly appended rows.
    const stats = this.createAppendStats_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ss.getSheetByName(CONFIG.sheets.extractedSheetName);

    if (!rawSheet) {
      stats.rawSheetFound = false;
      this.logAppendStats_(stats);
      return stats;
    }

    const summarySheet =
      ss.getSheetByName(CONFIG.summary.sheetName) ||
      ss.insertSheet(CONFIG.summary.sheetName);

    this.setupSummaryHeaders_(summarySheet);

    const rawValues = rawSheet.getDataRange().getValues();

    if (rawValues.length < 2) {
      this.formatSummary_(summarySheet);
      this.logAppendStats_(stats);
      return stats;
    }

    const rawHeaders = rawValues[0];
    stats.rawProcessingKeyHeaderFound = rawHeaders.indexOf('Processing Key') > -1;

    const rawRows = rawValues.slice(1);
    stats.rawRowsScanned = rawRows.length;

    const existingSummaryKeys = this.getExistingSummaryKeys_(summarySheet);
    stats.existingSummaryKeysFound = existingSummaryKeys.size;

    const rowsToAppend = [];

    rawRows.forEach((rawRow, index) => {
      const raw = this.rowToObject_(rawHeaders, rawRow);
      const summaryKey = this.buildSummaryKey_(raw);

      if (!summaryKey) {
        stats.skippedBlankKey += 1;
        this.recordSkippedRawRow_(stats, index + 2, 'blank Processing Key');
        return;
      }

      if (existingSummaryKeys.has(summaryKey)) {
        stats.skippedExistingKey += 1;
        this.recordSkippedRawRow_(stats, index + 2, 'Processing Key already in summary');
        return;
      }

      rowsToAppend.push(this.buildSummaryRow_(raw, summaryKey));
    });

    if (rowsToAppend.length > 0) {
      const startRow = this.getNextSummaryAppendRow_(summarySheet);

      summarySheet
        .getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length)
        .setValues(rowsToAppend);

      this.applySlaFormulas_(summarySheet, startRow, rowsToAppend.length);

      EodReportCoordinator.applyToSummaryRows(
        summarySheet,
        startRow,
        rowsToAppend.length
      );
    }

    stats.missingRowsAppended = rowsToAppend.length;

    this.formatSummary_(summarySheet);

    this.logAppendStats_(stats);

    return stats;
  },

  createAppendStats_() {
    return {
      rawSheetFound: true,
      rawProcessingKeyHeaderFound: true,
      rawRowsScanned: 0,
      existingSummaryKeysFound: 0,
      missingRowsAppended: 0,
      skippedBlankKey: 0,
      skippedExistingKey: 0,
      skippedRows: []
    };
  },

  recordSkippedRawRow_(stats, rowNumber, reason) {
    if (stats.skippedRows.length >= 10) {
      return;
    }

    stats.skippedRows.push({
      rowNumber,
      reason
    });
  },

  logAppendStats_(stats) {
    const details = [
      `rawSheetFound=${stats.rawSheetFound}`,
      `rawProcessingKeyHeaderFound=${stats.rawProcessingKeyHeaderFound}`,
      `rawRowsScanned=${stats.rawRowsScanned}`,
      `existingSummaryKeysFound=${stats.existingSummaryKeysFound}`,
      `missingRowsAppended=${stats.missingRowsAppended}`,
      `skippedBlankKey=${stats.skippedBlankKey}`,
      `skippedExistingKey=${stats.skippedExistingKey}`
    ];

    if (stats.skippedRows.length > 0) {
      details.push(`sampleSkippedRows=${JSON.stringify(stats.skippedRows)}`);
    }

    Logger.log(`SummaryService.appendMissingSummaryRows: ${details.join(', ')}`);
  },

  summaryHeaderRow_() {
    const row = Number(CONFIG.summary.headerRow || 2);

    return row > 0 ? row : 2;
  },

  summaryDataStartRow_() {
    return this.summaryHeaderRow_() + 1;
  },

  setupSummaryHeaders_(sheet) {
    const headerRow = this.summaryHeaderRow_();

    sheet.showSheet();

    this.migrateSummarySchema_(sheet);

    sheet.setFrozenRows(headerRow);
    sheet.hideColumns(1);
    this.hideOperationalEmailColumns_(sheet);
  },

  migrateSummarySchema_(sheet) {
    const configuredHeaders = this.getConfiguredSummaryHeaders_();
    const headerRow = this.summaryHeaderRow_();
    const lastColumn = sheet.getLastColumn();

    if (lastColumn < 1 || this.isSummaryHeaderRowBlank_(sheet)) {
      sheet
        .getRange(headerRow, 1, 1, configuredHeaders.length)
        .setValues([configuredHeaders]);
      return;
    }

    let headers = this.getSheetHeaders_(sheet);

    if (headers[0] !== '_Key' && headers.indexOf('_Key') === -1) {
      if (typeof sheet.insertColumnBefore === 'function') {
        sheet.insertColumnBefore(1);
      }

      sheet.getRange(headerRow, 1).setValue('_Key');
    }

    headers = this.getSheetHeaders_(sheet);

    const bNumberCol = headers.indexOf('B Number') + 1;

    if (bNumberCol <= 0) {
      throw new Error('Cannot safely migrate Summary schema because B Number header is missing.');
    }

    const protectedSequence = [
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      this.getRefreshEodHeader_(),
      this.getSendEmailHeader_()
    ];

    protectedSequence.forEach((header, index) => {
      this.placeSummaryColumn_(sheet, header, bNumberCol + index + 1);
    });
  },

  isSummaryHeaderRowBlank_(sheet) {
    const headerRow = this.summaryHeaderRow_();

    if (sheet.getLastColumn() < 1) {
      return true;
    }

    return sheet
      .getRange(headerRow, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .every(value => String(value || '').trim() === '');
  },

  placeSummaryColumn_(sheet, header, targetCol) {
    const headerRow = this.summaryHeaderRow_();
    let headers = this.getSheetHeaders_(sheet).map(value => String(value || '').trim());
    const aliases = this.getSummaryHeaderAliases_();
    const aliasHeaders = aliases[header] || [];
    let currentCol = headers.indexOf(header) + 1;

    if (currentCol <= 0) {
      for (let index = 0; index < aliasHeaders.length; index++) {
        currentCol = headers.indexOf(aliasHeaders[index]) + 1;

        if (currentCol > 0) {
          sheet.getRange(headerRow, currentCol).setValue(header);
          break;
        }
      }
    }

    if (currentCol === targetCol) {
      sheet.getRange(headerRow, targetCol).setValue(header);
      return;
    }

    if (currentCol > 0) {
      if (typeof sheet.moveColumns === 'function') {
        sheet.moveColumns(
          sheet.getRange(1, currentCol, sheet.getMaxRows(), 1),
          targetCol
        );
        sheet.getRange(headerRow, targetCol).setValue(header);
      }
      return;
    }

    if (targetCol <= sheet.getLastColumn()) {
      sheet.insertColumnBefore(targetCol);
    } else if (sheet.getLastColumn() > 0) {
      sheet.insertColumnAfter(sheet.getLastColumn());
    }

    sheet.getRange(headerRow, targetCol).setValue(header);
  },

  getSummaryHeaderAliases_() {
    // Keep old deployed sheet headers usable while moving the visible operator
    // labels to shorter Refresh/Email names.
    return {
      [this.getRefreshEodHeader_()]: ['Refresh EOD'],
      [this.getSendEmailHeader_()]: ['Send Email']
    };
  },

  getRefreshEodHeader_() {
    const checkboxColumns = CONFIG.summary.columns.filter(column =>
      column.manual === true &&
      column.type === 'checkbox'
    );

    return checkboxColumns[0] ? checkboxColumns[0].header : 'Refresh EOD';
  },

  getSendEmailHeader_() {
    const checkboxColumns = CONFIG.summary.columns.filter(column =>
      column.manual === true &&
      column.type === 'checkbox'
    );

    return checkboxColumns.length > 0
      ? checkboxColumns[checkboxColumns.length - 1].header
      : 'Send Email';
  },

  getConfiguredSummaryHeaders_() {
    return [
      '_Key',
      ...CONFIG.summary.columns.map(column => column.header)
    ];
  },

  buildSummaryRow_(raw, summaryKey) {
    const row = [summaryKey];

    CONFIG.summary.columns.forEach(column => {
      if (column.manual || column.type === 'sla') {
        // Manual and calculated summary columns are owned by the operator or
        // formulas, not by raw extraction.
        row.push('');
        return;
      }

      if (column.type === 'link') {
        const url = raw[column.source];

        row.push(
          url
            ? `=HYPERLINK("${this.escapeFormulaString_(url)}","Open PDF")`
            : ''
        );

        return;
      }

      row.push(this.getSummaryValue_(raw, column));
    });

    return row;
  },

  getSummaryValue_(raw, column) {
    const value = raw[column.source];

    // Raw Part Picks values are preserved as captured; normalisation begins
    // when values are copied into the summary/EOD workflow.
    const field = CONFIG.fields.find(configField =>
      (configField.sheetColumn || configField.label) === column.source
    );

    if (
      !field ||
      typeof NormalisationService === 'undefined' ||
      typeof NormalisationService.normalizeSummaryValue !== 'function'
    ) {
      return value || '';
    }

    return NormalisationService.normalizeSummaryValue(field.key, value);
  },

  getExistingSummaryKeys_(sheet) {
    const keys = new Set();
    const startRow = this.summaryDataStartRow_();

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
    const startRow = this.summaryDataStartRow_();
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
  },

  applySlaFormulas_(sheet, startRow, rowCount) {
    const headers = this.getSheetHeaders_(sheet);
    const slaCol = this.getSlaColumn_(headers);
    const enteredCol = this.getEnteredColumn_(headers);
    const completedCol = this.getCompletedColumn_(headers);

    if (slaCol <= 0 || enteredCol <= 0 || completedCol <= 0) {
      return;
    }

    const formulas = [];

    for (let index = 0; index < rowCount; index++) {
      const row = startRow + index;
      const enteredCell = this.a1_(row, enteredCol);
      const completedCell = this.a1_(row, completedCol);

      formulas.push([
        `=IF(${enteredCell}="","",IF(${completedCell}="",ROUND(MAX(0,(NETWORKDAYS(INT(${enteredCell}),INT(NOW()))-1)+IF(WEEKDAY(NOW(),2)<6,MOD(NOW(),1),1)-IF(WEEKDAY(${enteredCell},2)<6,MOD(${enteredCell},1),0)),1),MAX(0,NETWORKDAYS(INT(${enteredCell}),${completedCell})-1)))`
      ]);
    }

    sheet
      .getRange(startRow, slaCol, rowCount, 1)
      .setFormulas(formulas);
  },

  formatSummary_(sheet) {
    const headerRow = this.summaryHeaderRow_();
    const headers = this.getSheetHeaders_(sheet);

    if (headers.length === 0) {
      return;
    }

    sheet.showSheet();
    sheet.setFrozenRows(headerRow);

    try {
      sheet.hideColumns(1);
    } catch (err) {
      Logger.log(err);
    }

    this.hideOperationalEmailColumns_(sheet);

    sheet
      .getRange(headerRow, 1, 1, headers.length)
      .setFontWeight('bold');

    this.applySummaryNumberFormats_(sheet, headers);
    this.clearSummaryOwnedValidations_(sheet, headers);
    this.applyDateCompletedValidation_(sheet, headers);
    this.applyCheckboxValidations_(sheet, headers);
    this.applySlaConditionalFormatting_(sheet, headers);
  },

  applySummaryNumberFormats_(sheet, headers) {
    const datetimeCols = this.getConfiguredColumnIndexes_(headers, column =>
      column.type === 'datetime'
    );
    const dateCols = this.getConfiguredColumnIndexes_(headers, column =>
      column.type === 'date'
    );
    const formattedCols = {};
    const slaCol = this.getSlaColumn_(headers);
    const startRow = this.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (rowCount <= 0) {
      return;
    }

    datetimeCols.forEach(col => {
      formattedCols[col] = true;
      sheet
        .getRange(startRow, col, rowCount, 1)
        .setNumberFormat(SheetService.dateTimeNumberFormat);
    });

    dateCols.forEach(col => {
      formattedCols[col] = true;
      sheet
        .getRange(startRow, col, rowCount, 1)
        .setNumberFormat(SheetService.dateNumberFormat);
    });

    headers.forEach((header, index) => {
      const col = index + 1;

      if (formattedCols[col]) {
        return;
      }

      if (SheetService.isTimestampHeader_(header)) {
        sheet
          .getRange(startRow, col, rowCount, 1)
          .setNumberFormat(SheetService.dateTimeNumberFormat);
      } else if (SheetService.isDateOnlyHeader_(header)) {
        sheet
          .getRange(startRow, col, rowCount, 1)
          .setNumberFormat(SheetService.dateNumberFormat);
      }
    });

    if (slaCol > 0) {
      sheet
        .getRange(startRow, slaCol, rowCount, 1)
        .setNumberFormat('0.#');
    }
  },

  applyDateCompletedValidation_(sheet, headers) {
    const completedCol = this.getCompletedColumn_(headers);
    const startRow = this.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (completedCol <= 0 || rowCount <= 0) {
      return;
    }

    const rule = SpreadsheetApp
      .newDataValidation()
      .requireDate()
      .setAllowInvalid(false)
      .setHelpText('Enter a valid completed date, e.g. 13/06/2026.')
      .build();

    sheet
      .getRange(startRow, completedCol, rowCount, 1)
      .setDataValidation(rule);
  },

  clearSummaryOwnedValidations_(sheet, headers) {
    const startRow = this.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (rowCount <= 0) {
      return;
    }

    [
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      this.getRefreshEodHeader_(),
      this.getSendEmailHeader_()
    ].forEach(header => {
      const col = headers.indexOf(header) + 1;

      if (col <= 0) {
        return;
      }

      const range = sheet.getRange(startRow, col, rowCount, 1);

      if (typeof range.clearDataValidations === 'function') {
        range.clearDataValidations();
      } else {
        range.setDataValidation(null);
      }
    });
  },

  hideOperationalEmailColumns_(sheet) {
    const staleHeaders = {
      'Email Sent At': true,
      'Email Sent To': true,
      'Email Status': true,
      'Email Error': true
    };
    const headers = this.getSheetHeaders_(sheet);
    const configuredSendEmailHeader = this.getSendEmailHeader_();
    const configuredSendEmailColumn =
      this.getConfiguredSummaryHeaders_().indexOf(configuredSendEmailHeader) + 1;

    headers.forEach((header, index) => {
      const text = String(header || '').trim();
      const column = index + 1;
      const isStaleOperationalColumn = !!staleHeaders[text];
      const isDuplicateSendEmailColumn =
        text === configuredSendEmailHeader && column !== configuredSendEmailColumn;

      if (!isStaleOperationalColumn && !isDuplicateSendEmailColumn) {
        return;
      }

      try {
        sheet.hideColumns(column);
      } catch (err) {
        Logger.log(`Could not hide stale summary email column ${header}: ${err}`);
      }
    });
  },

  applyCheckboxValidations_(sheet, headers) {
    const startRow = this.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (rowCount <= 0) {
      return;
    }

    const rule = SpreadsheetApp
      .newDataValidation()
      .requireCheckbox()
      .build();

    CONFIG.summary.columns
      .filter(column => column.type === 'checkbox')
      .forEach(column => {
        const col = headers.indexOf(column.header) + 1;

        if (col <= 0) {
          return;
        }

        sheet
          .getRange(startRow, col, rowCount, 1)
          .setDataValidation(rule);
      });
  },

  applySlaConditionalFormatting_(sheet, headers) {
    const slaCol = this.getSlaColumn_(headers);
    const startRow = this.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (slaCol <= 0 || rowCount <= 0) {
      return;
    }

    const slaRange = sheet.getRange(startRow, slaCol, rowCount, 1);
    const slaLetter = this.columnLetter_(slaCol);
    const firstCell = `$${slaLetter}${startRow}`;

    const keptRules = sheet
      .getConditionalFormatRules()
      .filter(rule => {
        return !rule.getRanges().some(range =>
          range.getSheet().getName() === sheet.getName() &&
          range.getColumn() === slaCol &&
          range.getNumColumns() === 1
        );
      });

    const greenRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}<=1)`)
      .setBackground('#D9EAD3')
      .setRanges([slaRange])
      .build();

    const orangeRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}>1,${firstCell}<=2)`)
      .setBackground('#FCE5CD')
      .setRanges([slaRange])
      .build();

    const redRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}>2)`)
      .setBackground('#F4CCCC')
      .setRanges([slaRange])
      .build();

    sheet.setConditionalFormatRules([
      ...keptRules,
      greenRule,
      orangeRule,
      redRule
    ]);
  },

  getEnteredColumn_(headers) {
    return this.getConfiguredColumnIndex_(headers, column =>
      column.type === 'datetime'
    );
  },

  getCompletedColumn_(headers) {
    return this.getConfiguredColumnIndex_(headers, column =>
      column.manual === true &&
      column.type === 'date'
    );
  },

  getSlaColumn_(headers) {
    return this.getConfiguredColumnIndex_(headers, column =>
      column.type === 'sla'
    );
  },

  getConfiguredColumnIndex_(headers, matcher) {
    const column = CONFIG.summary.columns.find(matcher);

    if (!column) {
      return 0;
    }

    return headers.indexOf(column.header) + 1;
  },

  getConfiguredColumnIndexes_(headers, matcher) {
    return CONFIG.summary.columns
      .filter(matcher)
      .map(column => headers.indexOf(column.header) + 1)
      .filter(col => col > 0);
  },

  getSheetHeaders_(sheet) {
    if (sheet.getLastColumn() < 1) {
      return [];
    }

    return sheet
      .getRange(this.summaryHeaderRow_(), 1, 1, sheet.getLastColumn())
      .getValues()[0];
  },

  rowToObject_(headers, row) {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  },

  buildSummaryKey_(raw) {
    return raw['Processing Key'] || '';
  },

  escapeFormulaString_(value) {
    return String(value).replace(/"/g, '""');
  },

  a1_(row, col) {
    return `${this.columnLetter_(col)}${row}`;
  },

  columnLetter_(col) {
    let letter = '';

    while (col > 0) {
      const temp = (col - 1) % 26;

      letter = String.fromCharCode(temp + 65) + letter;
      col = Math.floor((col - temp - 1) / 26);
    }

    return letter;
  }
};
