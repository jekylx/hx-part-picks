const SheetService = {
  setupSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    this.setupPartPicks_(ss);
    this.setupLog_(ss);
    this.setupProcessed_(ss);
    this.setupConfiguration_(ss);
  },

  appendPartPickRow(ctx) {
    const sheet = this.getSheet_(CONFIG.sheets.extractedSheetName);
    const form = ctx.form || {};

    const fieldValues = CONFIG.fields.map(field =>
      form[field.key] == null ? '' : form[field.key]
    );

    sheet.appendRow([
      ctx.processingKey,
      new Date(),
      ctx.message.getDate(),
      ctx.message.getId(),
      ctx.pdf.getName(),
      ctx.archiveFile ? ctx.archiveFile.getUrl() : '',
      ctx.extractionStatus || '',
      ...fieldValues
    ]);
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
      if (sheet.getName() !== CONFIG.summary.sheetName) {
        sheet.hideSheet();
      }
    });
  },

  ensureHeaders_(sheet, headers) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
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

      sheet.appendRow([
        new Date(),
        level || '',
        status || '',
        messageId || '',
        filename || '',
        details || '',
        link || ''
      ]);
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