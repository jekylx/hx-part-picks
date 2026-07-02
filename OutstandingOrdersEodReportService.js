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
        this.clearQuantityFields_(context, rowIndex);
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

    if (!orderNumber) {
      this.clearQuantityFields_(context, rowIndex);
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        'Order Qty blocked: no unique order match.'
      );
      result.notFound++;
      return;
    }

    result.checked++;

    if (!lookup) {
      this.clearQuantityFields_(context, rowIndex);
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        'Order Qty blocked: no unique order match.'
      );
      result.notFound++;
      return;
    }

    const orderLookup = lookup.byOrderNumber[orderNumber];

    if (!orderLookup || orderLookup.ambiguous) {
      this.clearQuantityFields_(context, rowIndex);
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        'Order Qty blocked: no unique order match.'
      );
      result.blocked++;
      return;
    }

    context.setValue(summaryColumns.orderQty, rowIndex, orderLookup.orderTotalQtyOrd);

    const bSelection = this.selectOrderBNumberMatch_(
      lookup,
      orderNumber,
      beforeBNumber
    );

    if (bSelection.status !== 'ok') {
      context.setValue(summaryColumns.bQty, rowIndex, '');
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        bSelection.status === 'ambiguous'
          ? 'B Qty blocked: ambiguous Order+B candidate.'
          : 'B Qty blocked: no safe Order+B match.'
      );
      result.blocked++;
      return;
    }

    const bNumber = bSelection.bNumber;
    const match = bSelection.match;

    if (match.ambiguous) {
      context.setValue(summaryColumns.bQty, rowIndex, '');
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        'B Qty blocked: ambiguous Order+B quantity.'
      );
      result.blocked++;
      return;
    }

    if (beforeBNumber !== bNumber) {
      context.setValue(palletConfig.summaryColumns.bNumber, rowIndex, bNumber);
      EodReportValidationService.corrected(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: corrected B Number from Order+B candidate.`,
          `Before: ${EodReportNormalisationService.displayValue(beforeBNumber)}`,
          `After: ${EodReportNormalisationService.displayValue(bNumber)}`
        ].join('\n')
      );
      result.corrected++;
    }

    context.setValue(summaryColumns.bQty, rowIndex, match.qtyOrdSum);

    if (!EodReportNormalisationService.normalizeOwner(match.owner)) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: correction blocked: matched Outstanding Orders line has no usable Owner.`,
          `Order No: ${orderNumber}`,
          `B Number: ${bNumber}`
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

  selectOrderBNumberMatch_(lookup, orderNumber, rawBNumber) {
    const candidates = EodReportNormalisationService.getBNumberCandidates(rawBNumber);
    const matches = [];

    candidates.forEach(candidate => {
      const match = lookup.byOrderNumberAndBNumber[
        this.orderBNumberKey_(orderNumber, candidate)
      ];

      if (match) {
        matches.push({
          bNumber: candidate,
          match
        });
      }
    });

    if (matches.length === 1) {
      return {
        status: 'ok',
        bNumber: matches[0].bNumber,
        match: matches[0].match
      };
    }

    return {
      status: matches.length > 1 ? 'ambiguous' : 'missing',
      bNumber: '',
      match: null
    };
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

      this.addRecordToOrderLookup_(orderLookup, record);

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
        owner: '',
        ambiguous: false,
        ambiguityReasons: [],
        rows: [],
        bNumbers: {}
      };
    }

    return lookup.byOrderNumber[orderNumber];
  },

  addRecordToOrderLookup_(orderLookup, record) {
    if (orderLookup.rows.length === 0) {
      orderLookup.owner = record.owner || '';
    } else if (
      EodReportNormalisationService.normalizeOwner(orderLookup.owner) !==
        EodReportNormalisationService.normalizeOwner(record.owner)
    ) {
      orderLookup.ambiguous = true;

      if (orderLookup.ambiguityReasons.indexOf('owner') === -1) {
        orderLookup.ambiguityReasons.push('owner');
      }
    }

    orderLookup.rows.push(record);
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

  clearQuantityFields_(context, rowIndex) {
    const summaryColumns = this.reportConfig_().summaryColumns;

    context.setValue(summaryColumns.orderQty, rowIndex, '');
    context.setValue(summaryColumns.bQty, rowIndex, '');
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
