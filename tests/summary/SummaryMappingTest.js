/**
 * SummaryMappingTest.js — raw Part Pick -> Summary column mapping.
 * Raw values must map safely; Missing Units is raw-normalised only.
 */

function getSummaryMappingTestCases_() {
  return [
    { name: 'Summary maps raw State and Carrier safely', fn: testSummaryMapsRawStateAndCarrier_, suite: 'core' },
    { name: 'Summary maps raw product defaults', fn: testSummaryMapsRawProductDefaults_, suite: 'core' },
    { name: 'Summary maps raw quantity defaults', fn: testSummaryMapsRawQuantityDefaults_, suite: 'core' },
    { name: 'Summary leaves unusable raw Missing Units blank', fn: testSummaryMissingUnitsUnusableBlank_, suite: 'core' }
  ];
}

function testSummaryMapsRawStateAndCarrier_() {
  let row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::STATE_CARRIER',
      'PDF Drive Link': 'https://drive.google.com/mock',
      'Email Received At': new Date('2026-05-01T09:30:00+10:00'),
      'Carrier': 'Australia Post',
      'State': ' vic ',
      'Customer Name': 'Example Customer',
      'Order Number': '140O385',
      'Location': 'A-01',
      'C Number': '1637376',
      'B Number': '0867173'
    },
    'KEY::STATE_CARRIER'
  );
  let values = summaryRowToObject_(row);

  assertEquals_('VIC', values['State'], 'Raw State should normalize into Summary on append.');
  assertEquals_('AP', values['Carrier'], 'Raw Carrier should normalize into Summary on append.');

  row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::STATE_CARRIER_BAD',
      'Carrier': 'Unknown Freight',
      'State': 'Victoria'
    },
    'KEY::STATE_CARRIER_BAD'
  );
  values = summaryRowToObject_(row);

  assertEquals_('', values['State'], 'Invalid raw State should not be copied into Summary.');
  assertEquals_('', values['Carrier'], 'Invalid raw Carrier should not be copied into Summary.');
}

function testSummaryMapsRawProductDefaults_() {
  const row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::PRODUCT_DEFAULTS',
      'Description': 'Clarendon Hills Brookman',
      'Vintage': '2008'
    },
    'KEY::PRODUCT_DEFAULTS'
  );
  const values = summaryRowToObject_(row);

  assertEquals_(
    'Clarendon Hills Brookman',
    values['Product Description'],
    'Raw Description should map into Product Description on append.'
  );
  assertEquals_('2008', values['Vintage'], 'Raw Vintage should map into Summary on append.');
}

function testSummaryMapsRawQuantityDefaults_() {
  const row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::QTY_DEFAULTS',
      'Total Units': '3 bottles',
      'Units Missing': '02 bottles'
    },
    'KEY::QTY_DEFAULTS'
  );
  const values = summaryRowToObject_(row);

  assertEquals_(3, values['Order Qty'], 'Raw Total Units should map into Order Qty on append.');
  assertEquals_(2, values['Missing Units'], 'Raw Units Missing should map into Missing Units on append.');
}

function testSummaryMissingUnitsUnusableBlank_() {
  let row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::MISSING_UNITS_ZERO',
      'Units Missing': '0'
    },
    'KEY::MISSING_UNITS_ZERO'
  );
  let values = summaryRowToObject_(row);

  assertEquals_(0, values['Missing Units'], 'Zero Missing Units should be preserved.');

  row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::MISSING_UNITS_NA',
      'Units Missing': 'N/A'
    },
    'KEY::MISSING_UNITS_NA'
  );
  values = summaryRowToObject_(row);

  assertEquals_('', values['Missing Units'], 'N/A Missing Units should stay blank.');

  row = SummaryService.buildSummaryRow_(
    {
      'Processing Key': 'KEY::MISSING_UNITS_AMBIGUOUS',
      'Units Missing': '2 x 12pk'
    },
    'KEY::MISSING_UNITS_AMBIGUOUS'
  );
  values = summaryRowToObject_(row);

  assertEquals_('', values['Missing Units'], 'Ambiguous Missing Units should stay blank.');
}

function summaryRowToObject_(row) {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const values = {};

  headers.forEach((header, index) => {
    values[header] = row[index];
  });

  return values;
}
