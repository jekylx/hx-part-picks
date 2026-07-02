/**
 * SummaryService.js
 *
 * Facade for the Summary workflow. Owns the append-only orchestration:
 *
 *   Raw Part Picks
 *     -> build Summary drafts in memory       (SummaryDraftService)
 *     -> EOD enrichment/check attempt          (EodReportCoordinator)
 *     -> append final Summary rows once        (SummaryAppendWriterService)
 *     -> SLA formulas + formatting             (SummarySlaService/FormatService)
 *
 * Summary rows must never be visibly appended first and then patched by the
 * initial EOD enrichment. If EOD cannot confirm something, the row still
 * appends with safe values and notes/colours/blocked reasons.
 *
 * The delegation members at the bottom keep the public surface stable for
 * Code.js, EodReportCoordinator, EodReportSummaryContextService and tests.
 */

const SummaryService = {
  appendMissingSummaryRows() {
    // Summary is append-only. Existing summary rows may contain manual edits,
    // so this flow only builds drafts for raw Processing Keys that are not
    // already present and enriches them before the final append.
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

    SummarySchemaService.setupSummaryHeaders_(summarySheet);

    const rawValues = rawSheet.getDataRange().getValues();

    if (rawValues.length < 2) {
      SummaryFormatService.formatSummary_(summarySheet);
      this.logAppendStats_(stats);
      return stats;
    }

    const rawHeaders = rawValues[0];
    stats.rawProcessingKeyHeaderFound = rawHeaders.indexOf('Processing Key') > -1;

    const rawRows = rawValues.slice(1);
    stats.rawRowsScanned = rawRows.length;

    const existingSummaryKeys = SummaryAppendWriterService.getExistingSummaryKeys_(summarySheet);
    stats.existingSummaryKeysFound = existingSummaryKeys.size;

    const headers = SummarySchemaService.getSheetHeaders_(summarySheet);
    const draftsToAppend = [];

    rawRows.forEach((rawRow, index) => {
      const raw = SummaryDraftService.rowToObject_(rawHeaders, rawRow);
      const summaryKey = SummaryDraftService.buildSummaryKey_(raw);

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

      draftsToAppend.push(SummaryDraftService.buildSummaryDraftFromRaw_(headers, raw, summaryKey));
    });

    if (draftsToAppend.length > 0) {
      const enrichedDrafts =
        EodReportCoordinator.enrichSummaryDrafts(draftsToAppend) || draftsToAppend;
      const startRow = SummaryAppendWriterService.getNextSummaryAppendRow_(summarySheet);

      SummaryAppendWriterService.appendFinalSummaryDrafts_(
        summarySheet,
        startRow,
        headers,
        enrichedDrafts
      );

      SummarySlaService.applySlaFormulas_(summarySheet, startRow, enrichedDrafts.length);
    }

    stats.missingRowsAppended = draftsToAppend.length;

    SummaryFormatService.formatSummary_(summarySheet);

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

  /**
   * Stable delegation surface (used by Code.js, the EOD coordinator/context
   * services and the local tests).
   */

  setupSummaryHeaders_(sheet) {
    return SummarySchemaService.setupSummaryHeaders_(sheet);
  },

  getConfiguredSummaryHeaders_() {
    return SummarySchemaService.getConfiguredSummaryHeaders_();
  },

  getRefreshEodHeader_() {
    return SummarySchemaService.getRefreshEodHeader_();
  },

  getSendEmailHeader_() {
    return SummarySchemaService.getSendEmailHeader_();
  },

  buildSummaryRow_(raw, summaryKey) {
    return SummaryDraftService.buildSummaryRow_(raw, summaryKey);
  },

  buildSummaryKey_(raw) {
    return SummaryDraftService.buildSummaryKey_(raw);
  },

  getNextSummaryAppendRow_(sheet) {
    return SummaryAppendWriterService.getNextSummaryAppendRow_(sheet);
  },

  applySlaFormulas_(sheet, startRow, rowCount) {
    return SummarySlaService.applySlaFormulas_(sheet, startRow, rowCount);
  },

  formatSummary_(sheet) {
    return SummaryFormatService.formatSummary_(sheet);
  }
};
