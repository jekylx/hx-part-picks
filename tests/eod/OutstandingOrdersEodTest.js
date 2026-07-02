/**
 * OutstandingOrdersEodTest.js — Outstanding Orders EOD enrichment:
 * parsing, Order+B grouping/matching, guarded corrections, quantity writes,
 * ambiguity blocking. Includes the Outstanding Orders report/context mocks.
 */

function getOutstandingOrdersEodTestCases_() {
  return [
    { name: 'Outstanding Orders order parsing accepts variable length', fn: testOutstandingOrdersOrderParsing_, suite: 'eod' },
    { name: 'Outstanding Orders Search Criteria B parsing works', fn: testOutstandingOrdersSearchCriteriaBParsing_, suite: 'eod' },
    { name: 'Outstanding Orders lookup uses OL rows only', fn: testOutstandingOrdersLookupUsesOlRowsOnly_, suite: 'eod' },
    { name: 'Outstanding Orders customer correction requires exact Order+B match', fn: testOutstandingOrdersCustomerOwnerGate_, suite: 'eod' },
    { name: 'Outstanding Orders blocks customer correction without usable Order+B owner', fn: testOutstandingOrdersCustomerOwnerGateBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders guards carrier and state corrections', fn: testOutstandingOrdersCarrierStateGuards_, suite: 'eod' },
    { name: 'Outstanding Orders groups by Order and Search Criteria B Number', fn: testOutstandingOrdersGroupsByOrderAndBNumber_, suite: 'eod' },
    { name: 'Outstanding Orders summary row matches correct Order+B line', fn: testOutstandingOrdersSummaryMatchesCorrectOrderBLine_, suite: 'eod' },
    { name: 'Outstanding Orders accepts only EOD-confirmed B candidates', fn: testOutstandingOrdersAcceptsConfirmedBNumberCandidate_, suite: 'eod' },
    { name: 'Outstanding Orders writes Order Qty and matched B Qty', fn: testOutstandingOrdersWritesMatchedQuantities_, suite: 'eod' },
    { name: 'Outstanding Orders repeated same-B rows sum quantity', fn: testOutstandingOrdersRepeatedSameBQty_, suite: 'eod' },
    { name: 'Outstanding Orders blocks quantity fields safely', fn: testOutstandingOrdersQuantityBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders canonical identity avoids false ambiguity', fn: testOutstandingOrdersCanonicalIdentityNotAmbiguous_, suite: 'eod' },
    { name: 'Outstanding Orders ambiguous same-B group blocks corrections', fn: testOutstandingOrdersAmbiguousGroupBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders canonical identity detects true ambiguity', fn: testOutstandingOrdersCanonicalIdentityAmbiguous_, suite: 'eod' },
    { name: 'Outstanding Orders missing B match blocks corrections', fn: testOutstandingOrdersMissingBMatchBlocks_, suite: 'eod' },
    { name: 'Outstanding Orders does not fill from another same-order line', fn: testOutstandingOrdersDoesNotFillFromSameOrderOtherB_, suite: 'eod' }
  ];
}

function testOutstandingOrdersOrderParsing_() {
  let parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE1234567');

  assertEquals_('ABCDE', parsed.owner, 'Owner should be first five alphanumeric characters.');
  assertEquals_('1234567', parsed.orderNumber, 'Order number should be everything after owner.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABC121234567');

  assertEquals_('ABC12', parsed.owner, 'Owner with digits should remain valid.');
  assertEquals_('1234567', parsed.orderNumber, 'Seven digit order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE123');

  assertEquals_('ABCDE', parsed.owner, 'Letter owner should parse.');
  assertEquals_('123', parsed.orderNumber, 'Short order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE1234567890');

  assertEquals_('ABCDE', parsed.owner, 'Long order owner should parse.');
  assertEquals_('1234567890', parsed.orderNumber, 'Long order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('abcde123');

  assertEquals_('ABCDE', parsed.owner, 'Lowercase owner should be uppercased.');
  assertEquals_('123', parsed.orderNumber, 'Lowercase input order should parse.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('AB-C D/E 123');

  assertEquals_('ABCDE', parsed.owner, 'Separators should be removed before owner parsing.');
  assertEquals_('123', parsed.orderNumber, 'Separators should be removed before order parsing.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('AB12');

  assertEquals_('', parsed.owner, 'Short owner should be invalid.');
  assertEquals_('', parsed.orderNumber, 'Short value should have no order after owner.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersOrderNo('ABCDE');

  assertEquals_('ABCDE', parsed.owner, 'Five character owner should remain valid.');
  assertEquals_('', parsed.orderNumber, 'Empty order after owner should be blank.');
}

function testOutstandingOrdersSearchCriteriaBParsing_() {
  let parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990&OB1234567');

  assertEquals_('ok', parsed.status, 'Valid Search Criteria should parse.');
  assertEquals_('B1234567', parsed.bNumber, 'Original pallet segment should normalize to B Number.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V2000&OB0234567');

  assertEquals_('ok', parsed.status, 'Leading bottle-size BB must not be treated as B Number.');
  assertEquals_('B0234567', parsed.bNumber, 'O segment should preserve leading zeroes after B.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990');

  assertEquals_('missing', parsed.status, 'Search Criteria without O segment should be missing.');
  assertEquals_('', parsed.bNumber, 'Missing O segment should not return a B Number.');

  parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber('BB&V1990&OB1234567&OB1234568');

  assertEquals_('ambiguous', parsed.status, 'Multiple O segments should be ambiguous.');
  assertEquals_('', parsed.bNumber, 'Ambiguous O segments should not return a B Number.');

  ['BB&V1990&OABC', 'BB&V1990&O123456', 'BB&V1990&O'].forEach(searchCriteria => {
    parsed = EodReportNormalisationService.parseOutstandingOrdersSearchCriteriaBNumber(searchCriteria);

    assertTruthy_(
      parsed.status === 'invalid' || parsed.status === 'missing',
      `Invalid O segment should be invalid/missing: ${searchCriteria}`
    );
    assertEquals_('', parsed.bNumber, `Invalid O segment should not return a B Number: ${searchCriteria}`);
  });
}

function testOutstandingOrdersLookupUsesOlRowsOnly_() {
  const report = buildMockOutstandingOrdersReport_([
    ['ABCDE1234567', 'Non OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'SO'],
    ['ABCDE1234568', 'OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'OL']
  ]);
  const filteredReport = {
    ...report,
    rows: report.rows.filter(row =>
      EodReportCsvService.isOutstandingOrdersCacheableRow_(row, report.headers)
    )
  };
  const lookup = OutstandingOrdersEodReportService.buildLookup_(filteredReport);

  assertEquals_(
    undefined,
    lookup.byOrderNumberAndBNumber['1234567::B1234567'],
    'Lookup should not include non-OL Outstanding Orders rows.'
  );
  assertTruthy_(
    lookup.byOrderNumberAndBNumber['1234568::B1234568'],
    'Lookup should include OL Outstanding Orders rows.'
  );
}

function testOutstandingOrdersCustomerOwnerGate_() {
  const outcome = runOutstandingOrdersRowTest_({
    customerName: 'Old Customer',
    carrier: 'AP',
    state: 'NSW',
    match: {
      owner: 'ABCDE',
      orderNumber: '123',
      customerName: 'New Customer',
      carrierCode: 'NXM',
      customerState: 'VIC'
    }
  });

  assertEquals_(
    'ABCDE',
    outcome.context.values['Owner'],
    'Exact Order+B match should write the Outstanding Orders owner.'
  );

  assertEquals_(
    'New Customer',
    outcome.context.values['Customer Name'],
    'Customer Name should be corrected from the selected Order+B line.'
  );

  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected Customer Name',
    'Customer correction should add a correction note.'
  );
}

function testOutstandingOrdersCustomerOwnerGateBlocks_() {
  const outcome = runOutstandingOrdersRowTest_({
    customerName: 'Old Customer',
    carrier: 'AP',
    state: 'NSW',
    match: {
      owner: '',
      orderNumber: '123',
      customerName: 'New Customer',
      carrierCode: 'NXM',
      customerState: 'VIC'
    }
  });

  assertEquals_(
    'Old Customer',
    outcome.context.values['Customer Name'],
    'Customer Name should stay unchanged when selected Order+B owner is unusable.'
  );

  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'matched Outstanding Orders line has no usable Owner',
    'Missing selected Order+B owner should add a blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing selected Order+B owner should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Missing selected Order+B owner should not count as not found.');
}

function testOutstandingOrdersCarrierStateGuards_() {
  let outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: '',
      state: '',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AP',
        customerState: 'SA'
      }
    });

    assertEquals_('AP', outcome.context.values['Carrier'], 'Blank Carrier should be filled from valid report Carrier.');
    assertEquals_('SA', outcome.context.values['State'], 'Blank State should be filled from valid report State.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'BAD',
      state: 'BAD',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AC',
        customerState: 'QLD'
      }
    });

    assertEquals_('AC', outcome.context.values['Carrier'], 'Invalid Carrier should be corrected from valid report Carrier.');
    assertEquals_('QLD', outcome.context.values['State'], 'Invalid State should be corrected from valid report State.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'NXM',
      state: 'SA',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('NXM', outcome.context.values['Carrier'], 'Existing valid Carrier should be preserved.');
    assertEquals_('SA', outcome.context.values['State'], 'Existing valid State should be preserved.');

    outcome = runOutstandingOrdersRowTest_({
      customerName: 'Same Customer',
      carrier: 'BAD',
      state: 'BAD',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        customerName: 'Same Customer',
        carrierCode: 'AUSPOST',
        customerState: 'BADSTATE'
      }
    });

    assertEquals_('BAD', outcome.context.values['Carrier'], 'Invalid Carrier should stay unchanged when report Carrier is invalid.');
    assertEquals_('BAD', outcome.context.values['State'], 'Invalid State should stay unchanged when report State is invalid.');

    const notes = outcome.validationRows[0].notes.join('\n');

    assertContains_(notes, 'Carrier not corrected', 'Invalid report Carrier should add a validation note.');
    assertContains_(notes, 'State not corrected', 'Invalid report State should add a validation note.');
    assertEquals_(2, outcome.result.blocked, 'Invalid report Carrier/State should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Invalid report Carrier/State should not count as not found.');
}

function testOutstandingOrdersGroupsByOrderAndBNumber_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234501',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234502',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234503',
        qtyOrd: '2'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234504',
        qtyOrd: '3'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OABC',
        qtyOrd: '4'
      })
    ])
  );

  const order = lookup.byOrderNumber['1400001'];

  assertEquals_(11, order.orderTotalQtyOrd, 'Order total should include valid numeric Qty Ord even when Search Criteria B is invalid.');
  assertEquals_(1, order.bNumbers.B1234501.qtyOrdSum, 'First B group quantity should be stored.');
  assertEquals_(1, order.bNumbers.B1234502.qtyOrdSum, 'Second B group quantity should be stored.');
  assertEquals_(2, order.bNumbers.B1234503.qtyOrdSum, 'Third B group quantity should be stored.');
  assertEquals_(3, order.bNumbers.B1234504.qtyOrdSum, 'Fourth B group quantity should be stored.');
  assertEquals_(
    undefined,
    order.bNumbers.OABC,
    'Invalid Search Criteria B should not become a matchable B group.'
  );
}

function testOutstandingOrdersSummaryMatchesCorrectOrderBLine_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234502: [
        { owner: 'TESTA' }
      ]
    }
  });

  try {
    const context = buildMockOutstandingOrdersContext_({
      'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
      'Owner': '',
      'Order No.': '1400001',
      'Customer Name': 'Old Customer',
      'Carrier': '',
      'State': '',
      'B Number': 'B1234502'
    });
    const validationRows = EodReportValidationService.create(1);
    const result = OutstandingOrdersEodReportService.createResult_();
    const lookup = OutstandingOrdersEodReportService.buildLookup_(
      buildMockOutstandingOrdersReport_([
        buildOutstandingOrdersCsvRow_({
          orderNo: 'TESTA1400001',
          customerName: 'Wrong B Customer',
          carrierCode: 'AP',
          customerState: 'NSW',
          searchCriteria: 'BB&V1990&OB1234501',
          qtyOrd: '1'
        }),
        buildOutstandingOrdersCsvRow_({
          orderNo: 'TESTA1400001',
          customerName: 'Right B Customer',
          carrierCode: 'NXM',
          customerState: 'VIC',
          searchCriteria: 'BB&V1990&OB1234502',
          qtyOrd: '1'
        })
      ])
    );

    OutstandingOrdersEodReportService.applyRow_(
      context,
      validationRows,
      0,
      lookup,
      '2026-05-01',
      result
    );

    assertEquals_('TESTA', context.values['Owner'], 'Matched Order+B line should write Owner.');
    assertEquals_('Right B Customer', context.values['Customer Name'], 'Matched Order+B line should correct Customer Name.');
    assertEquals_('NXM', context.values['Carrier'], 'Matched Order+B line should fill Carrier.');
    assertEquals_('VIC', context.values['State'], 'Matched Order+B line should fill State.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersAcceptsConfirmedBNumberCandidate_() {
  const context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '1400001',
    'Customer Name': 'Old Customer',
    'Carrier': '',
    'State': '',
    'B Number': '80867173',
    'Order Qty': '',
    'B Qty': ''
  });
  const validationRows = EodReportValidationService.create(1);
  const result = OutstandingOrdersEodReportService.createResult_();
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        customerName: 'Right B Customer',
        carrierCode: 'NXM',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB0867173',
        qtyOrd: '3'
      })
    ])
  );

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    lookup,
    '2026-05-01',
    result
  );

  assertEquals_('B0867173', context.values['B Number'], 'Confirmed B candidate should be written to Summary.');
  assertEquals_(3, context.values['B Qty'], 'Confirmed B candidate should write matched B Qty.');
  assertEquals_('Right B Customer', context.values['Customer Name'], 'Confirmed B candidate should select the matching order line.');
  assertContains_(
    validationRows[0].notes.join('\n'),
    'corrected B Number from Order+B candidate',
    'Confirmed B candidate should add an audit note.'
  );
}

function testOutstandingOrdersWritesMatchedQuantities_() {
  const context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '1400001',
    'Customer Name': 'Old Customer',
    'Carrier': '',
    'State': '',
    'B Number': 'B1234502',
    'Order Qty': '',
    'B Qty': ''
  });
  const validationRows = EodReportValidationService.create(1);
  const result = OutstandingOrdersEodReportService.createResult_();
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234501',
        qtyOrd: '2'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234502',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'TESTA1400001',
        searchCriteria: 'BB&V1990&OB1234502',
        qtyOrd: '3'
      })
    ])
  );

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    lookup,
    '2026-05-01',
    result
  );

  assertEquals_(6, context.values['Order Qty'], 'Order Qty should sum every EOD quantity for the order.');
  assertEquals_(4, context.values['B Qty'], 'B Qty should sum only the matched Order+B rows.');
}

function testOutstandingOrdersRepeatedSameBQty_() {
  const rows = [1, 1, 2, 1].map(qtyOrd => buildOutstandingOrdersCsvRow_({
    orderNo: 'TESTB1400002',
    searchCriteria: 'BB&V2000&OB0234567',
    qtyOrd: String(qtyOrd)
  }));
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_(rows)
  );
  const order = lookup.byOrderNumber['1400002'];
  const group = lookup.byOrderNumberAndBNumber['1400002::B0234567'];

  assertEquals_(5, order.orderTotalQtyOrd, 'Repeated same-B rows should sum to order total.');
  assertEquals_(5, group.qtyOrdSum, 'Repeated same-B rows should sum to B group quantity.');
  assertEquals_(false, group.ambiguous, 'Repeated identical same-B rows should not be ambiguous.');
  assertEquals_(4, group.rows.length, 'Repeated same-B rows should be preserved on the group.');
}

function testOutstandingOrdersQuantityBlocks_() {
  let validationRows = EodReportValidationService.create(1);
  let result = OutstandingOrdersEodReportService.createResult_();
  let context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '',
    'Customer Name': '',
    'Carrier': '',
    'State': '',
    'B Number': 'B1234567',
    'Order Qty': 99,
    'B Qty': 88
  });

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    { byOrderNumber: {}, byOrderNumberAndBNumber: {} },
    '2026-05-01',
    result
  );

  assertEquals_('', context.values['Order Qty'], 'Missing order should blank Order Qty.');
  assertEquals_('', context.values['B Qty'], 'Missing order should blank B Qty.');
  assertContains_(
    validationRows[0].notes.join('\n'),
    'Order Qty blocked: no unique order match.',
    'Missing order should add the short Order Qty blocked note.'
  );

  validationRows = EodReportValidationService.create(1);
  result = OutstandingOrdersEodReportService.createResult_();
  context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '123',
    'Customer Name': '',
    'Carrier': '',
    'State': '',
    'B Number': 'B1234567',
    'Order Qty': 99,
    'B Qty': 88
  });

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    {
      byOrderNumber: {
        123: {
          orderNumber: '123',
          orderTotalQtyOrd: 7,
          ambiguous: true,
          bNumbers: {}
        }
      },
      byOrderNumberAndBNumber: {}
    },
    '2026-05-01',
    result
  );

  assertEquals_('', context.values['Order Qty'], 'Ambiguous order should blank Order Qty.');
  assertEquals_('', context.values['B Qty'], 'Ambiguous order should blank B Qty.');

  validationRows = EodReportValidationService.create(1);
  result = OutstandingOrdersEodReportService.createResult_();
  context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '123',
    'Customer Name': '',
    'Carrier': '',
    'State': '',
    'B Number': '',
    'Order Qty': '',
    'B Qty': 88
  });

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    {
      byOrderNumber: {
        123: {
          orderNumber: '123',
          orderTotalQtyOrd: 7,
          ambiguous: false,
          bNumbers: {}
        }
      },
      byOrderNumberAndBNumber: {}
    },
    '2026-05-01',
    result
  );

  assertEquals_(7, context.values['Order Qty'], 'Safe order should still write Order Qty when B is missing.');
  assertEquals_('', context.values['B Qty'], 'Missing B should blank B Qty.');
  assertContains_(
    validationRows[0].notes.join('\n'),
    'B Qty blocked: no safe Order+B match.',
    'Missing B should add the short B Qty blocked note.'
  );

  validationRows = EodReportValidationService.create(1);
  result = OutstandingOrdersEodReportService.createResult_();
  context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': '123',
    'Customer Name': '',
    'Carrier': '',
    'State': '',
    'B Number': 'B1234567',
    'Order Qty': '',
    'B Qty': 88
  });

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    {
      byOrderNumber: {
        123: {
          orderNumber: '123',
          orderTotalQtyOrd: 7,
          ambiguous: false,
          bNumbers: {}
        }
      },
      byOrderNumberAndBNumber: {
        '123::B1234567': {
          orderNumber: '123',
          searchCriteriaBNumber: 'B1234567',
          qtyOrdSum: 4,
          ambiguous: true,
          ambiguityReasons: ['customerName'],
          rows: []
        }
      }
    },
    '2026-05-01',
    result
  );

  assertEquals_(7, context.values['Order Qty'], 'Safe order should write Order Qty when B is ambiguous.');
  assertEquals_('', context.values['B Qty'], 'Ambiguous B should blank B Qty.');
  assertContains_(
    validationRows[0].notes.join('\n'),
    'B Qty blocked: ambiguous Order+B quantity.',
    'Ambiguous B should add the short B Qty ambiguity note.'
  );
}

function testOutstandingOrdersCanonicalIdentityNotAmbiguous_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer   One',
        carrierCode: 'ap',
        customerState: ' vic ',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'CUSTOMER ONE',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      })
    ])
  );
  const group = lookup.byOrderNumberAndBNumber['123::B1234567'];

  assertEquals_(
    false,
    group.ambiguous,
    'Same Order+B rows with canonical-equivalent customer/carrier/state should not be ambiguous.'
  );
}

function testOutstandingOrdersAmbiguousGroupBlocks_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer One',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer Two',
        carrierCode: 'NXM',
        customerState: 'NSW',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '2'
      })
    ])
  );
  const builtGroup = lookup.byOrderNumberAndBNumber['123::B1234567'];

  assertEquals_(true, builtGroup.ambiguous, 'Conflicting same Order+B identity fields should mark group ambiguous.');
  assertContains_(
    builtGroup.ambiguityReasons.join(','),
    'customerName',
    'Conflicting customerName should be recorded as an ambiguity reason.'
  );
  assertContains_(
    builtGroup.ambiguityReasons.join(','),
    'carrierCode',
    'Conflicting carrierCode should be recorded as an ambiguity reason.'
  );

  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234567: [
        { owner: 'ABCDE' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        searchCriteriaBNumber: 'B1234567',
        customerName: 'New Customer',
        carrierCode: 'AP',
        customerState: 'VIC',
        ambiguous: true,
        ambiguityReasons: ['customerName']
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Ambiguous group should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Ambiguous group should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Ambiguous group should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Ambiguous group should not fill State.');
    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'B Qty blocked: ambiguous Order+B quantity.',
      'Ambiguous group should add a blocked note.'
    );
    assertEquals_(1, outcome.result.blocked, 'Ambiguous group should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Ambiguous group should not count as not found.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersCanonicalIdentityAmbiguous_() {
  const lookup = OutstandingOrdersEodReportService.buildLookup_(
    buildMockOutstandingOrdersReport_([
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Customer One',
        carrierCode: 'AP',
        customerState: 'VIC',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      }),
      buildOutstandingOrdersCsvRow_({
        orderNo: 'ABCDE123',
        customerName: 'Different Customer',
        carrierCode: 'NXM',
        customerState: 'NSW',
        searchCriteria: 'BB&V1990&OB1234567',
        qtyOrd: '1'
      })
    ])
  );
  const group = lookup.byOrderNumberAndBNumber['123::B1234567'];
  const reasons = group.ambiguityReasons.join(',');

  assertEquals_(true, group.ambiguous, 'Genuinely different normalized identity fields should be ambiguous.');
  assertContains_(reasons, 'customerName', 'Different normalized customer should be an ambiguity reason.');
  assertContains_(reasons, 'carrierCode', 'Different normalized carrier should be an ambiguity reason.');
  assertContains_(reasons, 'customerState', 'Different normalized state should be an ambiguity reason.');
}

function testOutstandingOrdersMissingBMatchBlocks_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B7654321: [
        { owner: 'ABCDE' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      bNumber: 'B7654321',
      match: {
        owner: 'ABCDE',
        orderNumber: '123',
        searchCriteriaBNumber: 'B1234567',
        customerName: 'Other B Customer',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Missing B match should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Missing B match should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Missing B match should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Missing B match should not fill State.');
    assertContains_(
      outcome.validationRows[0].notes.join('\n'),
      'B Qty blocked: no safe Order+B match.',
      'Missing B match should add a blocked note.'
    );
    assertEquals_(1, outcome.result.blocked, 'Missing B match should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Missing B match should not count as not found.');
  } finally {
    restore();
  }
}

function testOutstandingOrdersDoesNotFillFromSameOrderOtherB_() {
  const restore = stubPalletLookupForTest_({
    byBNumber: {
      B1234502: [
        { owner: 'TESTA' }
      ]
    }
  });

  try {
    const outcome = runOutstandingOrdersRowTest_({
      customerName: 'Old Customer',
      carrier: '',
      state: '',
      bNumber: 'B1234502',
      match: {
        owner: 'TESTA',
        orderNumber: '1400001',
        searchCriteriaBNumber: 'B1234501',
        customerName: 'Other Stock Line',
        carrierCode: 'AP',
        customerState: 'VIC'
      }
    });

    assertEquals_('', outcome.context.values['Owner'], 'Same-order other B line should not write Owner.');
    assertEquals_('Old Customer', outcome.context.values['Customer Name'], 'Same-order other B line should not correct Customer Name.');
    assertEquals_('', outcome.context.values['Carrier'], 'Same-order other B line should not fill Carrier.');
    assertEquals_('', outcome.context.values['State'], 'Same-order other B line should not fill State.');
    assertEquals_(1, outcome.result.blocked, 'Same-order other B should count as blocked.');
    assertEquals_(0, outcome.result.notFound, 'Same-order other B should not count as not found.');
  } finally {
    restore();
  }
}

function runOutstandingOrdersRowTest_(options) {
  const match = options.match;
  const matchBNumber = match.searchCriteriaBNumber || options.bNumber || 'B1234567';
  const context = buildMockOutstandingOrdersContext_({
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Order No.': match.orderNumber,
    'Customer Name': options.customerName,
    'Carrier': options.carrier,
    'State': options.state,
    'B Number': options.bNumber || matchBNumber,
    'Order Qty': '',
    'B Qty': ''
  });

  const validationRows = EodReportValidationService.create(1);
  const result = OutstandingOrdersEodReportService.createResult_();
  const group = {
    orderNumber: match.orderNumber,
    searchCriteriaBNumber: matchBNumber,
    owner: match.owner || '',
    customerName: match.customerName || '',
    carrierCode: match.carrierCode || '',
    customerState: match.customerState || '',
    qtyOrdSum: match.qtyOrdSum || 0,
    ambiguous: match.ambiguous || false,
    ambiguityReasons: match.ambiguityReasons || [],
    rows: match.rows || [match]
  };
  const lookup = {
    byOrderNumber: {},
    byOrderNumberAndBNumber: {}
  };
  const orderLookup = {
    orderNumber: match.orderNumber,
    orderTotalQtyOrd: options.orderTotalQtyOrd == null
      ? group.qtyOrdSum
      : options.orderTotalQtyOrd,
    ambiguous: options.orderAmbiguous || false,
    bNumbers: {}
  };

  orderLookup.bNumbers[matchBNumber] = group;
  lookup.byOrderNumber[match.orderNumber] = orderLookup;
  lookup.byOrderNumberAndBNumber[
    `${match.orderNumber}::${matchBNumber}`
  ] = group;

  OutstandingOrdersEodReportService.applyRow_(
    context,
    validationRows,
    0,
    lookup,
    '2026-05-01',
    result
  );

  return {
    context,
    validationRows,
    result
  };
}

function buildMockOutstandingOrdersReport_(rows) {
  return {
    filename: 'RP_OUTSTANDING_ORDERS.csv',
    dateKey: '2026-05-01',
    headerRow: 3,
    headers: [
      'Order No.',
      'Customer Name',
      'Carrier Code',
      'Customer State',
      'Search Criteria',
      'Qty Ord',
      'Order Type'
    ],
    rows
  };
}

function buildOutstandingOrdersCsvRow_(row) {
  return [
    row.orderNo || 'ABCDE123',
    row.customerName || 'Same Customer',
    row.carrierCode || 'AP',
    row.customerState || 'VIC',
    row.searchCriteria || 'BB&V1990&OB1234567',
    row.qtyOrd == null ? '' : row.qtyOrd,
    row.orderType || 'OL'
  ];
}

function buildMockOutstandingOrdersContext_(values) {
  return {
    rowCount: 1,
    values,

    value(headerName) {
      return this.values[headerName] || '';
    },

    setValue(headerName, rowIndex, value) {
      this.values[headerName] = value;
    }
  };
}

function stubPalletLookupForTest_(lookup) {
  const original = PalletAndProductByMembersEodReportService.getLookupForDate;

  PalletAndProductByMembersEodReportService.getLookupForDate = () => lookup;

  return function restore() {
    PalletAndProductByMembersEodReportService.getLookupForDate = original;
  };
}
