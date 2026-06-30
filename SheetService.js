const SheetService = {
  internalProtectionDescription: 'HX Part Picks protected internal sheet',
  dateTimeNumberFormat: 'dd/MM/yyyy HH:mm:ss',
  dateNumberFormat: 'dd/MM/yyyy',

  setupSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    this.setupPartPicks_(ss);
    this.setupLog_(ss);
    this.setupProcessed_(ss);
    this.setupConfiguration_(ss);
    this.setupSummaryEmailLedger_(ss);
    this.setupEodReportCache_(ss);
  },

  appendPartPickRow(ctx) {
    // Part Picks is the raw ingestion sheet. Keep extracted values as plain
    // text so identifiers with leading zeroes survive until summary/EOD
    // normalisation decides how to display and validate them.
    const sheet = this.getSheet_(CONFIG.sheets.extractedSheetName);
    const form = ctx.form || {};

    const fieldValues = CONFIG.fields.map(field =>
      form[field.key] == null ? '' : form[field.key]
    );

    const row = [
      ctx.processingKey,
      new Date(),
      ctx.message.getDate(),
      ctx.message.getId(),
      ctx.pdf.getName(),
      ctx.archiveFile ? ctx.archiveFile.getUrl() : '',
      ctx.extractionStatus || '',
      ...fieldValues
    ];

    const nextRow = sheet.getLastRow() + 1;
    const rawFieldStartColumn = 8;

    sheet
      .getRange(nextRow, rawFieldStartColumn, 1, fieldValues.length)
      .setNumberFormat('@');

    sheet
      .getRange(nextRow, 1, 1, row.length)
      .setValues([row]);
  },

  getSheet_(name) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error('No active spreadsheet found.');
    }

    const sheetName = String(name || '').trim();

    if (!sheetName) {
      throw new Error('Sheet name is blank.');
    }

    return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  },

  setupPartPicks_(ss) {
    // Raw extraction headers. The user-facing summary sheet is derived later
    // and may normalise or enrich these values.
    const sheet =
      ss.getSheetByName(CONFIG.sheets.extractedSheetName) ||
      ss.insertSheet(CONFIG.sheets.extractedSheetName);

    this.ensureHeaders_(sheet, [
      'Processing Key',
      'Processed At',
      'Email Received At',
      'Gmail Message ID',
      'PDF Filename',
      'PDF Drive Link',
      'Extraction Status',
      ...CONFIG.fields.map(field => field.sheetColumn || field.label)
    ]);
  },

  setupLog_(ss) {
    const sheet =
      ss.getSheetByName(CONFIG.sheets.logSheetName) ||
      ss.insertSheet(CONFIG.sheets.logSheetName);

    this.ensureHeaders_(sheet, [
      'Timestamp',
      'Level',
      'Status',
      'Gmail Message ID',
      'PDF Filename',
      'Details',
      'Link'
    ]);

    this.clearSheetDataValidations_(sheet);
  },

  setupProcessed_(ss) {
    const sheet =
      ss.getSheetByName(CONFIG.sheets.processedSheetName) ||
      ss.insertSheet(CONFIG.sheets.processedSheetName);

    this.ensureHeaders_(sheet, [
      'Processing Key',
      'Processed At',
      'Gmail Message ID',
      'PDF Filename',
      'PDF Hash',
      'Drive Link',
      'Forms Extracted'
    ]);

    DedupeService.clearCache();
  },

  setupConfiguration_(ss) {
    const sheet =
      ss.getSheetByName(CONFIG.sheets.configSheetName) ||
      ss.insertSheet(CONFIG.sheets.configSheetName);

    const headers = [
      'Key',
      'Label',
      'Type',
      'Sheet Column',
      'Required',
      'Critical',
      'Options',
      'Description'
    ];

    this.ensureHeaders_(sheet, headers);

    if (sheet.getLastRow() > 1) {
      return;
    }

    const rows = CONFIG.fields.map(field => [
      field.key,
      field.label,
      field.type,
      field.sheetColumn || field.label,
      field.required,
      field.critical,
      field.options ? field.options.join(' | ') : '',
      field.description || ''
    ]);

    sheet
      .getRange(2, 1, rows.length, headers.length)
      .setValues(rows);
  },

  hideImplementationSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summarySheet = ss.getSheetByName(CONFIG.summary.sheetName);

    if (!summarySheet) {
      return;
    }

    summarySheet.showSheet();

    ss.getSheets().forEach(sheet => {
      if (this.shouldHideImplementationSheet_(sheet.getName())) {
        sheet.hideSheet();
      } else {
        sheet.showSheet();
      }
    });
  },

  shouldHideImplementationSheet_(sheetName) {
    return sheetName !== CONFIG.summary.sheetName;
  },

  setupSummaryEmailLedger_(ss) {
    const sheet =
      ss.getSheetByName(CONFIG.sheets.summaryEmailLedgerSheetName) ||
      ss.insertSheet(CONFIG.sheets.summaryEmailLedgerSheetName);

    this.ensureHeaders_(sheet, [
      'Send Key',
      'Summary Key',
      'Recipient',
      'PDF File ID',
      'Status',
      'Reserved At',
      'Sent At',
      'Updated At',
      'Error',
      'Subject'
    ]);
  },

  setupEodReportCache_(ss) {
    const sheet =
      ss.getSheetByName(CONFIG.sheets.eodReportCacheSheetName) ||
      ss.insertSheet(CONFIG.sheets.eodReportCacheSheetName);

    this.ensureHeaders_(sheet, [
      'Cache Key',
      'Report Key',
      'Date Key',
      'Source Message ID',
      'Source Filename',
      'Source Date',
      'Cached At',
      'Header Row',
      'Headers JSON',
      'Row Count',
      'Status',
      'Error'
    ]);

    this.setupEodReportRowCache_(
      ss,
      CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
      CONFIG.eodReports.reports.outstandingOrders
    );

    this.setupEodReportRowCache_(
      ss,
      CONFIG.sheets.eodPalletProductCacheSheetName,
      CONFIG.eodReports.reports.palletAndProductByMembers
    );
  },

  setupEodReportRowCache_(ss, sheetName, reportConfig) {
    const sheet =
      ss.getSheetByName(sheetName) ||
      ss.insertSheet(sheetName);

    const reportHeaders = Object.keys(reportConfig.columns || {}).map(key =>
      reportConfig.columns[key]
    );

    this.ensureHeaders_(sheet, [
      'Cache Key',
      'Report Key',
      'Date Key',
      'Source Message ID',
      'Source Filename',
      'Source Date',
      'Cached At',
      'Report Row',
      ...reportHeaders
    ]);
  },

  protectImplementationSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const summaryName = CONFIG.summary.sheetName;
    const effectiveUser = Session.getEffectiveUser();

    ss.getSheets().forEach(sheet => {
      if (sheet.getName() === summaryName) {
        this.removeScriptInternalProtections_(sheet);
        return;
      }

      this.ensureInternalSheetProtection_(sheet, effectiveUser);
    });
  },

  ensureInternalSheetProtection_(sheet, effectiveUser) {
    const protections = this.getScriptInternalProtections_(sheet);
    let protection = protections[0];

    if (!protection) {
      protection = sheet.protect();
      protection.setDescription(this.internalProtectionDescription);
    }

    protections.slice(1).forEach(duplicate => {
      try {
        duplicate.remove();
      } catch (err) {
        Logger.log(
          `Could not remove duplicate HX sheet protection on ${sheet.getName()}: ${this.stringifyProtectionError_(err)}`
        );
      }
    });

    protection.setDescription(this.internalProtectionDescription);

    try {
      if (
        typeof protection.setWarningOnly === 'function' &&
        typeof protection.isWarningOnly === 'function' &&
        protection.isWarningOnly()
      ) {
        protection.setWarningOnly(false);
      }
    } catch (err) {
      Logger.log(
        `Could not enforce strict sheet protection on ${sheet.getName()}: ${this.stringifyProtectionError_(err)}`
      );
    }

    if (
      typeof protection.isWarningOnly === 'function' &&
      protection.isWarningOnly()
    ) {
      throw new Error(
        `Internal sheet protection for ${sheet.getName()} is warning-only, not enforced.`
      );
    }

    this.disableDomainEditing_(protection, sheet.getName());
    this.keepOnlyEffectiveUserEditor_(protection, effectiveUser, sheet.getName());
  },

  removeScriptInternalProtections_(sheet) {
    this.getScriptInternalProtections_(sheet).forEach(protection => {
      try {
        protection.remove();
      } catch (err) {
        Logger.log(
          `Could not remove HX internal protection from editable summary sheet ${sheet.getName()}: ${this.stringifyProtectionError_(err)}`
        );
      }
    });
  },

  getScriptInternalProtections_(sheet) {
    return sheet
      .getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .filter(protection =>
        protection.getDescription() === this.internalProtectionDescription
      );
  },

  disableDomainEditing_(protection, sheetName) {
    try {
      if (
        typeof protection.canDomainEdit === 'function' &&
        protection.canDomainEdit()
      ) {
        protection.setDomainEdit(false);
      }
    } catch (err) {
      Logger.log(
        `Could not disable domain editing on protected sheet ${sheetName}: ${this.stringifyProtectionError_(err)}`
      );
    }
  },

  keepOnlyEffectiveUserEditor_(protection, effectiveUser, sheetName) {
    const effectiveEmail = this.getUserEmail_(effectiveUser);

    if (!effectiveEmail) {
      Logger.log(
        `Could not determine effective user email for protected sheet ${sheetName}; skipping editor cleanup.`
      );
      return;
    }

    try {
      if (effectiveUser && typeof protection.addEditor === 'function') {
        protection.addEditor(effectiveUser);
      }
    } catch (err) {
      Logger.log(
        `Could not explicitly add effective user to protected sheet ${sheetName}: ${this.stringifyProtectionError_(err)}`
      );
    }

    try {
      const removableEditors = protection
        .getEditors()
        .filter(editor => this.getUserEmail_(editor) !== effectiveEmail);

      if (removableEditors.length > 0) {
        protection.removeEditors(removableEditors);
      }
    } catch (err) {
      Logger.log(
        `Could not remove all extra editors from protected sheet ${sheetName}: ${this.stringifyProtectionError_(err)}`
      );
    }
  },

  getUserEmail_(user) {
    if (!user || typeof user.getEmail !== 'function') {
      return '';
    }

    return String(user.getEmail() || '').toLowerCase();
  },

  stringifyProtectionError_(err) {
    return err && err.stack ? String(err.stack) : String(err);
  },

  ensureHeaders_(sheet, headers) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      this.applyColumnNumberFormats_(sheet, headers);
      this.clearSheetDataValidations_(sheet);
      return;
    }

    const currentLastColumn = Math.max(sheet.getLastColumn(), headers.length);

    const existing = sheet
      .getRange(1, 1, 1, currentLastColumn)
      .getValues()[0];

    const mismatch =
      currentLastColumn !== headers.length ||
      headers.some((header, index) => existing[index] !== header);

    if (!mismatch) {
      sheet.setFrozenRows(1);
      this.applyColumnNumberFormats_(sheet, headers);
      this.clearSheetDataValidations_(sheet);
      return;
    }

    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    if (currentLastColumn > headers.length) {
      sheet
        .getRange(1, headers.length + 1, 1, currentLastColumn - headers.length)
        .clearContent();
    }

    sheet.setFrozenRows(1);
    this.applyColumnNumberFormats_(sheet, headers);
    this.clearSheetDataValidations_(sheet);
  },

  applyColumnNumberFormats_(sheet, headers) {
    const rowCount = sheet.getMaxRows() - 1;

    if (rowCount <= 0) {
      return;
    }

    headers.forEach((header, index) => {
      const col = index + 1;
      let numberFormat = '';

      if (this.isTimestampHeader_(header)) {
        numberFormat = this.dateTimeNumberFormat;
      } else if (this.isDateOnlyHeader_(header)) {
        numberFormat = this.dateNumberFormat;
      }

      if (!numberFormat) {
        return;
      }

      sheet
        .getRange(2, col, rowCount, 1)
        .setNumberFormat(numberFormat);
    });
  },

  clearSheetDataValidations_(sheet) {
    const rowCount = sheet.getMaxRows() - 1;
    const columnCount = sheet.getMaxColumns
      ? sheet.getMaxColumns()
      : sheet.getLastColumn();

    if (rowCount <= 0 || columnCount <= 0) {
      return;
    }

    const range = sheet.getRange(2, 1, rowCount, columnCount);

    if (typeof range.clearDataValidations === 'function') {
      range.clearDataValidations();
    }
  },

  isTimestampHeader_(header) {
    const timestampHeaders = {
      'Processed At': true,
      'Email Received At': true,
      'Email Sent At': true,
      'Created At': true,
      'Updated At': true,
      'Cached At': true,
      'Fetched At': true,
      'Sent At': true,
      'Reserved At': true,
      'Error At': true,
      'Refreshed At': true,
      'Timestamp': true
    };

    return !!timestampHeaders[String(header || '').trim()];
  },

  isDateOnlyHeader_(header) {
    const dateOnlyHeaders = {
      'Date': true,
      'Signoff Date': true,
      'form_date': true,
      'picker_signoff_date': true
    };

    return !!dateOnlyHeaders[String(header || '').trim()];
  }
};

const LogService = {
  info(status, messageId, filename, details) {
    this.append_('INFO', status, messageId, filename, details, '');
  },

  error(status, messageId, filename, err, link) {
    this.append_(
      'ERROR',
      status,
      messageId,
      filename,
      err && err.stack ? err.stack : String(err),
      link || ''
    );
  },

  append_(level, status, messageId, filename, details, link) {
    try {
      const sheet = SheetService.getSheet_(CONFIG.sheets.logSheetName);
      if (
        sheet &&
        typeof sheet.getName === 'function' &&
        sheet.getName() !== CONFIG.sheets.logSheetName
      ) {
        throw new Error(
          `Log writer resolved wrong sheet: ${sheet.getName()} instead of ${CONFIG.sheets.logSheetName}.`
        );
      }

      const row = [
        new Date(),
        level || '',
        status || '',
        messageId || '',
        filename || '',
        details || '',
        link || ''
      ];
      const nextRow = sheet.getLastRow() + 1;
      const clearWidth = Math.max(
        row.length,
        typeof sheet.getLastColumn === 'function' ? sheet.getLastColumn() : 0,
        typeof sheet.getMaxColumns === 'function' ? sheet.getMaxColumns() : 0
      );
      const validationRange = sheet.getRange(nextRow, 1, 1, clearWidth);
      const range = sheet.getRange(nextRow, 1, 1, row.length);

      if (typeof validationRange.clearDataValidations === 'function') {
        validationRange.clearDataValidations();
      }

      range.setValues([row]);
    } catch (err) {
      Logger.log('LOG_WRITE_FAILED');
      Logger.log(err && err.stack ? err.stack : String(err));

      Logger.log([
        level || '',
        status || '',
        messageId || '',
        filename || '',
        details || '',
        link || ''
      ].join(' | '));
    }
  }
};
