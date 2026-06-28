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

    if (this.hasSentMarker_(context)) {
      this.setValue_(context, 'Send Email', true);
      return {
        status: 'already_sent'
      };
    }

    if (this.isDuplicateBlockingStatus_(context.value('Email Status'))) {
      this.setValue_(context, 'Send Email', true);
      return {
        status: 'blocked'
      };
    }

    let email;

    try {
      email = this.buildEmail_(context);
    } catch (err) {
      this.writeValidationFailure_(context, err);
      return {
        status: 'validation_failed',
        error: this.stringifyError_(err)
      };
    }

    this.setValue_(context, 'Email Status', this.STATUS_SENDING);
    this.setValue_(context, 'Email Error', '');
    SpreadsheetApp.flush();

    try {
      this.sendMail_(email);

      this.setValue_(context, 'Email Sent At', new Date());
      this.setValue_(context, 'Email Sent To', email.to);
      this.setValue_(context, 'Email Status', this.STATUS_SENT);
      this.setValue_(context, 'Email Error', '');
      this.setValue_(context, 'Send Email', true);

      this.protectSentEmailCells_(context);

      return {
        status: 'sent',
        subject: email.subject
      };
    } catch (err) {
      this.setValue_(context, 'Email Status', this.STATUS_SEND_FAILED_BLOCKED);
      this.setValue_(context, 'Email Error', this.stringifyError_(err));
      this.setValue_(context, 'Send Email', false);

      return {
        status: 'send_failed_blocked',
        error: this.stringifyError_(err)
      };
    }
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

  hasSentMarker_(context) {
    if (context.value('Email Sent At')) {
      return true;
    }

    return this.normalizeStatus_(context.value('Email Status')) === this.STATUS_SENT;
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
      attachments: [pdf.blob]
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
      'Email Sent At',
      'Email Sent To',
      'Email Status',
      'Email Error'
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

  writeValidationFailure_(context, err) {
    this.setValue_(context, 'Email Status', this.STATUS_VALIDATION_FAILED);
    this.setValue_(context, 'Email Error', this.stringifyError_(err));
    this.setValue_(context, 'Send Email', false);
  },

  setValue_(context, headerName, value) {
    context.range(headerName).setValue(value);
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

  resetTestDoubles_() {
    this.mailSenderForTest_ = null;
    this.driveFileGetterForTest_ = null;
    this.spreadsheetUrlForTest_ = null;
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
      'Send Email',
      'Email Sent At',
      'Email Sent To',
      'Email Status',
      'Email Error'
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
