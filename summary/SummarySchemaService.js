/**
 * SummarySchemaService.js
 *
 * Summary sheet schema: header row placement, configured headers, schema
 * migration (column placement without overwriting data) and header/column
 * lookups shared by the other summary services.
 */

const SummarySchemaService = {
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
    SummaryFormatService.hideOperationalEmailColumns_(sheet);
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
      'Order Qty',
      'B Qty',
      'Missing Units',
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
  }
};
