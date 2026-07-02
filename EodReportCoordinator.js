const EodReportCoordinator = {
  applyToSummaryRows(sheet, startRow, rowCount) {
    // EOD lookup is a post-append enrichment step for the new summary rows.
    // Lookup problems should be visible in logs/validation notes, but must not
    // block the raw ingestion row that already reached the summary.
    try {
      this.applyToSummaryRows_(sheet, startRow, rowCount);
    } catch (err) {
      this.logError_('EOD_REPORT_LOOKUP_FAILED', '', err);
    }
  },

  applyToSummaryRowsOrThrow(sheet, startRow, rowCount) {
    this.applyToSummaryRows_(sheet, startRow, rowCount);
  },

  refreshSummaryRow(sheet, rowNumber) {
    this.validateRefreshTarget_(sheet, rowNumber);

    try {
      this.applyToSummaryRows_(sheet, rowNumber, 1);

      this.logInfo_(
        'EOD_REPORT_MANUAL_REFRESH_APPLIED',
        '',
        `Summary row: ${rowNumber}`
      );
    } catch (err) {
      this.writeRefreshFailure_(sheet, rowNumber, err);
      this.logError_('EOD_REPORT_MANUAL_REFRESH_FAILED', '', err);
    }
  },

  applyToSummaryRows_(sheet, startRow, rowCount) {
    if (!sheet || rowCount <= 0) {
      return;
    }

    const context = EodReportSummaryContextService.create(
      sheet,
      startRow,
      rowCount
    );

    const validationRows = EodReportValidationService.create(rowCount);

    const outstandingOrdersResult = OutstandingOrdersEodReportService
      .applyToSummaryRows(context, validationRows);

    const palletResult = PalletAndProductByMembersEodReportService
      .applyToSummaryRows(context, validationRows);

    EodReportValidationService.write(context, validationRows);
    context.write();

    this.logInfo_(
      'EOD_REPORT_LOOKUP_APPLIED',
      '',
      [
        `Summary rows: ${startRow}-${startRow + rowCount - 1}`,
        this.formatResult_('PALLET AND PRODUCT BY MEMBERS', palletResult),
        this.formatResult_('OUTSTANDING ORDERS', outstandingOrdersResult)
      ].join(' | ')
    );
  },

  validateRefreshTarget_(sheet, rowNumber) {
    if (!sheet) {
      throw new Error('Manual EOD refresh requires a sheet.');
    }

    if (sheet.getName() !== CONFIG.summary.sheetName) {
      throw new Error(`Manual EOD refresh requires ${CONFIG.summary.sheetName}.`);
    }

    const dataStartRow = Number(CONFIG.summary.headerRow || 2) + 1;

    if (rowNumber < dataStartRow) {
      throw new Error(`Manual EOD refresh requires a data row: ${rowNumber}.`);
    }
  },

  writeRefreshFailure_(sheet, rowNumber, err) {
    try {
      const context = EodReportSummaryContextService.create(sheet, rowNumber, 1);
      const validationRows = EodReportValidationService.create(1);
      const message = err && err.message ? err.message : String(err);

      EodReportValidationService.noMatch(
        validationRows,
        0,
        `Manual EOD refresh failed: ${message}`
      );
      EodReportValidationService.write(context, validationRows);
      context.write();
    } catch (writeErr) {
      this.logError_('EOD_REPORT_MANUAL_REFRESH_FAILURE_NOTE_FAILED', '', writeErr);
    }
  },

  formatResult_(name, result) {
    return [
      name,
      `checked=${result.checked}`,
      `filled=${result.filled}`,
      `corrected=${result.corrected}`,
      result.mismatched == null ? '' : `mismatched=${result.mismatched}`,
      `blocked=${result.blocked || 0}`,
      `notFound=${result.notFound}`
    ].filter(Boolean).join(' ');
  },

  logInfo_(status, filename, details) {
    if (
      typeof LogService !== 'undefined' &&
      typeof LogService.info === 'function'
    ) {
      LogService.info(status, '', filename || '', details || '');
      return;
    }

    Logger.log(`${status}: ${filename || ''} ${details || ''}`);
  },

  logError_(status, filename, err) {
    if (
      typeof LogService !== 'undefined' &&
      typeof LogService.error === 'function'
    ) {
      LogService.error(status, '', filename || '', err, '');
      return;
    }

    Logger.log(`${status}: ${err && err.stack ? err.stack : String(err)}`);
  }
};
