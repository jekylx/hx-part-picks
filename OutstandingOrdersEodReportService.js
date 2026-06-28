const OutstandingOrdersEodReportService = {
  reportKey: 'outstandingOrders',
  _lookupCache: {},

  applyToSummaryRows(context, validationRows) {
    const result = this.createResult_();
    const reportConfig = this.reportConfig_();

    for (let rowIndex = 0; rowIndex < context.rowCount; rowIndex++) {
      const dateReceived = EodReportNormalisationService.toDate(
        context.value(reportConfig.summaryColumns.dateReceived, rowIndex)
      );

      if (!dateReceived) {
        EodReportValidationService.noMatch(
          validationRows,
          rowIndex,
          `${reportConfig.displayName}: no Date Received value found.`
        );
        result.notFound++;
        continue;
      }

      const dateKey = EodReportNormalisationService.dateKey(dateReceived);
      const lookup = this.getLookupForDate_(dateKey);

      this.applyRow_(context, validationRows, rowIndex, lookup, dateKey, result);
    }

    return result;
  },

  applyRow_(context, validationRows, rowIndex, lookup, dateKey, result) {
    // Outstanding Orders validates by order number, fills owner/carrier/state,
    // and only corrects customer name when the EOD match is unique.
    const reportConfig = this.reportConfig_();
    const summaryColumns = reportConfig.summaryColumns;

    const beforeOrderNumber = context.value(summaryColumns.orderNumber, rowIndex);
    const beforeCustomerName = context.value(summaryColumns.customerName, rowIndex);
    const orderNumber = EodReportNormalisationService.normalizeSummaryOrderNumber(beforeOrderNumber);

    if (!orderNumber) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: no order number to validate.`
      );
      result.notFound++;
      return;
    }

    result.checked++;

    if (!lookup) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: no report found for ${dateKey}.`
      );
      result.notFound++;
      return;
    }

    const matches = lookup.byOrderNumber[orderNumber] || [];
    const match = this.getUniqueMatch_(matches);

    if (!match) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        matches.length > 1
          ? `${reportConfig.displayName}: multiple matches. Check order number.`
          : `${reportConfig.displayName}: no match. Check parsed order number.`
      );
      result.notFound++;
      return;
    }

    context.setValue(summaryColumns.owner, rowIndex, match.owner);

    if (
      match.customerName &&
      EodReportNormalisationService.normalizeName(match.customerName) !==
        EodReportNormalisationService.normalizeName(beforeCustomerName)
    ) {
      context.setValue(summaryColumns.customerName, rowIndex, match.customerName);
      EodReportValidationService.corrected(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: corrected Customer Name.`,
          `Before: ${EodReportNormalisationService.displayValue(beforeCustomerName)}`,
          `After: ${EodReportNormalisationService.displayValue(match.customerName)}`
        ].join('\n')
      );
      result.corrected++;
    } else {
      EodReportValidationService.ok(validationRows, rowIndex);
    }

    context.setValue(summaryColumns.carrierCode, rowIndex, match.carrierCode);
    context.setValue(summaryColumns.customerState, rowIndex, match.customerState);
    result.filled++;
  },

  getLookupForDate_(dateKey) {
    if (this._lookupCache[dateKey] !== undefined) {
      return this._lookupCache[dateKey];
    }

    const report = EodReportCsvService.getReportForDate(this.reportKey, dateKey);

    if (!report) {
      this._lookupCache[dateKey] = null;
      return null;
    }

    const lookup = this.buildLookup_(report);

    this._lookupCache[dateKey] = lookup;
    return lookup;
  },

  buildLookup_(report) {
    const columns = this.reportConfig_().columns;

    const orderIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.orderNo
    );

    const customerNameIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.customerName
    );

    const carrierCodeIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.carrierCode
    );

    const customerStateIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.customerState
    );

    const lookup = {
      filename: report.filename,
      dateKey: report.dateKey,
      byOrderNumber: {}
    };

    report.rows.forEach((row, index) => {
      const orderParts = EodReportNormalisationService.parseOutstandingOrdersOrderNo(row[orderIndex]);

      if (!orderParts.orderNumber) {
        return;
      }

      const record = {
        reportRow: index + 1 + report.headerRow,
        owner: orderParts.owner,
        orderNumber: orderParts.orderNumber,
        rawOrderNo: String(row[orderIndex] || '').trim(),
        customerName: String(row[customerNameIndex] || '').trim(),
        carrierCode: String(row[carrierCodeIndex] || '').trim(),
        customerState: String(row[customerStateIndex] || '').trim()
      };

      EodReportNormalisationService.addLookupRecord(
        lookup.byOrderNumber,
        record.orderNumber,
        record
      );
    });

    return lookup;
  },

  getUniqueMatch_(matches) {
    if (!matches || matches.length === 0) {
      return null;
    }

    const unique = {};
    const records = [];

    matches.forEach(match => {
      const key = [
        match.owner || '',
        match.orderNumber || '',
        match.customerName || '',
        match.carrierCode || '',
        match.customerState || ''
      ].join('::');

      if (unique[key]) {
        return;
      }

      unique[key] = true;
      records.push(match);
    });

    return records.length === 1 ? records[0] : null;
  },

  createResult_() {
    return {
      checked: 0,
      filled: 0,
      corrected: 0,
      notFound: 0
    };
  },

  reportConfig_() {
    return CONFIG.eodReports.reports[this.reportKey];
  }
};
