const SummaryEmailService = {
  STATUS_SENT: 'SENT',
  STATUS_SENDING: 'SENDING',
  STATUS_VALIDATION_FAILED: 'VALIDATION_FAILED',
  STATUS_SEND_FAILED_BLOCKED: 'SEND_FAILED_BLOCKED',
  STATUS_UNKNOWN: 'UNKNOWN',

  sentProtectionDescription: 'HX Part Picks sent email lock',
  mailSenderForTest_: null,
  driveFileGetterForTest_: null,
  spreadsheetUrlForTest_: null,
  ledgerForTest_: null,

  sendSummaryRowFromEdit(e, lock) {
    try {
      const range = e.range;
      this.sendSummaryRowEmail(range.getSheet(), range.getRow());
    } finally {
      lock.releaseLock();
    }
  },

  sendSummaryRowEmail(sheet, rowNumber) {
    this.validateTarget_(sheet, rowNumber);

    const context = this.createRowContext_(sheet, rowNumber);
    const sendKey = this.buildSendKey_(context);
    const existingEntry = this.getLedgerEntry_(sendKey);

    if (existingEntry && existingEntry.status === this.STATUS_SENT) {
      this.setValue_(context, 'Send Email', true);
      this.protectSentEmailCells_(context);
      return {
        status: 'already_sent'
      };
    }

    if (existingEntry && this.isDuplicateBlockingStatus_(existingEntry.status)) {
      this.setValue_(context, 'Send Email', false);
      return {
        status: 'blocked'
      };
    }

    let email;

    try {
      email = this.buildEmail_(context);
    } catch (err) {
      this.writeLedgerEntry_(sendKey, context, {
        status: this.STATUS_VALIDATION_FAILED,
        error: this.stringifyError_(err)
      });
      this.setValue_(context, 'Send Email', false);
      return {
        status: 'validation_failed',
        error: this.stringifyError_(err)
      };
    }

    this.writeLedgerEntry_(sendKey, context, {
      status: this.STATUS_SENDING,
      reservedAt: new Date(),
      recipient: email.to,
      pdfFileId: email.pdfFileId,
      subject: email.subject,
      error: ''
    });
    SpreadsheetApp.flush();

    try {
      this.sendMail_(email);

      this.writeLedgerEntry_(sendKey, context, {
        status: this.STATUS_SENT,
        sentAt: new Date(),
        recipient: email.to,
        pdfFileId: email.pdfFileId,
        subject: email.subject,
        error: ''
      });
      this.setValue_(context, 'Send Email', true);

      this.protectSentEmailCells_(context);

      return {
        status: 'sent',
        subject: email.subject
      };
    } catch (err) {
      this.writeLedgerEntry_(sendKey, context, {
        status: this.STATUS_SEND_FAILED_BLOCKED,
        recipient: email.to,
        pdfFileId: email.pdfFileId,
        subject: email.subject,
        error: this.stringifyError_(err)
      });
      this.setValue_(context, 'Send Email', false);

      return {
        status: 'send_failed_blocked',
        error: this.stringifyError_(err)
      };
    }
  },

  buildSendKey_(context) {
    const summaryKey = String(context.value('_Key') || '').trim();
    const recipient = this.getRecipient_();
    const pdfUrl = this.extractPdfUrl_(context.range('PDF'));
    const pdfFileId = this.extractDriveFileId_(pdfUrl);

    if (!summaryKey) {
      throw new Error('Summary _Key is missing; cannot build durable email send key.');
    }

    return [
      summaryKey,
      recipient,
      pdfFileId || 'NO_PDF'
    ].join('::');
  },

  validateTarget_(sheet, rowNumber) {
    if (!sheet) {
      throw new Error('Summary email send requires a sheet.');
    }

    if (sheet.getName() !== CONFIG.summary.sheetName) {
      throw new Error(`Summary email send requires ${CONFIG.summary.sheetName}.`);
    }

    const dataStartRow = Number(CONFIG.summary.headerRow || 2) + 1;

    if (rowNumber < dataStartRow) {
      throw new Error(`Summary email send requires a data row: ${rowNumber}.`);
    }
  },

  createRowContext_(sheet, rowNumber) {
    const headerRow = Number(CONFIG.summary.headerRow || 2);
    const lastColumn = sheet.getLastColumn();
    const headers = sheet
      .getRange(headerRow, 1, 1, lastColumn)
      .getValues()[0]
      .map(header => String(header || '').trim());
    const values = sheet
      .getRange(rowNumber, 1, 1, lastColumn)
      .getValues()[0];
    const displayValues = sheet
      .getRange(rowNumber, 1, 1, lastColumn)
      .getDisplayValues()[0];

    return {
      sheet,
      rowNumber,
      headerRow,
      headers,
      values,
      displayValues,

      columnIndex(headerName) {
        return SummaryEmailService.getColumnIndex_(headers, headerName);
      },

      value(headerName) {
        const col = this.columnIndex(headerName);
        return col > 0 ? values[col - 1] : '';
      },

      displayValue(headerName) {
        const col = this.columnIndex(headerName);
        return col > 0 ? displayValues[col - 1] : '';
      },

      range(headerName) {
        const col = this.columnIndex(headerName);

        if (col <= 0) {
          throw new Error(`Required summary email column not found: ${headerName}.`);
        }

        return sheet.getRange(rowNumber, col);
      }
    };
  },

  getColumnIndex_(headers, headerName) {
    return headers.indexOf(headerName) + 1;
  },

  isDuplicateBlockingStatus_(status) {
    const normalized = this.normalizeStatus_(status);

    return !!normalized && normalized !== this.STATUS_VALIDATION_FAILED;
  },

  normalizeStatus_(status) {
    return String(status || '').trim().toUpperCase();
  },

  buildEmail_(context) {
    const recipient = this.getRecipient_();
    const pdf = this.resolvePdfAttachment_(context);
    const subject = this.buildSubject_(context);
    const body = this.buildBody_(context, pdf.url);

    return {
      to: recipient,
      subject,
      body,
      attachments: [pdf.blob],
      pdfFileId: pdf.fileId
    };
  },

  getRecipient_() {
    const recipient = CONFIG.summaryEmail && CONFIG.summaryEmail.recipient;

    if (!recipient) {
      throw new Error('Summary email recipient is not configured.');
    }

    return recipient;
  },

  buildSubject_(context) {
    const member = this.safeSubjectPart_(
      context.displayValue('Member') || context.value('Member'),
      '(blank member)'
    );
    const order = this.safeSubjectPart_(
      context.displayValue('Order No.') || context.value('Order No.'),
      '(blank order)'
    );

    return `HX Part Pick: ${member} - ${order}`;
  },

  safeSubjectPart_(value, placeholder) {
    const text = String(value || '').trim();

    return text || placeholder;
  },

  buildBody_(context, pdfUrl) {
    const spreadsheetUrl = this.getSpreadsheetUrl_();
    const detailHeaders = [
      'Carrier',
      'State',
      'Customer Name',
      'Member',
      'Owner',
      'Order No.',
      'Location',
      'C Number',
      'B Number',
      'Date Completed',
      'SLA',
    ];
    const lines = [
      'HX Part Pick',
      '',
      `Spreadsheet: ${spreadsheetUrl}`,
      `PDF: ${pdfUrl}`,
      '',
      'Row Details:'
    ];

    detailHeaders.forEach(header => {
      if (context.columnIndex(header) <= 0) {
        return;
      }

      lines.push(`${header}: ${context.displayValue(header) || ''}`);
    });

    const validationNote = this.getValidationNote_(context);

    if (validationNote) {
      lines.push('');
      lines.push('Validation / Status Note:');
      lines.push(validationNote);
    }

    return lines.join('\n');
  },

  getValidationNote_(context) {
    if (context.columnIndex('*') <= 0) {
      return '';
    }

    try {
      return String(context.range('*').getNote() || '').trim();
    } catch (err) {
      return '';
    }
  },

  resolvePdfAttachment_(context) {
    const pdfRange = context.range('PDF');
    const url = this.extractPdfUrl_(pdfRange);

    if (!url) {
      throw new Error('PDF Drive link is missing or could not be read from the Summary PDF column.');
    }

    const fileId = this.extractDriveFileId_(url);

    if (!fileId) {
      throw new Error(`Could not extract a Drive file ID from PDF link: ${url}`);
    }

    let file;

    try {
      file = this.getDriveFileById_(fileId);
    } catch (err) {
      throw new Error(`Could not read PDF file from Drive: ${this.stringifyError_(err)}`);
    }

    const mimeType = typeof file.getMimeType === 'function'
      ? String(file.getMimeType() || '')
      : '';

    if (mimeType && mimeType !== MimeType.PDF && mimeType !== 'application/pdf') {
      throw new Error(`Drive file is not a PDF: ${mimeType}`);
    }

    const blob = file.getBlob();

    if (typeof blob.setName === 'function' && typeof file.getName === 'function') {
      blob.setName(file.getName());
    }

    return {
      url,
      fileId,
      blob
    };
  },

  extractPdfUrl_(range) {
    const richTextUrl = this.extractRichTextUrl_(range);

    if (richTextUrl) {
      return richTextUrl;
    }

    const formulaUrl = this.extractHyperlinkFormulaUrl_(range);

    if (formulaUrl) {
      return formulaUrl;
    }

    try {
      const value = String(range.getValue ? range.getValue() : '').trim();

      if (this.looksLikeDriveUrl_(value)) {
        return value;
      }
    } catch (err) {
      // Fall through to display value.
    }

    try {
      const displayValue = String(range.getDisplayValue ? range.getDisplayValue() : '').trim();

      if (this.looksLikeDriveUrl_(displayValue)) {
        return displayValue;
      }
    } catch (err) {
      // No usable PDF URL found.
    }

    return '';
  },

  extractRichTextUrl_(range) {
    try {
      if (typeof range.getRichTextValue !== 'function') {
        return '';
      }

      const richText = range.getRichTextValue();

      if (!richText || typeof richText.getLinkUrl !== 'function') {
        return '';
      }

      return String(richText.getLinkUrl() || '').trim();
    } catch (err) {
      return '';
    }
  },

  extractHyperlinkFormulaUrl_(range) {
    try {
      if (typeof range.getFormula !== 'function') {
        return '';
      }

      const formula = String(range.getFormula() || '').trim();
      const match = formula.match(/^=HYPERLINK\("((?:[^"]|"")*)"/i);

      return match ? match[1].replace(/""/g, '"') : '';
    } catch (err) {
      return '';
    }
  },

  looksLikeDriveUrl_(value) {
    return /^https:\/\/(?:drive|docs)\.google\.com\//i.test(String(value || ''));
  },

  extractDriveFileId_(url) {
    const text = String(url || '').trim();
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
      /\/d\/([a-zA-Z0-9_-]{10,})/,
      /[?&]id=([a-zA-Z0-9_-]{10,})/
    ];

    for (let index = 0; index < patterns.length; index++) {
      const match = text.match(patterns[index]);

      if (match) {
        return match[1];
      }
    }

    if (/^[a-zA-Z0-9_-]{25,}$/.test(text)) {
      return text;
    }

    return '';
  },

  setValue_(context, headerName, value) {
    context.range(headerName).setValue(value);
  },

  getLedgerEntry_(sendKey) {
    if (this.ledgerForTest_) {
      return this.ledgerForTest_[sendKey] || null;
    }

    const sheet = this.getLedgerSheet_();
    const rowNumber = this.findLedgerRow_(sheet, sendKey);

    if (rowNumber <= 0) {
      return null;
    }

    const row = sheet.getRange(rowNumber, 1, 1, 10).getValues()[0];

    return {
      sendKey: row[0],
      summaryKey: row[1],
      recipient: row[2],
      pdfFileId: row[3],
      status: this.normalizeStatus_(row[4]),
      reservedAt: row[5],
      sentAt: row[6],
      updatedAt: row[7],
      error: row[8],
      subject: row[9]
    };
  },

  writeLedgerEntry_(sendKey, context, entry) {
    const summaryKey = String(context.value('_Key') || '').trim();
    const existing = this.getLedgerEntry_(sendKey) || {};
    const merged = Object.assign({}, existing, entry || {});
    const row = [
      sendKey,
      summaryKey,
      merged.recipient || existing.recipient || this.getRecipient_(),
      merged.pdfFileId || existing.pdfFileId || '',
      this.normalizeStatus_(merged.status),
      merged.reservedAt || existing.reservedAt || '',
      merged.sentAt || existing.sentAt || '',
      new Date(),
      merged.error || '',
      merged.subject || existing.subject || ''
    ];

    if (this.ledgerForTest_) {
      this.ledgerForTest_[sendKey] = {
        sendKey: row[0],
        summaryKey: row[1],
        recipient: row[2],
        pdfFileId: row[3],
        status: row[4],
        reservedAt: row[5],
        sentAt: row[6],
        updatedAt: row[7],
        error: row[8],
        subject: row[9]
      };
      return;
    }

    const sheet = this.getLedgerSheet_();
    const rowNumber = this.findLedgerRow_(sheet, sendKey);

    if (rowNumber > 0) {
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      return;
    }

    sheet.appendRow(row);
  },

  getLedgerSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = CONFIG.sheets.summaryEmailLedgerSheetName;
    const sheet = ss && ss.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(`Summary email ledger sheet is missing: ${sheetName}. Run setup() before sending summary email.`);
    }

    return sheet;
  },

  findLedgerRow_(sheet, sendKey) {
    if (!sheet || sheet.getLastRow() < 2) {
      return 0;
    }

    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 1)
      .getValues();

    for (let index = 0; index < values.length; index++) {
      if (String(values[index][0] || '') === sendKey) {
        return index + 2;
      }
    }

    return 0;
  },

  sendMail_(email) {
    if (this.mailSenderForTest_) {
      if (typeof this.mailSenderForTest_ === 'function') {
        this.mailSenderForTest_(email);
        return;
      }

      this.mailSenderForTest_.send(email);
      return;
    }

    MailApp.sendEmail(email.to, email.subject, email.body, {
      attachments: email.attachments,
      name: CONFIG.appName
    });
  },

  setMailSenderForTest_(sender) {
    this.mailSenderForTest_ = sender;
  },

  setDriveFileGetterForTest_(getter) {
    this.driveFileGetterForTest_ = getter;
  },

  setSpreadsheetUrlForTest_(url) {
    this.spreadsheetUrlForTest_ = url;
  },

  setLedgerForTest_(ledger) {
    this.ledgerForTest_ = ledger;
  },

  resetTestDoubles_() {
    this.mailSenderForTest_ = null;
    this.driveFileGetterForTest_ = null;
    this.spreadsheetUrlForTest_ = null;
    this.ledgerForTest_ = null;
  },

  getDriveFileById_(fileId) {
    if (this.driveFileGetterForTest_) {
      return this.driveFileGetterForTest_(fileId);
    }

    return DriveApp.getFileById(fileId);
  },

  getSpreadsheetUrl_() {
    if (this.spreadsheetUrlForTest_) {
      return this.spreadsheetUrlForTest_;
    }

    return SpreadsheetApp.getActiveSpreadsheet().getUrl();
  },

  protectSentEmailCells_(context) {
    [
      'Send Email'
    ].forEach(headerName => {
      try {
        const range = context.range(headerName);
        const protection = range.protect();

        protection.setDescription(this.sentProtectionDescription);

        if (
          typeof protection.setWarningOnly === 'function' &&
          typeof protection.isWarningOnly === 'function' &&
          protection.isWarningOnly()
        ) {
          protection.setWarningOnly(false);
        }

        this.disableDomainEditing_(protection);
        this.keepOnlyEffectiveUserEditor_(protection);
      } catch (err) {
        this.logProtectionError_(context, headerName, err);
      }
    });
  },

  disableDomainEditing_(protection) {
    try {
      if (
        typeof protection.canDomainEdit === 'function' &&
        protection.canDomainEdit()
      ) {
        protection.setDomainEdit(false);
      }
    } catch (err) {
      Logger.log(`Could not disable domain editing on sent email lock: ${this.stringifyError_(err)}`);
    }
  },

  keepOnlyEffectiveUserEditor_(protection) {
    const effectiveUser = Session.getEffectiveUser();
    const effectiveEmail = this.getUserEmail_(effectiveUser);

    if (!effectiveEmail) {
      return;
    }

    try {
      if (typeof protection.addEditor === 'function') {
        protection.addEditor(effectiveUser);
      }
    } catch (err) {
      Logger.log(`Could not add effective user to sent email lock: ${this.stringifyError_(err)}`);
    }

    try {
      if (
        typeof protection.getEditors !== 'function' ||
        typeof protection.removeEditors !== 'function'
      ) {
        return;
      }

      const removableEditors = protection
        .getEditors()
        .filter(editor => this.getUserEmail_(editor) !== effectiveEmail);

      if (removableEditors.length > 0) {
        protection.removeEditors(removableEditors);
      }
    } catch (err) {
      Logger.log(`Could not remove extra editors from sent email lock: ${this.stringifyError_(err)}`);
    }
  },

  getUserEmail_(user) {
    if (!user || typeof user.getEmail !== 'function') {
      return '';
    }

    return String(user.getEmail() || '').toLowerCase();
  },

  logProtectionError_(context, headerName, err) {
    const message = [
      `Could not protect sent email cell ${headerName}`,
      `row ${context.rowNumber}:`,
      this.stringifyError_(err)
    ].join(' ');

    if (
      typeof LogService !== 'undefined' &&
      typeof LogService.error === 'function'
    ) {
      LogService.error('SUMMARY_EMAIL_LOCK_FAILED', '', '', message, '');
      return;
    }

    Logger.log(message);
  },

  stringifyError_(err) {
    if (!err) return '';

    if (err.stack) {
      return String(err.stack);
    }

    if (err.message) {
      return String(err.message);
    }

    return String(err);
  }
};
