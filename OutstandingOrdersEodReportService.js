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
    // Outstanding Orders can contain multiple stock lines for the same order.
    // Only an Order+B group may fill owner/customer/carrier/state.
    const reportConfig = this.reportConfig_();
    const summaryColumns = reportConfig.summaryColumns;
    const palletConfig = CONFIG.eodReports.reports.palletAndProductByMembers;

    const beforeOrderNumber = context.value(summaryColumns.orderNumber, rowIndex);
    const beforeCustomerName = context.value(summaryColumns.customerName, rowIndex);
    const beforeCarrier = context.value(summaryColumns.carrierCode, rowIndex);
    const beforeState = context.value(summaryColumns.customerState, rowIndex);
    const orderNumber = EodReportNormalisationService.normalizeSummaryOrderNumber(beforeOrderNumber);
    const beforeBNumber = context.value(palletConfig.summaryColumns.bNumber, rowIndex);
    const bNumber = EodReportNormalisationService.normalizeBNumber(beforeBNumber);

    if (!orderNumber) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: no order number to validate.`
      );
      result.notFound++;
      return;
    }

    if (!/^B\d{7}$/.test(bNumber)) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: correction blocked: no B Number to match against Outstanding Orders Search Criteria.`
      );
      result.blocked++;
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

    const matchKey = this.orderBNumberKey_(orderNumber, bNumber);
    const match = lookup.byOrderNumberAndBNumber[matchKey];

    if (!match) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: correction blocked: no Outstanding Orders line matched Order No. ${orderNumber} and B Number ${bNumber}.`,
          'Order-only matches are not safe because one order can contain multiple stock lines.'
        ].join('\n')
      );
      result.blocked++;
      return;
    }

    if (match.ambiguous) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: correction blocked: ambiguous Outstanding Orders lines for Order No. ${orderNumber} and B Number ${bNumber}.`,
          'Identity fields disagree within the matched stock line group.',
          `Reasons: ${match.ambiguityReasons.join(', ')}`
        ].join('\n')
      );
      result.blocked++;
      return;
    }

    const ownerCheck = this.getBNumberOwnerConfirmation_(context, rowIndex, dateKey, match.owner);

    if (ownerCheck.status === 'owner_mismatch') {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: correction blocked: matched order owner ${match.owner || '(blank)'} does not match B Number owner ${ownerCheck.owner || '(blank)'}.`
      );
      result.blocked++;
      return;
    }

    if (ownerCheck.status !== 'confirmed') {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: correction blocked: B Number owner could not confirm order owner.`,
          `Reason: ${ownerCheck.status || 'unknown'}`
        ].join('\n')
      );
      result.blocked++;
      return;
    }

    context.setValue(summaryColumns.owner, rowIndex, match.owner);

    let changed = false;

    changed = this.applyCustomerNameCorrection_(
      context,
      validationRows,
      rowIndex,
      dateKey,
      match,
      beforeCustomerName,
      result
    ) || changed;

    changed = this.applyGuardedFieldCorrection_(
      context,
      validationRows,
      rowIndex,
      summaryColumns.carrierCode,
      'Carrier',
      beforeCarrier,
      match.carrierCode,
      EodReportNormalisationService.isValidCarrier.bind(EodReportNormalisationService),
      result
    ) || changed;

    changed = this.applyGuardedFieldCorrection_(
      context,
      validationRows,
      rowIndex,
      summaryColumns.customerState,
      'State',
      beforeState,
      match.customerState,
      EodReportNormalisationService.isValidState.bind(EodReportNormalisationService),
      result
    ) || changed;

    if (!changed) {
      EodReportValidationService.ok(validationRows, rowIndex);
    }

    result.filled++;
  },

  applyCustomerNameCorrection_(context, validationRows, rowIndex, dateKey, match, beforeCustomerName, result) {
    const reportConfig = this.reportConfig_();
    const summaryColumns = reportConfig.summaryColumns;

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
      return true;
    }

    return false;
  },

  getBNumberOwnerConfirmation_(context, rowIndex, dateKey, orderOwner) {
    const palletConfig = CONFIG.eodReports.reports.palletAndProductByMembers;
    const bNumber = context.value(palletConfig.summaryColumns.bNumber, rowIndex);
    const lookup = PalletAndProductByMembersEodReportService.getLookupForDate(dateKey);

    return PalletAndProductByMembersEodReportService.confirmOwnerForBNumber(
      lookup,
      bNumber,
      orderOwner
    );
  },

  applyGuardedFieldCorrection_(context, validationRows, rowIndex, columnName, label, beforeValue, reportValue, validator, result) {
    const reportConfig = this.reportConfig_();

    if (validator(beforeValue)) {
      return false;
    }

    if (!validator(reportValue)) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: ${label} not corrected: report ${label} is blank or invalid.`
      );
      result.blocked++;
      return false;
    }

    const afterValue = EodReportNormalisationService.normalizeStrictCode(reportValue);

    context.setValue(columnName, rowIndex, afterValue);
    EodReportValidationService.corrected(
      validationRows,
      rowIndex,
      [
        `${reportConfig.displayName}: corrected ${label}.`,
        `Before: ${EodReportNormalisationService.displayValue(beforeValue)}`,
        `After: ${EodReportNormalisationService.displayValue(afterValue)}`
      ].join('\n')
    );
    result.corrected++;
    return true;
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

    const searchCriteriaIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.searchCriteria
    );

    const qtyOrdIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.qtyOrd
    );

    const lookup = {
      filename: report.filename,
      dateKey: report.dateKey,
      byOrderNumber: {},
      byOrderNumberAndBNumber: {}
    };

    report.rows.forEach((row, index) => {
      const orderParts = EodReportNormalisationService.parseOutstandingOrdersOrderNo(row[orderIndex]);

      if (!orderParts.orderNumber) {
        return;
      }

      const searchCriteria = String(row[searchCriteriaIndex] || '').trim();
      const searchCriteriaBNumber = EodReportNormalisationService
        .parseOutstandingOrdersSearchCriteriaBNumber(searchCriteria);
      const qtyOrd = this.parseQtyOrd_(row[qtyOrdIndex]);
      const orderLookup = this.ensureOrderLookup_(lookup, orderParts.orderNumber);

      if (qtyOrd !== null) {
        orderLookup.orderTotalQtyOrd += qtyOrd;
      }

      const record = {
        reportRow: index + 1 + report.headerRow,
        owner: orderParts.owner,
        orderNumber: orderParts.orderNumber,
        rawOrderNo: String(row[orderIndex] || '').trim(),
        customerName: String(row[customerNameIndex] || '').trim(),
        carrierCode: String(row[carrierCodeIndex] || '').trim(),
        customerState: String(row[customerStateIndex] || '').trim(),
        searchCriteria,
        searchCriteriaBNumber: searchCriteriaBNumber.bNumber,
        searchCriteriaStatus: searchCriteriaBNumber.status,
        qtyOrd
      };

      if (searchCriteriaBNumber.status !== 'ok') {
        return;
      }

      const group = this.ensureBNumberGroup_(
        lookup,
        orderLookup,
        record.orderNumber,
        record.searchCriteriaBNumber
      );

      this.addRecordToGroup_(group, record);
    });

    return lookup;
  },

  ensureOrderLookup_(lookup, orderNumber) {
    if (!lookup.byOrderNumber[orderNumber]) {
      lookup.byOrderNumber[orderNumber] = {
        orderNumber,
        orderTotalQtyOrd: 0,
        bNumbers: {}
      };
    }

    return lookup.byOrderNumber[orderNumber];
  },

  ensureBNumberGroup_(lookup, orderLookup, orderNumber, bNumber) {
    const key = this.orderBNumberKey_(orderNumber, bNumber);

    if (!lookup.byOrderNumberAndBNumber[key]) {
      lookup.byOrderNumberAndBNumber[key] = {
        orderNumber,
        searchCriteriaBNumber: bNumber,
        owner: '',
        customerName: '',
        carrierCode: '',
        customerState: '',
        qtyOrdSum: 0,
        ambiguous: false,
        ambiguityReasons: [],
        rows: []
      };
    }

    orderLookup.bNumbers[bNumber] = lookup.byOrderNumberAndBNumber[key];

    return lookup.byOrderNumberAndBNumber[key];
  },

  addRecordToGroup_(group, record) {
    if (record.qtyOrd !== null) {
      group.qtyOrdSum += record.qtyOrd;
    }

    const identityFields = [
      'owner',
      'customerName',
      'carrierCode',
      'customerState',
      'searchCriteriaBNumber'
    ];

    if (group.rows.length === 0) {
      identityFields.forEach(field => {
        group[field] = record[field] || '';
      });
    } else {
      identityFields.forEach(field => {
        const before = this.canonicalIdentityValue_(field, group[field]);
        const after = this.canonicalIdentityValue_(field, record[field]);

        if (before !== after) {
          group.ambiguous = true;

          if (group.ambiguityReasons.indexOf(field) === -1) {
            group.ambiguityReasons.push(field);
          }
        }
      });
    }

    group.rows.push(record);
  },

  canonicalIdentityValue_(field, value) {
    if (field === 'owner') {
      return EodReportNormalisationService.normalizeOwner(value);
    }

    if (field === 'customerName') {
      return EodReportNormalisationService.normalizeName(value);
    }

    if (field === 'carrierCode' || field === 'customerState') {
      return EodReportNormalisationService.normalizeStrictCode(value);
    }

    return value || '';
  },

  parseQtyOrd_(value) {
    if (value == null || value === '') {
      return null;
    }

    const cleaned = String(value).replace(/,/g, '').trim();

    if (!cleaned) {
      return null;
    }

    const numberValue = Number(cleaned);

    return isFinite(numberValue) ? numberValue : null;
  },

  orderBNumberKey_(orderNumber, bNumber) {
    return `${orderNumber}::${bNumber}`;
  },

  createResult_() {
    return {
      checked: 0,
      filled: 0,
      corrected: 0,
      blocked: 0,
      notFound: 0
    };
  },

  reportConfig_() {
    return CONFIG.eodReports.reports[this.reportKey];
  }
};
