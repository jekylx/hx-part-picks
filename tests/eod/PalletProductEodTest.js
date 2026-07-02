/**
 * PalletProductEodTest.js — Pallet & Product by Member EOD enrichment:
 * exact C+B matches, owner-gated B corrections, ambiguity blocking,
 * unique product tuple requirements.
 */

function getPalletProductEodTestCases_() {
  return [
    { name: 'Pallet/Product exact C+B match sets Location', fn: testPalletProductExactMatchSetsLocation_, suite: 'eod' },
    { name: 'Pallet/Product exact C+B match fills Member', fn: testPalletProductExactMatchFillsMember_, suite: 'eod' },
    { name: 'Pallet/Product exact match accepts confirmed C/B candidates', fn: testPalletProductExactMatchAcceptsConfirmedCandidates_, suite: 'eod' },
    { name: 'Pallet/Product B owner match corrects C and Location', fn: testPalletProductBMatchOwnerGateCorrects_, suite: 'eod' },
    { name: 'Pallet/Product B owner mismatch blocks C and Location correction', fn: testPalletProductBMatchOwnerMismatchBlocks_, suite: 'eod' },
    { name: 'Pallet/Product missing owner blocks B correction', fn: testPalletProductBMatchMissingOwnerBlocks_, suite: 'eod' },
    { name: 'Pallet/Product global B owner ambiguity does not block confirmed owner', fn: testPalletProductBMatchAmbiguousOwnerBlocks_, suite: 'eod' },
    { name: 'Pallet/Product uses Outstanding Orders owner to narrow global B ambiguity', fn: testPalletProductOutstandingOrdersOwnerNarrowsGlobalAmbiguity_, suite: 'eod' },
    { name: 'Pallet/Product blocks when confirmed B+Owner row is missing', fn: testPalletProductConfirmedOwnerMissingRowBlocks_, suite: 'eod' },
    { name: 'Pallet/Product blocks conflicting B+Owner C/location rows', fn: testPalletProductConfirmedOwnerConflictsBlock_, suite: 'eod' },
    { name: 'Pallet/Product C cannot correct trusted B Number', fn: testPalletProductCMatchDoesNotCorrectB_, suite: 'eod' },
    { name: 'Pallet/Product C-only evidence does not set Location', fn: testPalletProductCOnlyEvidenceDoesNotSetLocation_, suite: 'eod' },
    { name: 'Pallet/Product mismatch does not overwrite Location', fn: testPalletProductMismatchDoesNotOverwriteLocation_, suite: 'eod' },
    { name: 'Pallet/Product note requires unique product tuple', fn: testPalletProductNoteRequiresUniqueProduct_, suite: 'eod' },
    { name: 'Pallet/Product product columns require unique product tuple', fn: testPalletProductColumnsRequireUniqueProduct_, suite: 'eod' },
    { name: 'Pallet/Product Member requires unique B and Owner match', fn: testPalletProductMemberRequiresUniqueBAndOwner_, suite: 'eod' }
  ];
}

function testPalletProductExactMatchSetsLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('A-01-02', outcome.context.values['Location'], 'Exact C+B match should set Location.');
}

function testPalletProductExactMatchFillsMember_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('M001', outcome.context.values['Member'], 'Exact C+B match should fill Member through B+Owner.');
}

function testPalletProductExactMatchAcceptsConfirmedCandidates_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '893-1-562500',
      'B Number': '80867173'
    },
    records: [
      buildPalletProductRecord_({
        location: '1C20C4',
        cNumber: '393000010000562500',
        bNumber: 'B0867173',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_(
    '393000010000562500',
    outcome.context.values['C Number'],
    'Confirmed C candidate should be written to Summary.'
  );
  assertEquals_(
    'B0867173',
    outcome.context.values['B Number'],
    'Confirmed B candidate should be written to Summary.'
  );
  assertEquals_('1C20C4', outcome.context.values['Location'], 'Confirmed C+B candidates should set Location.');
  assertEquals_('M001', outcome.context.values['Member'], 'Confirmed B+Owner candidate should fill Member.');
}

function testPalletProductBMatchOwnerGateCorrects_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'B owner match should correct C Number.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'B owner match should set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected C Number',
    'B owner match should add a correction note.'
  );
}

function testPalletProductBMatchOwnerMismatchBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Owner mismatch should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Owner mismatch should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Pallet/Product row found for B B1234567 and Owner ABCDE',
    'Owner mismatch should add a missing B+Owner row note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Owner mismatch should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Owner mismatch should not count as not found.');
}

function testPalletProductBMatchMissingOwnerBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': '',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Missing owner should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Missing owner should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no confirmed Outstanding Orders owner was available',
    'Missing owner should add a blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing owner should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Missing owner should not count as not found.');
}

function testPalletProductBMatchAmbiguousOwnerBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'Confirmed B+Owner row should correct C Number despite global B ownership ambiguity.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'Confirmed B+Owner row should set Location despite global B ownership ambiguity.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'corrected C Number',
    'Confirmed B+Owner row should add a correction note.'
  );
  assertEquals_(0, outcome.result.blocked, 'Global B ownership ambiguity alone should not count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'Ambiguous B ownership should not count as not found.');
}

function testPalletProductOutstandingOrdersOwnerNarrowsGlobalAmbiguity_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'B-09-09',
        cNumber: 'C9999999',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('C7654321', outcome.context.values['C Number'], 'B+Owner row should correct C Number.');
  assertEquals_('A-01-02', outcome.context.values['Location'], 'B+Owner row should set Location.');
  assertEquals_('M001', outcome.context.values['Member'], 'B+Owner row should fill Member.');
}

function testPalletProductConfirmedOwnerMissingRowBlocks_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'B-09-09',
        cNumber: 'C9999999',
        bNumber: 'B1234567',
        owner: 'VWXYZ',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Missing B+Owner row should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Missing B+Owner row should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Pallet/Product row found for B B1234567 and Owner ABCDE',
    'Missing B+Owner row should add a specific blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Missing B+Owner row should count as blocked.');
}

function testPalletProductConfirmedOwnerConflictsBlock_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': '',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-03',
        cNumber: 'C7654322',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['C Number'], 'Conflicting B+Owner rows should not correct C Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Conflicting B+Owner rows should not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'conflicting C/location rows found for B B1234567 and Owner ABCDE',
    'Conflicting B+Owner rows should add a specific blocked-correction note.'
  );
  assertEquals_(1, outcome.result.blocked, 'Conflicting B+Owner rows should count as blocked.');
}

function testPalletProductCMatchDoesNotCorrectB_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B9999999'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('B9999999', outcome.context.values['B Number'], 'C Number must not correct trusted B Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'C-only evidence must not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'B Number not corrected: C Number cannot override trusted B Number.',
    'C mismatch should explain that C cannot override B.'
  );
  assertEquals_(1, outcome.result.blocked, 'C cannot override trusted B should count as blocked.');
  assertEquals_(1, outcome.result.mismatched, 'C+B contradiction should still count as mismatched.');
  assertEquals_(0, outcome.result.notFound, 'C+B contradiction should not count as not found.');
}

function testPalletProductCOnlyEvidenceDoesNotSetLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': ''
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('', outcome.context.values['B Number'], 'C-only evidence must not fill B Number.');
  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'C-only evidence must not set Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'C-only evidence cannot set Location.',
    'C-only evidence should explain that Location is not trusted.'
  );
  assertEquals_(1, outcome.result.blocked, 'C-only evidence should count as blocked.');
  assertEquals_(0, outcome.result.notFound, 'C-only evidence should not count as not found.');
}

function testPalletProductMismatchDoesNotOverwriteLocation_() {
  const outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': 'OLD-LOC',
      'C Number': 'C7654321',
      'B Number': 'B9999999'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1111111',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'B-03-04',
        cNumber: 'C7654321',
        bNumber: 'B2222222',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('OLD-LOC', outcome.context.values['Location'], 'Mismatch branch should not overwrite Location.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'mismatch',
    'Mismatch branch should keep mismatch validation note.'
  );
}

function testPalletProductNoteRequiresUniqueProduct_() {
  let outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      })
    ]
  });

  assertContains_(
    outcome.context.notes['B Number'],
    'Product Code: P001',
    'Unique product tuple should set B Number note.'
  );
  assertEquals_('P001', outcome.context.values['Product Code'], 'Unique product tuple should set Product Code.');
  assertEquals_('Product One', outcome.context.values['Product Description'], 'Unique product tuple should set Product Description.');
  assertEquals_('2020', outcome.context.values['Vintage'], 'Unique product tuple should set Vintage.');
  assertEquals_('750ML', outcome.context.values['Bottle Size'], 'Unique product tuple should set Bottle Size.');

  outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    notes: {
      'B Number': 'OLD NOTE'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P002',
        productDescription: 'Product Two'
      })
    ]
  });

  assertEquals_('OLD NOTE', outcome.context.notes['B Number'], 'Ambiguous product tuple should not replace B Number note.');
}

function testPalletProductColumnsRequireUniqueProduct_() {
  let outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567',
      'Product Code': 'SAFE-PREV',
      'Product Description': 'Safe Previous',
      'Vintage': '2019',
      'Bottle Size': '375ML'
    },
    notes: {
      'B Number': 'SAFE NOTE'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        productCode: 'P002',
        productDescription: 'Product Two',
        vintage: '2021',
        bottleSize: '750ML'
      })
    ]
  });

  assertEquals_('SAFE NOTE', outcome.context.notes['B Number'], 'Ambiguous product tuple should preserve B Number note.');
  assertEquals_('SAFE-PREV', outcome.context.values['Product Code'], 'Ambiguous product tuple should preserve Product Code.');
  assertEquals_('Safe Previous', outcome.context.values['Product Description'], 'Ambiguous product tuple should preserve Product Description.');
  assertEquals_('2019', outcome.context.values['Vintage'], 'Ambiguous product tuple should preserve Vintage.');
  assertEquals_('375ML', outcome.context.values['Bottle Size'], 'Ambiguous product tuple should preserve Bottle Size.');

  outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567',
      'Product Code': 'SAFE-PREV',
      'Product Description': 'Safe Previous',
      'Vintage': '2019',
      'Bottle Size': '375ML'
    },
    notes: {
      'B Number': 'SAFE NOTE'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE'
      })
    ]
  });

  assertEquals_('SAFE NOTE', outcome.context.notes['B Number'], 'Missing product tuple should preserve B Number note.');
  assertEquals_('SAFE-PREV', outcome.context.values['Product Code'], 'Missing product tuple should preserve Product Code.');
  assertEquals_('Safe Previous', outcome.context.values['Product Description'], 'Missing product tuple should preserve Product Description.');
  assertEquals_('2019', outcome.context.values['Vintage'], 'Missing product tuple should preserve Vintage.');
  assertEquals_('375ML', outcome.context.values['Bottle Size'], 'Missing product tuple should preserve Bottle Size.');
}

function testPalletProductMemberRequiresUniqueBAndOwner_() {
  let outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      })
    ]
  });

  assertEquals_('M001', outcome.context.values['Member'], 'Unique B+Owner Member should fill Member.');

  outcome = runPalletProductRowTest_({
    values: {
      'Owner': 'ABCDE',
      'Location': '',
      'C Number': 'C7654321',
      'B Number': 'B1234567'
    },
    records: [
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001'
      }),
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M002'
      })
    ]
  });

  assertEquals_('', outcome.context.values['Member'], 'Ambiguous B+Owner Member should not fill Member.');
  assertContains_(
    outcome.validationRows[0].notes.join('\n'),
    'no Member No match',
    'Ambiguous B+Owner Member should add validation note.'
  );
}

function runPalletProductRowTest_(options) {
  const context = buildMockPalletProductContext_(options.values || {}, options.notes || {});
  const validationRows = EodReportValidationService.create(1);
  const result = PalletAndProductByMembersEodReportService.createResult_();
  const lookup = buildMockPalletProductLookup_(options.records || []);

  PalletAndProductByMembersEodReportService.applyRow_(
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

function buildMockPalletProductContext_(values, notes) {
  const baseValues = {
    'Scanned At': new Date('2026-05-01T09:30:00+10:00'),
    'Owner': '',
    'Member': '',
    'Location': '',
    'C Number': '',
    'B Number': ''
  };

  Object.keys(values).forEach(key => {
    baseValues[key] = values[key];
  });

  return {
    rowCount: 1,
    values: baseValues,
    notes,

    value(headerName) {
      return this.values[headerName] || '';
    },

    setValue(headerName, rowIndex, value) {
      this.values[headerName] = value;
    },

    setNote(headerName, rowIndex, value) {
      this.notes[headerName] = value;
    }
  };
}
