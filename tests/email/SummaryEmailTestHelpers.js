/**
 * SummaryEmailTestHelpers.js — shared mocks/fixtures for Send Email tests:
 * mock summary email sheet/range, PDF drive file, edit events, ledger helpers,
 * and the runSummaryEmailServiceTest_ scenario driver.
 */

function runSummaryEmailServiceTest_(options) {
  const settings = options || {};
  const sentEmails = [];
  const ledger = settings.ledger || {};
  const sheet = buildMockSummaryEmailSheet_(settings);

  SummaryEmailService.setMailSenderForTest_(settings.mailSender || function(email) {
    sentEmails.push(email);
  });
  SummaryEmailService.setDriveFileGetterForTest_(settings.driveFileGetter || function(fileId) {
    return buildMockPdfDriveFile_(fileId);
  });
  SummaryEmailService.setSpreadsheetUrlForTest_(
    Object.prototype.hasOwnProperty.call(settings, 'spreadsheetUrl')
      ? settings.spreadsheetUrl
      : 'https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit'
  );
  SummaryEmailService.setLedgerForTest_(ledger);

  try {
    return {
      sheet,
      sentEmails,
      ledger,
      sendResult: SummaryEmailService.sendSummaryRowEmail(
        sheet,
        settings.rowNumber || CONFIG.summary.headerRow + 1
      )
    };
  } finally {
    SummaryEmailService.resetTestDoubles_();
  }
}

function buildTestSummaryEmailSendKey_() {
  return [
    TEST_PREFIX + 'SUMMARY_EMAIL',
    CONFIG.summaryEmail.recipient,
    'PDF_FILE_ID_1234567890'
  ].join('::');
}

function getOnlySummaryEmailLedgerEntry_(ledger) {
  const keys = Object.keys(ledger || {});

  assertEquals_(1, keys.length, 'Expected exactly one summary email ledger entry.');

  return ledger[keys[0]];
}

function assertSummaryEmailMissingFieldsBlocked_(result, missingFields, message) {
  const sendHeader = summarySendEmailHeaderForTest_();
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('validation_failed', result.sendResult.status, message);
  assertEquals_(0, result.sentEmails.length, `${message} Email should not be sent.`);
  assertEquals_(false, result.sheet.getValueByHeader(sendHeader), `${message} ${sendHeader} checkbox should reset unchecked.`);
  assertEquals_(
    SummaryEmailService.STATUS_VALIDATION_FAILED,
    ledgerEntry.status,
    `${message} Ledger should record validation failure.`
  );
  assertNotEquals_(
    SummaryEmailService.STATUS_SENT,
    ledgerEntry.status,
    `${message} Ledger must not record SENT.`
  );
  assertContains_(
    ledgerEntry.error,
    'Missing required email fields',
    `${message} Ledger should include missing-fields reason.`
  );

  missingFields.forEach(field => {
    assertContains_(
      ledgerEntry.error,
      field,
      `${message} Ledger should name missing field ${field}.`
    );
  });
}

function buildMockSummaryEmailSheet_(options) {
  const settings = options || {};
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  const headers = [
    '_Key',
    ...CONFIG.summary.columns.map(column => column.header)
  ];
  const rowValues = headers.map(header => {
    const defaults = {
      '_Key': TEST_PREFIX + 'SUMMARY_EMAIL',
      '*': '',
      'PDF': 'Open PDF',
      'Scanned At': new Date('2026-06-01T09:30:00+10:00'),
      'Carrier': 'AP',
      'State': 'VIC',
      'Customer Name': 'Example Customer',
      'Member': 'MEM123',
      'Owner': 'OWN01',
      'Order No.': '1234567',
      'Location': '1G20E2',
      'C Number': 'C123456',
      'B Number': 'B1234567',
      'Product Code': 'P001',
      'Product Description': 'Product One',
      'Vintage': '2020',
      'Bottle Size': '750ML',
      'Date Completed': '2026-06-01',
      'SLA': '0.5',
      [refreshHeader]: false,
      'Email Sent At': '',
      'Email Sent To': '',
      'Email Status': '',
      'Email Error': '',
      [sendHeader]: true
    };

    const overrides = settings.values || {};

    return Object.prototype.hasOwnProperty.call(overrides, header)
      ? overrides[header]
      : defaults[header] || '';
  });
  const notesByHeader = Object.assign(
    {
      '*': 'Validation note for test'
    },
    settings.notesByHeader || {}
  );
  const formulaByHeader = Object.assign(
    {
      'PDF': '=HYPERLINK("https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view","Open PDF")'
    },
    settings.formulaByHeader || {}
  );
  const richTextUrlByHeader = settings.richTextUrlByHeader || {};
  const protections = [];
  const sheet = {
    getName: () => settings.sheetName || CONFIG.summary.sheetName,
    getLastColumn: () => headers.length,
    getRange(row, col, rowCount, colCount) {
      return buildMockSummaryEmailRange_({
        sheet,
        headers,
        rowValues,
        notesByHeader,
        formulaByHeader,
        richTextUrlByHeader,
        protections,
        row,
        col,
        rowCount: rowCount || 1,
        colCount: colCount || 1
      });
    },
    getValueByHeader(headerName) {
      return rowValues[headers.indexOf(headerName)];
    },
    protections
  };

  return sheet;
}

function buildMockSummaryEmailRange_(state) {
  const headerName = state.headers[state.col - 1];

  return {
    getSheet() {
      return state.sheet;
    },
    getRow() {
      return state.row;
    },
    getColumn() {
      return state.col;
    },
    getNumRows() {
      return state.rowCount;
    },
    getNumColumns() {
      return state.colCount;
    },
    getValues() {
      if (state.row === Number(CONFIG.summary.headerRow || 2)) {
        return [state.headers.slice(state.col - 1, state.col - 1 + state.colCount)];
      }

      return [state.rowValues.slice(state.col - 1, state.col - 1 + state.colCount)];
    },
    getDisplayValues() {
      if (state.row === Number(CONFIG.summary.headerRow || 2)) {
        return [state.headers.slice(state.col - 1, state.col - 1 + state.colCount)];
      }

      return [state.rowValues
        .slice(state.col - 1, state.col - 1 + state.colCount)
        .map(value => value instanceof Date ? value.toISOString() : String(value || ''))];
    },
    getValue() {
      return state.rowValues[state.col - 1];
    },
    getDisplayValue() {
      const value = state.rowValues[state.col - 1];

      return value instanceof Date ? value.toISOString() : String(value || '');
    },
    setValue(value) {
      state.rowValues[state.col - 1] = value;
      return this;
    },
    getFormula() {
      return state.formulaByHeader[headerName] || '';
    },
    getRichTextValue() {
      const url = state.richTextUrlByHeader[headerName] || '';

      return {
        getLinkUrl: () => url
      };
    },
    getNote() {
      return state.notesByHeader[headerName] || '';
    },
    protect() {
      const protection = buildMockProtection_(SummaryEmailService.sentProtectionDescription);

      state.protections.push({
        headerName,
        protection
      });

      return protection;
    }
  };
}

function buildMockPdfDriveFile_(fileId) {
  const blob = {
    fileId,
    name: '',
    setName(name) {
      this.name = name;
      return this;
    }
  };

  return {
    getMimeType: () => MimeType.PDF,
    getName: () => 'test.pdf',
    getBlob: () => blob
  };
}

function buildMockSummarySendEmailEditEvent_(options) {
  const sendCol = options.sendCol || CONFIG.summary.columns.length + 1;
  const headers = new Array(Math.max(sendCol, options.col || sendCol)).fill('');

  headers[0] = '_Key';
  headers[sendCol - 1] = summarySendEmailHeaderForTest_();

  const sheet = buildMockSummarySheet_(options.sheetName, headers);
  const range = {
    valueSet: undefined,
    getNumRows: () => options.numRows || 1,
    getNumColumns: () => options.numCols || 1,
    getSheet: () => sheet,
    getRow: () => options.row,
    getColumn: () => options.col,
    setValue(value) {
      this.valueSet = value;
    }
  };

  return {
    range,
    value: options.value
  };
}
