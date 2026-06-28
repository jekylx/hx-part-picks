const PalletAndProductByMembersEodReportService = {
  reportKey: 'palletAndProductByMembers',
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
    // Exact C/B pair matches are strongest. B Number is the trusted single-sided
    // anchor; C-only evidence must not overwrite trusted B/location values.
    const reportConfig = this.reportConfig_();
    const summaryColumns = reportConfig.summaryColumns;

    const beforeCNumber = context.value(summaryColumns.cNumber, rowIndex);
    const beforeBNumber = context.value(summaryColumns.bNumber, rowIndex);
    const owner = EodReportNormalisationService.normalizeOwner(
      context.value(summaryColumns.owner, rowIndex)
    );

    const cNumber = EodReportNormalisationService.normalizeCNumber(beforeCNumber);
    const bNumber = EodReportNormalisationService.normalizeBNumber(beforeBNumber);

    if (!cNumber && !bNumber) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${reportConfig.displayName}: no C/B values to validate.`
      );
      result.notFound++;
      return;
    }

    result.checked++;

    if (!lookup) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        [
          `${reportConfig.displayName}: no report found for ${dateKey}.`,
          `C: ${EodReportNormalisationService.displayValue(beforeCNumber)}`,
          `B: ${EodReportNormalisationService.displayValue(beforeBNumber)}`
        ].join('\n')
      );
      result.notFound++;
      return;
    }

    const exactMatch =
      cNumber && bNumber
        ? lookup.byPair[EodReportNormalisationService.pairKey(cNumber, bNumber)]
        : null;

    if (exactMatch) {
      context.setValue(summaryColumns.location, rowIndex, exactMatch.location);
      this.applyMemberAndProductInfo_(
        context,
        validationRows,
        rowIndex,
        lookup,
        bNumber,
        owner,
        result
      );
      EodReportValidationService.ok(validationRows, rowIndex);
      result.filled++;
      return;
    }

    const cMatches = cNumber ? lookup.byCNumber[cNumber] || [] : [];
    const bMatches = bNumber ? lookup.byBNumber[bNumber] || [] : [];
    const uniqueCMatch = this.getUniquePalletMatch_(cMatches);
    const uniqueBMatch = this.getUniquePalletMatchForBNumber_(bMatches);

    if (uniqueBMatch && uniqueBMatch.cNumber && uniqueBMatch.cNumber !== cNumber) {
      const bCorrectionGate = this.getBNumberCorrectionGate_(bMatches, owner);

      if (bCorrectionGate.allowed) {
        context.setValue(summaryColumns.cNumber, rowIndex, uniqueBMatch.cNumber);
        context.setValue(summaryColumns.location, rowIndex, uniqueBMatch.location);
        this.applyMemberAndProductInfo_(
          context,
          validationRows,
          rowIndex,
          lookup,
          bNumber,
          owner,
          result
        );

        EodReportValidationService.corrected(
          validationRows,
          rowIndex,
          [
            `${reportConfig.displayName}: corrected C Number.`,
            `Before: ${EodReportNormalisationService.displayValue(beforeCNumber)}`,
            `After: ${EodReportNormalisationService.displayValue(uniqueBMatch.cNumber)}`
          ].join('\n')
        );
        result.corrected++;
        return;
      }

      this.applyMemberAndProductInfo_(
        context,
        validationRows,
        rowIndex,
        lookup,
        bNumber,
        owner,
        result,
        false
      );

      const note = this.buildBlockedBNumberCorrectionNote_(
        bNumber,
        owner,
        bCorrectionGate.reason,
        bCorrectionGate.matchOwner
      );

      result.blocked++;

      if (cNumber && bNumber) {
        EodReportValidationService.mismatch(
          validationRows,
          rowIndex,
          [
            note,
            this.buildMismatchNote_(lookup.filename, dateKey, cNumber, bNumber, cMatches, bMatches)
          ].join('\n\n')
        );
        result.mismatched++;
        return;
      }

      EodReportValidationService.noMatch(validationRows, rowIndex, note);
      return;
    }

    if (bNumber && bMatches.length > 0 && !uniqueBMatch) {
      this.applyMemberAndProductInfo_(
        context,
        validationRows,
        rowIndex,
        lookup,
        bNumber,
        owner,
        result,
        false
      );

      const note = this.buildBlockedBNumberCorrectionNote_(
        bNumber,
        owner,
        'ambiguousOwner'
      );

      result.blocked++;

      if (cNumber && bNumber) {
        EodReportValidationService.mismatch(
          validationRows,
          rowIndex,
          [
            note,
            this.buildMismatchNote_(lookup.filename, dateKey, cNumber, bNumber, cMatches, bMatches)
          ].join('\n\n')
        );
        result.mismatched++;
        return;
      }

      EodReportValidationService.noMatch(validationRows, rowIndex, note);
      return;
    }

    if (uniqueCMatch && uniqueCMatch.bNumber && uniqueCMatch.bNumber !== bNumber) {
      this.applyMemberAndProductInfo_(
        context,
        validationRows,
        rowIndex,
        lookup,
        bNumber,
        owner,
        result,
        false
      );

      const note = [
        `${reportConfig.displayName}: B Number not corrected: C Number cannot override trusted B Number.`,
        'C-only evidence cannot set Location.'
      ].join('\n');

      result.blocked++;

      if (cNumber && bNumber) {
        EodReportValidationService.mismatch(
          validationRows,
          rowIndex,
          [
            note,
            this.buildMismatchNote_(lookup.filename, dateKey, cNumber, bNumber, cMatches, bMatches)
          ].join('\n\n')
        );
        result.mismatched++;
        return;
      }

      EodReportValidationService.noMatch(validationRows, rowIndex, note);
      return;
    }

    if (cMatches.length > 0 || bMatches.length > 0) {
      this.applyMemberAndProductInfo_(
        context,
        validationRows,
        rowIndex,
        lookup,
        bNumber,
        owner,
        result
      );

      EodReportValidationService.mismatch(
        validationRows,
        rowIndex,
        this.buildMismatchNote_(lookup.filename, dateKey, cNumber, bNumber, cMatches, bMatches)
      );
      result.mismatched++;
      return;
    }

    EodReportValidationService.noMatch(
      validationRows,
      rowIndex,
      [
        `${reportConfig.displayName}: no EOD match in ${lookup.filename}.`,
        `C: ${EodReportNormalisationService.displayValue(beforeCNumber)}`,
        `B: ${EodReportNormalisationService.displayValue(beforeBNumber)}`
      ].join('\n')
    );
    result.notFound++;
  },

  applyMemberAndProductInfo_(context, validationRows, rowIndex, lookup, bNumber, owner, result, countMissingMember) {
    const summaryColumns = this.reportConfig_().summaryColumns;
    const normalizedBNumber = EodReportNormalisationService.normalizeBNumber(bNumber);
    const shouldCountMissingMember = countMissingMember !== false;

    if (!normalizedBNumber) {
      return;
    }

    const bMatches = lookup.byBNumber[normalizedBNumber] || [];
    const product = this.getUniqueProductForBNumber_(bMatches);

    if (product) {
      context.setNote(
        summaryColumns.bNumber,
        rowIndex,
        EodReportNormalisationService.buildProductNote(product)
      );
    }

    if (!owner) {
      return;
    }

    const memberMatches = lookup.byBNumberAndOwner[
      EodReportNormalisationService.bOwnerKey(normalizedBNumber, owner)
    ] || [];

    const memberMatch = this.getUniqueMemberForBNumberAndOwner_(memberMatches);

    if (!memberMatch) {
      EodReportValidationService.noMatch(
        validationRows,
        rowIndex,
        `${this.reportConfig_().displayName}: no Member No match for B ${normalizedBNumber} and Owner ${owner}.`
      );
      if (shouldCountMissingMember) {
        result.notFound++;
      }
      return;
    }

    context.setValue(summaryColumns.member, rowIndex, memberMatch.memberNo);
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

  getLookupForDate(dateKey) {
    return this.getLookupForDate_(dateKey);
  },

  getUniqueOwnerForBNumber(lookup, bNumber) {
    if (!lookup) {
      return {
        status: 'missing',
        owner: ''
      };
    }

    const normalizedBNumber = EodReportNormalisationService.normalizeBNumber(bNumber);

    if (!normalizedBNumber) {
      return {
        status: 'missing',
        owner: ''
      };
    }

    const matches = lookup.byBNumber[normalizedBNumber] || [];
    const uniqueOwners = {};
    const owners = [];

    matches.forEach(match => {
      const owner = EodReportNormalisationService.normalizeOwner(match.owner);

      if (!owner || uniqueOwners[owner]) {
        return;
      }

      uniqueOwners[owner] = true;
      owners.push(owner);
    });

    if (owners.length === 1) {
      return {
        status: 'unique',
        owner: owners[0]
      };
    }

    return {
      status: owners.length > 1 ? 'ambiguous' : 'missing',
      owner: ''
    };
  },

  buildLookup_(report) {
    const columns = this.reportConfig_().columns;

    const locationIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.binLocation
    );

    const cNumberIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.childPalletNo
    );

    const bNumberIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.originalPalletNo
    );

    const ownerIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.owner
    );

    const memberNoIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.memberNo
    );

    const productCodeIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.productCode
    );

    const productDescriptionIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.productDescription
    );

    const vintageIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.vintage
    );

    const bottleSizeIndex = EodReportCsvService.getRequiredHeaderIndex_(
      report.headers,
      columns.bottleSize
    );

    const lookup = {
      filename: report.filename,
      dateKey: report.dateKey,
      byPair: {},
      byCNumber: {},
      byBNumber: {},
      byBNumberAndOwner: {}
    };

    report.rows.forEach((row, index) => {
      const location = String(row[locationIndex] || '').trim();
      const cNumber = EodReportNormalisationService.normalizeCNumber(row[cNumberIndex]);
      const bNumber = EodReportNormalisationService.normalizeBNumber(row[bNumberIndex]);
      const owner = EodReportNormalisationService.normalizeOwner(row[ownerIndex]);
      const memberNo = EodReportNormalisationService.normalizeMember(row[memberNoIndex]);

      if (!cNumber && !bNumber) {
        return;
      }

      const record = {
        reportRow: index + 1 + report.headerRow,
        location,
        cNumber,
        bNumber,
        owner,
        memberNo,
        productCode: String(row[productCodeIndex] || '').trim(),
        productDescription: String(row[productDescriptionIndex] || '').trim(),
        vintage: String(row[vintageIndex] || '').trim(),
        bottleSize: String(row[bottleSizeIndex] || '').trim()
      };

      if (cNumber && bNumber) {
        lookup.byPair[EodReportNormalisationService.pairKey(cNumber, bNumber)] = record;
      }

      EodReportNormalisationService.addLookupRecord(lookup.byCNumber, cNumber, record);
      EodReportNormalisationService.addLookupRecord(lookup.byBNumber, bNumber, record);

      if (bNumber && owner) {
        EodReportNormalisationService.addLookupRecord(
          lookup.byBNumberAndOwner,
          EodReportNormalisationService.bOwnerKey(bNumber, owner),
          record
        );
      }
    });

    return lookup;
  },

  getUniqueProductForBNumber_(matches) {
    if (!matches || matches.length === 0) {
      return null;
    }

    const unique = {};
    const products = [];

    matches.forEach(match => {
      const key = [
        match.productCode || '',
        match.productDescription || '',
        match.vintage || '',
        match.bottleSize || ''
      ].join('::');

      if (unique[key]) {
        return;
      }

      unique[key] = true;
      products.push({
        productCode: match.productCode,
        productDescription: match.productDescription,
        vintage: match.vintage,
        bottleSize: match.bottleSize
      });
    });

    return products.length === 1 ? products[0] : null;
  },

  getUniqueMemberForBNumberAndOwner_(matches) {
    if (!matches || matches.length === 0) {
      return null;
    }

    const unique = {};
    const records = [];

    matches.forEach(match => {
      const key = [
        match.bNumber || '',
        match.owner || '',
        match.memberNo || ''
      ].join('::');

      if (unique[key]) {
        return;
      }

      unique[key] = true;
      records.push(match);
    });

    return records.length === 1 ? records[0] : null;
  },

  getBNumberCorrectionGate_(matches, owner) {
    if (!owner) {
      return {
        allowed: false,
        reason: 'missingOwner'
      };
    }

    const uniqueMatch = this.getUniquePalletMatchForBNumber_(matches);

    if (!uniqueMatch) {
      return {
        allowed: false,
        reason: 'ambiguousOwner'
      };
    }

    if (uniqueMatch.owner !== owner) {
      return {
        allowed: false,
        reason: 'ownerMismatch',
        matchOwner: uniqueMatch.owner
      };
    }

    return {
      allowed: true,
      reason: ''
    };
  },

  buildBlockedBNumberCorrectionNote_(bNumber, owner, reason, matchOwner) {
    const normalizedBNumber = EodReportNormalisationService.normalizeBNumber(bNumber);
    const displayOwner = owner || '(blank)';
    const displayMatchOwner = matchOwner || '(blank)';

    if (reason === 'missingOwner') {
      return [
        `${this.reportConfig_().displayName}: C/Location correction blocked for B ${normalizedBNumber}.`,
        'Summary Owner is missing, so B Number owner could not confirm the correction.'
      ].join('\n');
    }

    if (reason === 'ownerMismatch') {
      return [
        `${this.reportConfig_().displayName}: C/Location correction blocked for B ${normalizedBNumber}.`,
        `Summary Owner ${displayOwner} does not match B Number owner ${displayMatchOwner}.`
      ].join('\n');
    }

    return [
      `${this.reportConfig_().displayName}: C/Location correction blocked for B ${normalizedBNumber}.`,
      'B Number ownership is ambiguous, so B Number owner could not confirm the correction.'
    ].join('\n');
  },

  buildMismatchNote_(filename, dateKey, summaryCNumber, summaryBNumber, cMatches, bMatches) {
    const lines = [
      `${this.reportConfig_().displayName}: mismatch in ${filename}.`,
      `Date: ${dateKey}`,
      `Current C: ${summaryCNumber || '(blank)'}`,
      `Current B: ${summaryBNumber || '(blank)'}`
    ];

    const cMatch = this.getUniquePalletMatch_(cMatches);
    const bMatch = this.getUniquePalletMatch_(bMatches);

    if (cMatch) {
      lines.push(`EOD for C expects B: ${cMatch.bNumber || '(blank)'}`);
    }

    if (bMatch) {
      lines.push(`EOD for B expects C: ${bMatch.cNumber || '(blank)'}`);
    }

    return lines.join('\n');
  },

  getUniquePalletMatch_(matches) {
    if (!matches || matches.length === 0) {
      return null;
    }

    const unique = {};
    const records = [];

    matches.forEach(match => {
      const key = [
        match.cNumber || '',
        match.bNumber || '',
        match.location || ''
      ].join('::');

      if (unique[key]) {
        return;
      }

      unique[key] = true;
      records.push(match);
    });

    return records.length === 1 ? records[0] : null;
  },

  getUniquePalletMatchForBNumber_(matches) {
    if (!matches || matches.length === 0) {
      return null;
    }

    const unique = {};
    const records = [];

    matches.forEach(match => {
      const key = [
        match.cNumber || '',
        match.bNumber || '',
        match.location || '',
        match.owner || ''
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
      mismatched: 0,
      blocked: 0,
      notFound: 0
    };
  },

  reportConfig_() {
    return CONFIG.eodReports.reports[this.reportKey];
  }
};
