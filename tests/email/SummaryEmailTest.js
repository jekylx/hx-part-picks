/**
 * SummaryEmailTest.js — Send Email content and validation blocking:
 * edit filtering, missing PDF/product/link blocks, subject/body/attachment.
 */

function getSummaryEmailTestCases_() {
  return [
    { name: 'Summary send email edit handler filters edits strictly', fn: testSummarySendEmailEditFilter_, suite: 'summary_email' },
    { name: 'Summary send email missing PDF blocks send', fn: testSummarySendEmailMissingPdfBlocks_, suite: 'summary_email' },
    { name: 'Summary send email missing product fields block send', fn: testSummarySendEmailMissingProductFieldsBlock_, suite: 'summary_email' },
    { name: 'Summary send email missing links block send', fn: testSummarySendEmailMissingLinksBlock_, suite: 'summary_email' },
    { name: 'Summary send email non-displayed fields do not block send', fn: testSummarySendEmailNonDisplayedFieldsDoNotBlock_, suite: 'summary_email' },
    { name: 'Summary send email subject uses placeholders', fn: testSummarySendEmailSubjectPlaceholders_, suite: 'summary_email' },
    { name: 'Summary send email body includes links', fn: testSummarySendEmailBodyIncludesLinks_, suite: 'summary_email' },
    { name: 'Summary send email attaches PDF blob', fn: testSummarySendEmailAttachesPdfBlob_, suite: 'summary_email' }
  ];
}

function testSummarySendEmailEditFilter_() {
  const sendCol = CONFIG.summary.columns.length + 1;

  assertEquals_(
    false,
    isSummarySendEmailEdit_(null),
    'Missing edit event should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      sheetName: 'Wrong Sheet',
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Wrong sheet should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol - 1,
      value: 'TRUE'
    })),
    'Wrong column should be ignored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow,
      col: sendCol,
      value: 'TRUE'
    })),
    'Header row should be ignored.'
  );

  assertEquals_(
    true,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'FALSE'
    })),
    'Unchecked Email edits should be accepted so sent rows can be restored.'
  );

  assertEquals_(
    false,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE',
      numRows: 2
    })),
    'Multi-row edit should be ignored.'
  );

  assertEquals_(
    true,
    isSummarySendEmailEdit_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Checked Email data-row edit should be accepted.'
  );

  assertEquals_(
    'send_email',
    getSummaryEditRoute_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'TRUE'
    })),
    'Edit router should route Email edits.'
  );

  assertEquals_(
    'send_email',
    getSummaryEditRoute_(buildMockSummarySendEmailEditEvent_({
      row: CONFIG.summary.headerRow + 1,
      col: sendCol,
      value: 'FALSE'
    })),
    'Edit router should route unchecked Email edits.'
  );
}

function testSummarySendEmailMissingPdfBlocks_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const result = runSummaryEmailServiceTest_({
    driveFileGetter() {
      throw new Error('missing file');
    }
  });

  assertEquals_('validation_failed', result.sendResult.status, 'Unreadable PDF should fail validation.');
  assertEquals_(0, result.sentEmails.length, 'Unreadable PDF should not send.');
  assertContains_(
    getOnlySummaryEmailLedgerEntry_(result.ledger).error,
    'missing file',
    'Unreadable PDF should write Drive error to ledger.'
  );
  assertEquals_(false, result.sheet.getValueByHeader(sendHeader), 'Unreadable PDF should reset checkbox.');
}

function testSummarySendEmailMissingProductFieldsBlock_() {
  [
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size'
  ].forEach(header => {
    const values = {};

    values[header] = '';

    assertSummaryEmailMissingFieldsBlocked_(
      runSummaryEmailServiceTest_({ values }),
      [header],
      `Missing ${header} should block Email.`
    );
  });
}

function testSummarySendEmailMissingLinksBlock_() {
  assertSummaryEmailMissingFieldsBlocked_(
    runSummaryEmailServiceTest_({
      values: {
        'PDF': ''
      },
      formulaByHeader: {
        'PDF': ''
      },
      richTextUrlByHeader: {
        'PDF': ''
      }
    }),
    ['PDF link'],
    'Missing PDF link should block Email.'
  );

  assertSummaryEmailMissingFieldsBlocked_(
    runSummaryEmailServiceTest_({
      spreadsheetUrl: ''
    }),
    ['Spreadsheet link'],
    'Missing spreadsheet link should block Email.'
  );
}

function testSummarySendEmailNonDisplayedFieldsDoNotBlock_() {
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  const result = runSummaryEmailServiceTest_({
    values: {
      'Date Completed': '',
      'SLA': '',
      'Missing Units': '',
      [refreshHeader]: '',
      [sendHeader]: true
    },
    notesByHeader: {
      '*': '',
      'Notes': ''
    }
  });

  assertEquals_('sent', result.sendResult.status, 'Missing non-displayed fields should not block Email.');
  assertEquals_(1, result.sentEmails.length, 'Missing non-displayed fields should still allow one email.');
  assertEquals_(
    SummaryEmailService.STATUS_SENT,
    getOnlySummaryEmailLedgerEntry_(result.ledger).status,
    'Missing non-displayed fields should still create SENT ledger entry.'
  );
}

function testSummarySendEmailSubjectPlaceholders_() {
  const sheet = buildMockSummaryEmailSheet_({
    values: {
      'Member': '',
      'Order No.': ''
    }
  });
  const context = SummaryEmailService.createRowContext_(
    sheet,
    CONFIG.summary.headerRow + 1
  );

  assertEquals_(
    'HX Part Pick: (blank member) - (blank order)',
    SummaryEmailService.buildSubject_(context),
    'Blank subject fields should use placeholders.'
  );
}

function testSummarySendEmailBodyIncludesLinks_() {
  const result = runSummaryEmailServiceTest_({});
  const body = result.sentEmails[0].body;

  assertContains_(body, 'HX Part Pick', 'Email body should include heading.');
  assertContains_(body, 'Spreadsheet: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit', 'Email body should include spreadsheet link.');
  assertContains_(body, 'PDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view', 'Email body should include PDF link.');
  assertContains_(body, 'Carrier: AP', 'Email body should include row details.');
  assertContains_(body, 'Product Code: P001', 'Email body should include Product Code.');
  assertContains_(body, 'Product Description: Product One', 'Email body should include Product Description.');
  assertContains_(body, 'Vintage: 2020', 'Email body should include Vintage.');
  assertContains_(body, 'Bottle Size: 750ML', 'Email body should include Bottle Size.');
  assertNotContains_(body, 'Date Completed:', 'Email body should not include Date Completed.');
  assertNotContains_(body, 'SLA:', 'Email body should not include SLA.');
  assertNotContains_(body, 'Validation / Status Note:', 'Email body should not include validation note heading.');
  assertNotContains_(body, 'Validation note for test', 'Email body should not include validation note.');
  assertContains_(
    body,
    '\nSpreadsheet: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit\nPDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view',
    'Email body should end with inline spreadsheet and PDF links.'
  );
  assertEquals_(
    'PDF: https://drive.google.com/file/d/PDF_FILE_ID_1234567890/view',
    body.split('\n').pop(),
    'PDF link should be the final email body line.'
  );
}

function testSummarySendEmailAttachesPdfBlob_() {
  const result = runSummaryEmailServiceTest_({});
  const attachments = result.sentEmails[0].attachments;

  assertEquals_(1, attachments.length, 'Email should include one attachment.');
  assertEquals_('test.pdf', attachments[0].name, 'PDF blob should be attached and named.');
}
