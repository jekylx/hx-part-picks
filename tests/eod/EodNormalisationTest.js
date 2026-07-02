/**
 * EodNormalisationTest.js — EOD report field normalisation/validation helpers,
 * date/lookup key helpers, and result counter/formatting helpers.
 */

function getEodNormalisationTestCases_() {
  return [
    { name: 'EOD member normalisation helper works', fn: testEodMemberNormalisation_, suite: 'eod' },
    { name: 'EOD owner normalisation allows alphanumeric owners', fn: testEodOwnerNormalisation_, suite: 'eod' },
    { name: 'EOD carrier validation helper works', fn: testEodCarrierValidation_, suite: 'eod' },
    { name: 'EOD state validation helper works', fn: testEodStateValidation_, suite: 'eod' },
    { name: 'EOD customer name normalisation helper works', fn: testEodCustomerNameNormalisation_, suite: 'eod' },
    { name: 'EOD report header normalisation helper works', fn: testEodReportHeaderNormalisation_, suite: 'eod' },
    { name: 'EOD date helpers work', fn: testEodDateHelpers_, suite: 'eod' },
    { name: 'EOD lookup key helpers work', fn: testEodLookupKeyHelpers_, suite: 'eod' },
    { name: 'EOD result counters include blocked', fn: testEodResultCountersIncludeBlocked_, suite: 'eod' },
    { name: 'EOD result formatting includes blocked', fn: testEodResultFormattingIncludesBlocked_, suite: 'eod' }
  ];
}

function testEodMemberNormalisation_() {
  assertEquals_(
    'ABC123',
    EodReportNormalisationService.normalizeMember('abc123'),
    'Member should uppercase alphanumeric values.'
  );

  assertEquals_(
    'ABC',
    EodReportNormalisationService.normalizeMember(' A B\tC\n'),
    'Member should remove spaces, tabs, and newlines.'
  );

  assertEquals_(
    'AB-12.',
    EodReportNormalisationService.normalizeMember('ab-12.'),
    'Member should preserve punctuation.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeMember(''),
    'Blank member should stay blank.'
  );

  assertEquals_(
    '00123',
    EodReportNormalisationService.normalizeMember('00123'),
    'Numeric-looking member values should be preserved as strings.'
  );
}

function testEodOwnerNormalisation_() {
  assertEquals_(
    'ABC12',
    EodReportNormalisationService.normalizeOwner('ABC12'),
    'Owner should preserve alphanumeric owner codes.'
  );

  assertEquals_(
    'ABC12',
    EodReportNormalisationService.normalizeOwner(' A-B C.1 2Z '),
    'Owner should remove whitespace/punctuation and keep first five alphanumeric characters.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeOwner('---'),
    'Owner with no alphanumeric characters should normalize blank.'
  );
}

function testEodCarrierValidation_() {
  assertEquals_(
    'AP',
    EodReportNormalisationService.normalizeStrictCode(' ap '),
    'Strict code normalization should trim and uppercase.'
  );

  ['NXM', 'AP', 'AC'].forEach(carrier => {
    assertTruthy_(
      EodReportNormalisationService.isValidCarrier(carrier),
      `Carrier should be valid: ${carrier}`
    );
  });

  ['nxm', ' ap ', ' ac '].forEach(carrier => {
    assertTruthy_(
      EodReportNormalisationService.isValidCarrier(carrier),
      `Trimmed/lowercase carrier should be valid: ${carrier}`
    );
  });

  ['AUSPOST', 'AUSTRALIA POST', 'NEXDAY', '', 'BAD'].forEach(carrier => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidCarrier(carrier),
      `Carrier should be invalid: ${carrier}`
    );
  });
}

function testEodStateValidation_() {
  ['NSW', 'VIC', 'ACT', 'WA', 'TAS', 'NT', 'QLD', 'SA'].forEach(state => {
    assertTruthy_(
      EodReportNormalisationService.isValidState(state),
      `State should be valid: ${state}`
    );
  });

  ['nsw', ' vic ', ' qld '].forEach(state => {
    assertTruthy_(
      EodReportNormalisationService.isValidState(state),
      `Trimmed/lowercase state should be valid: ${state}`
    );
  });

  ['Victoria', 'AUS', 'NZ', '', 'BAD'].forEach(state => {
    assertEquals_(
      false,
      EodReportNormalisationService.isValidState(state),
      `State should be invalid: ${state}`
    );
  });
}

function testEodCustomerNameNormalisation_() {
  assertEquals_(
    'example customer',
    EodReportNormalisationService.normalizeName('EXAMPLE CUSTOMER'),
    'Customer name should normalize to lowercase.'
  );

  assertEquals_(
    'example customer',
    EodReportNormalisationService.normalizeName('  Example   Customer  '),
    'Customer name should trim and collapse whitespace.'
  );

  assertEquals_(
    "o'neil-smith",
    EodReportNormalisationService.normalizeName("O'Neil-Smith"),
    'Customer name should preserve apostrophes and hyphens.'
  );

  assertEquals_(
    'acme, pty. ltd.',
    EodReportNormalisationService.normalizeName('ACME, PTY. LTD.'),
    'Customer name should preserve punctuation.'
  );

  assertEquals_(
    '',
    EodReportNormalisationService.normalizeName(''),
    'Blank customer name should stay blank.'
  );

  assertEquals_(
    EodReportNormalisationService.normalizeName('Example  Customer'),
    EodReportNormalisationService.normalizeName(' example customer '),
    'Customer name comparison should ignore case and spacing.'
  );
}

function testEodReportHeaderNormalisation_() {
  assertEquals_(
    'order no.',
    EodReportNormalisationService.normalizeHeader('\uFEFFOrder No.'),
    'Report header should strip BOM.'
  );

  assertEquals_(
    'customer name',
    EodReportNormalisationService.normalizeHeader('  Customer Name  '),
    'Report header should trim and lowercase.'
  );

  assertEquals_(
    'customer state',
    EodReportNormalisationService.normalizeHeader('Customer    State'),
    'Report header should collapse repeated whitespace.'
  );

  assertEquals_(
    'carrier code',
    EodReportNormalisationService.normalizeHeader('Carrier\t\nCode'),
    'Report header should collapse tabs and newlines.'
  );
}

function testEodDateHelpers_() {
  const date = new Date('2026-05-01T09:30:00+10:00');

  assertEquals_(
    date,
    EodReportNormalisationService.toDate(date),
    'Valid Date object should be returned as-is.'
  );

  assertEquals_(
    null,
    EodReportNormalisationService.toDate(''),
    'Blank date should be invalid.'
  );

  assertEquals_(
    null,
    EodReportNormalisationService.toDate('not a date'),
    'Invalid date string should be rejected.'
  );

  assertTruthy_(
    EodReportNormalisationService.toDate('2026-05-01') instanceof Date,
    'Supported string date should parse to a Date.'
  );
}

function testEodLookupKeyHelpers_() {
  assertEquals_(
    'C1234567::B7654321',
    EodReportNormalisationService.pairKey('C1234567', 'B7654321'),
    'Pair key should use C::B format.'
  );

  assertEquals_(
    'B7654321::ABCDE',
    EodReportNormalisationService.bOwnerKey('B7654321', 'abcde'),
    'B owner key should use B::OWNER format with normalized owner.'
  );

  assertEquals_(
    '::B7654321',
    EodReportNormalisationService.pairKey('', 'B7654321'),
    'Pair key should document blank C part behaviour.'
  );

  assertEquals_(
    'B7654321::',
    EodReportNormalisationService.bOwnerKey('B7654321', ''),
    'B owner key should document blank owner part behaviour.'
  );

  const cNumber = EodReportNormalisationService.normalizeCNumber(' c-123 4567 ');
  const bNumber = EodReportNormalisationService.normalizeBNumber(' b-765 4321 ');

  assertEquals_(
    'C1234567::B7654321',
    EodReportNormalisationService.pairKey(cNumber, bNumber),
    'Normalized C/B inputs should produce stable pair keys.'
  );
}

function testEodResultCountersIncludeBlocked_() {
  let result = OutstandingOrdersEodReportService.createResult_();

  assertEquals_(0, result.blocked, 'Outstanding Orders result should include blocked counter.');

  result = PalletAndProductByMembersEodReportService.createResult_();

  assertEquals_(0, result.blocked, 'Pallet/Product result should include blocked counter.');
}

function testEodResultFormattingIncludesBlocked_() {
  const formatted = EodReportCoordinator.formatResult_('TEST REPORT', {
    checked: 1,
    filled: 2,
    corrected: 3,
    mismatched: 4,
    blocked: 5,
    notFound: 6
  });

  assertContains_(formatted, 'blocked=5', 'EOD result formatting should include blocked counter.');
}
