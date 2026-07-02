/**
 * SummaryFormatService.js
 *
 * Summary sheet presentation: number formats, owned validations
 * (clear stale, apply Date Completed + checkbox rules), hidden operational
 * columns and SLA conditional formatting (via SummarySlaService).
 */

const SummaryFormatService = {
  formatSummary_(sheet) {
    const headerRow = SummarySchemaService.summaryHeaderRow_();
    const headers = SummarySchemaService.getSheetHeaders_(sheet);

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
    SummarySlaService.applySlaConditionalFormatting_(sheet, headers);
  },

  applySummaryNumberFormats_(sheet, headers) {
    const datetimeCols = SummarySchemaService.getConfiguredColumnIndexes_(headers, column =>
      column.type === 'datetime'
    );
    const dateCols = SummarySchemaService.getConfiguredColumnIndexes_(headers, column =>
      column.type === 'date'
    );
    const numberCols = SummarySchemaService.getConfiguredColumnIndexes_(headers, column =>
      column.type === 'number'
    );
    const formattedCols = {};
    const slaCol = SummarySchemaService.getSlaColumn_(headers);
    const startRow = SummarySchemaService.summaryDataStartRow_();
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

    numberCols.forEach(col => {
      formattedCols[col] = true;
      sheet
        .getRange(startRow, col, rowCount, 1)
        .setNumberFormat('0.########');
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
    const completedCol = SummarySchemaService.getCompletedColumn_(headers);
    const startRow = SummarySchemaService.summaryDataStartRow_();
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
    const startRow = SummarySchemaService.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (rowCount <= 0) {
      return;
    }

    [
      'Order Qty',
      'B Qty',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      SummarySchemaService.getRefreshEodHeader_(),
      SummarySchemaService.getSendEmailHeader_()
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
    const headers = SummarySchemaService.getSheetHeaders_(sheet);
    const configuredSendEmailHeader = SummarySchemaService.getSendEmailHeader_();
    const configuredSendEmailColumn =
      SummarySchemaService.getConfiguredSummaryHeaders_().indexOf(configuredSendEmailHeader) + 1;

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
    const startRow = SummarySchemaService.summaryDataStartRow_();
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
  }
};
