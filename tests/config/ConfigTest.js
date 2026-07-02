/**
 * ConfigTest.js — CONFIG block and Gmail query validation.
 */

function getConfigTestCases_() {
  return [
    { name: 'Config has required blocks', fn: testConfigHasRequiredBlocks_, suite: 'core' },
    { name: 'Summary config has Email checkbox at end', fn: testSummaryEmailConfig_, suite: 'core' },
    { name: 'Gmail query is correct', fn: testGmailQuery_, suite: 'core' }
  ];
}

function testConfigHasRequiredBlocks_() {
  assertTruthy_(CONFIG, 'CONFIG missing.');
  assertTruthy_(CONFIG.gmail, 'CONFIG.gmail missing.');
  assertTruthy_(CONFIG.drive, 'CONFIG.drive missing.');
  assertTruthy_(CONFIG.sheets, 'CONFIG.sheets missing.');
  assertTruthy_(CONFIG.summary, 'CONFIG.summary missing.');
  assertTruthy_(CONFIG.gemini, 'CONFIG.gemini missing.');
  assertTruthy_(CONFIG.pdf, 'CONFIG.pdf missing.');
  assertTruthy_(Array.isArray(CONFIG.fields), 'CONFIG.fields must be an array.');
  assertTruthy_(CONFIG.fields.length > 0, 'CONFIG.fields cannot be empty.');

  assertEquals_('Message from "RNP5838795908AB"', CONFIG.gmail.subjectContains, 'Incorrect subject matcher.');

  assertTruthy_(CONFIG.pdf.processorEndpoint, 'CONFIG.pdf.processorEndpoint missing.');
  assertTruthy_(CONFIG.pdf.processorEndpoint.indexOf('/split') > -1, 'PDF processor endpoint should point to /split.');

  const requiredFieldKeys = [
    'order_number',
    'customer_name',
    'original_location',
    'b_code',
    'carton_number',
    'bottles_missing'
  ];

  requiredFieldKeys.forEach(key => {
    const field = CONFIG.fields.find(f => f.key === key);
    assertTruthy_(field, `Missing field config: ${key}`);
  });
}

function testSummaryEmailConfig_() {
  const columns = CONFIG.summary.columns;
  const headers = columns.map(column => column.header);
  const refreshHeader = summaryRefreshHeaderForTest_();
  const sendHeader = summarySendEmailHeaderForTest_();
  const refreshColumn = columns.find(column => column.header === refreshHeader);
  const sendColumn = columns.find(column => column.header === sendHeader);
  const cNumberIndex = headers.indexOf('C Number');
  const bNumberIndex = headers.indexOf('B Number');
  const refreshIndex = headers.indexOf(refreshHeader);
  const sendIndex = headers.indexOf(sendHeader);

  ['Email Sent At', 'Email Sent To', 'Email Status', 'Email Error'].forEach(header => {
    assertEquals_(-1, headers.indexOf(header), `${header} must not be visible in Summary.`);
  });
  assertTruthy_(cNumberIndex >= 0, 'C Number must remain in Summary.');
  assertTruthy_(bNumberIndex >= 0, 'B Number must remain in Summary.');
  assertEquals_(cNumberIndex - 1, headers.indexOf('Location'), 'Location must remain immediately to the left of C Number.');
  assertEquals_(cNumberIndex + 1, bNumberIndex, 'C Number must remain immediately to the left of B Number.');
  [
    'Location',
    'C Number',
    'B Number',
    'Order Qty',
    'B Qty',
    'Missing Units',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size',
    'Date Completed',
    'SLA',
    refreshHeader,
    sendHeader
  ].forEach((header, offset) => {
    assertEquals_(
      header,
      headers[cNumberIndex - 1 + offset],
      `${header} must be in the expected Summary position around B Number.`
    );
  });
  assertTruthy_(headers.indexOf('Date Completed') > -1, 'Date Completed must remain in Summary.');
  assertTruthy_(headers.indexOf('SLA') > -1, 'SLA must remain in Summary.');
  assertTruthy_(refreshIndex > -1, `${refreshHeader} must remain in Summary.`);
  assertTruthy_(sendIndex > -1, `${sendHeader} must remain in Summary.`);
  assertEquals_(refreshIndex + 1, sendIndex, `${sendHeader} must remain immediately after ${refreshHeader}.`);
  assertEquals_(true, refreshColumn.manual, `${refreshHeader} must be manual.`);
  assertEquals_('checkbox', refreshColumn.type, `${refreshHeader} must be a checkbox column.`);
  assertEquals_(true, sendColumn.manual, `${sendHeader} must be manual.`);
  assertEquals_('checkbox', sendColumn.type, `${sendHeader} must be a checkbox column.`);
  assertEquals_(
    'jesse.lang.04@gmail.com',
    CONFIG.summaryEmail.recipient,
    'Summary email recipient is not configured as expected.'
  );
  assertTruthy_(CONFIG.sheets.summaryEmailLedgerSheetName, 'Summary email ledger sheet must be configured.');
}

function testGmailQuery_() {
  const query = GmailService.buildSearchQuery();

  assertContains_(query, 'subject:"Message from \\"RNP5838795908AB\\""', 'Gmail query missing subject.');
  assertContains_(query, 'has:attachment', 'Gmail query missing attachment filter.');
  assertContains_(query, 'filename:pdf', 'Gmail query missing PDF filter.');
  assertContains_(query, 'label:"Inbox"', 'Gmail query missing inbox label filter.');
  assertContains_(query, 'newer_than:7d', 'Gmail query missing search window.');
  assertNotContains_(query, '-label:"PartPick/Processed"', 'Gmail query must not exclude processed threads.');
  assertNotContains_(query, '-label:"PartPick/Failed"', 'Gmail query must not exclude failed threads.');
}
