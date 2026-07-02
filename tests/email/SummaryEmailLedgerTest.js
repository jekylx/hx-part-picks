/**
 * SummaryEmailLedgerTest.js — Send Email ledger/dedupe protection:
 * one send per row, sent checkbox restored after manual uncheck,
 * blocked states, no duplicate sends. Do not weaken these.
 */

function getSummaryEmailLedgerTestCases_() {
  return [
    { name: 'Summary send email handler sends valid row once', fn: testSummarySendEmailSendsValidRowOnce_, suite: 'summary_email' },
    { name: 'Summary send email ledger prevents duplicate', fn: testSummarySendEmailSentLedgerPreventsDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email manual uncheck after sent is restored', fn: testSummarySendEmailManualUncheckAfterSentRestored_, suite: 'summary_email' },
    { name: 'Summary send email edit handler restores sent uncheck without duplicate', fn: testSummarySendEmailEditHandlerRestoresSentUncheckWithoutDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email blocking status prevents duplicate', fn: testSummarySendEmailBlockingStatusPreventsDuplicate_, suite: 'summary_email' },
    { name: 'Summary send email validation failure resets checkbox', fn: testSummarySendEmailValidationFailureResets_, suite: 'summary_email' },
    { name: 'Summary send email exception records blocked state', fn: testSummarySendEmailExceptionBlocksRetry_, suite: 'summary_email' }
  ];
}

function testSummarySendEmailSendsValidRowOnce_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const result = runSummaryEmailServiceTest_({});
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('sent', result.sendResult.status, 'Valid row should send.');
  assertEquals_(1, result.sentEmails.length, 'Valid row should send exactly once.');
  assertEquals_(
    SummaryEmailService.STATUS_SENT,
    ledgerEntry.status,
    'Successful send should mark SENT in the internal ledger.'
  );
  assertTruthy_(ledgerEntry.sentAt, 'Successful send should set sent timestamp in ledger.');
  assertEquals_(
    CONFIG.summaryEmail.recipient,
    ledgerEntry.recipient,
    'Successful send should record recipient in ledger.'
  );
  assertEquals_(true, result.sheet.getValueByHeader(sendHeader), 'Successful send should leave checkbox checked.');
  assertEquals_(1, result.sheet.protections.length, 'Successful send should best-effort protect the sent checkbox.');
  assertEquals_(sendHeader, result.sheet.protections[0].headerName, `Sent checkbox protection should target ${sendHeader}.`);
  assertEquals_('', ledgerEntry.error, 'Successful send should clear ledger error.');
}

function testSummarySendEmailSentLedgerPreventsDuplicate_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const sendKey = buildTestSummaryEmailSendKey_();
  const result = runSummaryEmailServiceTest_({
    ledger: {
      [sendKey]: {
        sendKey,
        status: SummaryEmailService.STATUS_SENT
      }
    }
  });

  assertEquals_('already_sent', result.sendResult.status, 'SENT ledger status should skip send.');
  assertEquals_(0, result.sentEmails.length, 'SENT ledger status should not send.');
  assertEquals_(true, result.sheet.getValueByHeader(sendHeader), 'Already sent row should remain checked.');
}

function testSummarySendEmailManualUncheckAfterSentRestored_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const sendKey = buildTestSummaryEmailSendKey_();
  const result = runSummaryEmailServiceTest_({
    values: {
      [sendHeader]: false
    },
    ledger: {
      [sendKey]: {
        sendKey,
        status: SummaryEmailService.STATUS_SENT,
        sentAt: new Date('2026-06-01T10:00:00+10:00')
      }
    }
  });

  assertEquals_('already_sent', result.sendResult.status, 'Sent ledger status should skip send.');
  assertEquals_(0, result.sentEmails.length, 'Manual uncheck after sent should not resend.');
  assertEquals_(true, result.sheet.getValueByHeader(sendHeader), 'Manual uncheck after sent should be restored.');
}

function testSummarySendEmailEditHandlerRestoresSentUncheckWithoutDuplicate_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const sendKey = buildTestSummaryEmailSendKey_();
  const sentEmails = [];
  const ledger = {
    [sendKey]: {
      sendKey,
      summaryKey: TEST_PREFIX + 'SUMMARY_EMAIL',
      recipient: CONFIG.summaryEmail.recipient,
      status: SummaryEmailService.STATUS_SENT,
      sentAt: new Date('2026-06-01T10:00:00+10:00')
    }
  };
  const sheet = buildMockSummaryEmailSheet_({
    values: {
      [sendHeader]: false
    }
  });
  const lock = buildMockLock_();
  const range = sheet.getRange(
    CONFIG.summary.headerRow + 1,
    getColumnIndex_(['_Key', ...CONFIG.summary.columns.map(column => column.header)], sendHeader)
  );

  SummaryEmailService.setMailSenderForTest_(email => {
    sentEmails.push(email);
  });
  SummaryEmailService.setDriveFileGetterForTest_(fileId => buildMockPdfDriveFile_(fileId));
  SummaryEmailService.setSpreadsheetUrlForTest_(
    'https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit'
  );
  SummaryEmailService.setLedgerForTest_(ledger);

  try {
    SummaryEmailService.sendSummaryRowFromEdit({
      range,
      value: 'FALSE'
    }, lock);
  } finally {
    SummaryEmailService.resetTestDoubles_();
  }

  assertEquals_(true, lock.released, 'Email edit handler should release the lock.');
  assertEquals_(0, sentEmails.length, 'Restoring a sent checkbox should not send a duplicate email.');
  assertEquals_(true, sheet.getValueByHeader(sendHeader), 'Sent unchecked edit should be immediately restored.');
  assertEquals_(SummaryEmailService.STATUS_SENT, ledger[sendKey].status, 'Sent ledger entry should remain successful.');
}

function testSummarySendEmailBlockingStatusPreventsDuplicate_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  [
    SummaryEmailService.STATUS_SENDING,
    SummaryEmailService.STATUS_UNKNOWN,
    SummaryEmailService.STATUS_SEND_FAILED_BLOCKED,
    'MANUAL_REVIEW'
  ].forEach(status => {
    const sendKey = buildTestSummaryEmailSendKey_();
    const result = runSummaryEmailServiceTest_({
      ledger: {
        [sendKey]: {
          sendKey,
          status
        }
      }
    });

    assertEquals_('blocked', result.sendResult.status, `${status} should block send.`);
    assertEquals_(0, result.sentEmails.length, `${status} should not send.`);
    assertEquals_(false, result.sheet.getValueByHeader(sendHeader), `${status} should reset checkbox.`);
  });
}

function testSummarySendEmailValidationFailureResets_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const result = runSummaryEmailServiceTest_({
    values: {
      'PDF': ''
    },
    formulaByHeader: {
      'PDF': ''
    }
  });
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('validation_failed', result.sendResult.status, 'Missing PDF should fail validation.');
  assertEquals_(0, result.sentEmails.length, 'Validation failure should not send.');
  assertEquals_(
    SummaryEmailService.STATUS_VALIDATION_FAILED,
    ledgerEntry.status,
    'Validation failure should set internal ledger status.'
  );
  assertContains_(
    ledgerEntry.error,
    'PDF link',
    'Validation failure should write missing PDF link error to ledger.'
  );
  assertEquals_(false, result.sheet.getValueByHeader(sendHeader), 'Validation failure should reset checkbox.');
}

function testSummarySendEmailExceptionBlocksRetry_() {
  const sendHeader = summarySendEmailHeaderForTest_();
  const result = runSummaryEmailServiceTest_({
    mailSender() {
      throw new Error('forced send failure');
    }
  });
  const ledgerEntry = getOnlySummaryEmailLedgerEntry_(result.ledger);

  assertEquals_('send_failed_blocked', result.sendResult.status, 'Send exception should block retry.');
  assertEquals_(
    SummaryEmailService.STATUS_SEND_FAILED_BLOCKED,
    ledgerEntry.status,
    'Send exception should write blocked ledger status.'
  );
  assertContains_(
    ledgerEntry.error,
    'forced send failure',
    'Send exception should write ledger error.'
  );
  assertEquals_(false, result.sheet.getValueByHeader(sendHeader), 'Send exception should reset checkbox.');
}
