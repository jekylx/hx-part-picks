/**
 * SummaryDraftService.js
 *
 * Builds in-memory Summary drafts from raw Part Picks rows.
 *
 * Raw values are preserved as captured; only safe display normalisation
 * (NormalisationService.normalizeSummaryValue) is applied on the way into a
 * draft. Drafts are enriched by EodReportCoordinator before the single
 * visible append (SummaryAppendWriterService).
 */

const SummaryDraftService = {
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

  buildSummaryDraftFromRaw_(headers, raw, summaryKey) {
    const configuredHeaders = SummarySchemaService.getConfiguredSummaryHeaders_();
    const configuredRow = this.buildSummaryRow_(raw, summaryKey);
    const values = headers.map(header => {
      const configuredIndex = configuredHeaders.indexOf(header);

      return configuredIndex >= 0 ? configuredRow[configuredIndex] : '';
    });

    return {
      summaryKey,
      headers: headers.slice(),
      values,
      notes: headers.map(() => ''),
      backgrounds: headers.map(() => '')
    };
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
  }
};
