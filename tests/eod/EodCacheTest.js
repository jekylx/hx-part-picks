/**
 * EodCacheTest.js — EOD report sheet/runtime cache behaviour and the daily
 * warmup. Includes the EOD CSV report and cache sheet mocks these tests use.
 */

function getEodCacheTestCases_() {
  return [
    { name: 'EOD report sheet cache writes today as rows', fn: testEodReportSheetCacheWritesToday_, suite: 'eod' },
    { name: 'EOD report sheet cache skips non-today writes', fn: testEodReportSheetCacheSkipsNonTodayWrites_, suite: 'eod' },
    { name: 'EOD report runtime cache covers repeated reads', fn: testEodReportRuntimeCache_, suite: 'eod' },
    { name: 'EOD report cache does not store row JSON blobs', fn: testEodReportCacheDoesNotStoreRowJsonBlobs_, suite: 'eod' },
    { name: 'Outstanding Orders cache keeps OL rows only', fn: testOutstandingOrdersCacheKeepsOlRowsOnly_, suite: 'eod' },
    { name: 'Pallet/Product cache keeps all rows', fn: testPalletProductCacheKeepsAllRows_, suite: 'eod' },
    { name: 'EOD report warmup caches today reports only', fn: testWarmTodayEodReportCache_, suite: 'eod' }
  ];
}

function testEodReportSheetCacheWritesToday_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, finderCalls, 'Today lookup should fetch once.');
    assertEquals_('RP_OUTSTANDING_ORDERS.csv', first.filename, 'Today lookup should return fetched report.');
    assertEquals_(1, cacheSheets.metadata.dataRows.length, 'Today lookup should write one metadata cache row.');
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Today lookup should write row cache rows.');

    EodReportCsvService.resetTestDoubles_();
    EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
    EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
    EodReportCsvService.setReportFinderForTest_(function() {
      finderCalls++;
      return null;
    });

    const third = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, finderCalls, 'Sheet cache hit should avoid Gmail/report finder in later execution.');
    assertEquals_('RP_OUTSTANDING_ORDERS.csv', third.filename, 'Sheet cached report should be returned.');
    assertEquals_('Order No.', third.headers[0], 'Sheet cached headers should round-trip.');
    assertEquals_('ABCDE123', third.rows[0][0], 'Sheet cached rows should round-trip.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportSheetCacheSkipsNonTodayWrites_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-04-30');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(1, finderCalls, 'Non-today lookup should still fetch report when needed.');
    assertEquals_('2026-04-30', first.dateKey, 'Non-today lookup should return fetched report.');
    assertEquals_(0, cacheSheets.metadata.dataRows.length, 'Non-today lookup must not write metadata sheet cache.');
    assertEquals_(0, cacheSheets.rows.outstandingOrders.dataRows.length, 'Non-today lookup must not write row sheet cache.');

    EodReportCsvService.resetTestDoubles_();
    EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
    EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
    EodReportCsvService.setReportFinderForTest_(function() {
      finderCalls++;
      return null;
    });

    const second = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(2, finderCalls, 'Non-today later execution should not read from sheet cache.');
    assertEquals_(null, second, 'Non-today later execution should fall through to finder result.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportRuntimeCache_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  let finderCalls = 0;
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-04-30');

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    finderCalls++;
    return report;
  });

  try {
    const first = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');
    const second = EodReportCsvService.getReportForDate('outstandingOrders', '2026-04-30');

    assertEquals_(1, finderCalls, 'Runtime cache should avoid repeated report finder calls.');
    assertEquals_(first, second, 'Second lookup in same execution should return runtime cached object.');
    assertEquals_(0, cacheSheets.metadata.dataRows.length, 'Runtime cache must not require a sheet write for non-today.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testEodReportCacheDoesNotStoreRowJsonBlobs_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01', {
    rows: [
      ['ABCDE123', 'Customer One', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'OL'],
      ['ABCDE124', 'Customer Two', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'OL']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, cacheSheets.metadata.dataRows.length, 'Metadata cache should have one row.');
    assertEquals_(2, cacheSheets.rows.outstandingOrders.dataRows.length, 'Row cache should store report rows separately.');
    assertEquals_(2, cacheSheets.metadata.dataRows[0][9], 'Metadata should store row count, not row JSON.');
    assertNotContains_(
      cacheSheets.metadata.dataRows[0].join(' '),
      'Customer One',
      'Metadata cache must not contain report row contents.'
    );
    assertEquals_(0, cacheSheets.metadata.appendRowCalls, 'Metadata cache should not use appendRow.');
    assertEquals_(0, cacheSheets.rows.outstandingOrders.appendRowCalls, 'Row cache should not use appendRow loops.');
    assertTruthy_(cacheSheets.rows.outstandingOrders.setValuesCalls > 0, 'Row cache should use batched setValues.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testOutstandingOrdersCacheKeepsOlRowsOnly_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('outstandingOrders', '2026-05-01', {
    rows: [
      ['ABCDE123', 'OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234567', '1', 'OL'],
      ['ABCDE124', 'Non OL Customer', 'NXM', 'VIC', 'BB&V1990&OB1234568', '1', 'SO'],
      ['ABCDE125', 'Blank Type Customer', 'NXM', 'VIC', 'BB&V1990&OB1234569', '1', '']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    const cached = EodReportCsvService.getReportForDate('outstandingOrders', '2026-05-01');

    assertEquals_(1, cached.rows.length, 'Only OL rows should be returned from Outstanding Orders report parsing.');
    assertEquals_('OL Customer', cached.rows[0][1], 'OL row should remain.');
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Only OL rows should be persisted.');
    assertEquals_('OL Customer', cacheSheets.rows.outstandingOrders.dataRows[0][9], 'Persisted row should be the OL row.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testPalletProductCacheKeepsAllRows_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const report = buildMockEodCsvReport_('palletAndProductByMembers', '2026-05-01', {
    rows: [
      ['A0101', 'C1234567', 'B1234567', 'ABCDE', 'M001', 'P001', 'Product One', '2020', '750ML'],
      ['A0102', 'C1234568', 'B1234568', 'FGHIJ', 'M002', 'P002', 'Product Two', '2021', '1500ML']
    ]
  });

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function() {
    return report;
  });

  try {
    const cached = EodReportCsvService.getReportForDate('palletAndProductByMembers', '2026-05-01');

    assertEquals_(2, cached.rows.length, 'Pallet/Product rows should not be filtered.');
    assertEquals_(2, cacheSheets.rows.palletAndProductByMembers.dataRows.length, 'Pallet/Product cache should persist every row.');
  } finally {
    EodReportCsvService.resetTestDoubles_();
  }
}

function testWarmTodayEodReportCache_() {
  const cacheSheets = buildMockEodReportCacheSheets_();
  const requested = [];
  const sideEffects = buildWarmupSideEffectGuards_();

  EodReportCsvService.resetTestDoubles_();
  EodReportCsvService.setCacheSheetsForTest_(cacheSheets.metadata, cacheSheets.rows);
  EodReportCsvService.setTodayDateKeyForTest_('2026-05-01');
  EodReportCsvService.setReportFinderForTest_(function(reportKey, dateKey) {
    requested.push(`${reportKey}::${dateKey}`);
    return buildMockEodCsvReport_(reportKey, dateKey);
  });

  try {
    warmTodayEodReportCache();

    assertEquals_(
      'outstandingOrders::2026-05-01,palletAndProductByMembers::2026-05-01',
      requested.join(','),
      'Warmup should request exactly the two current-day EOD reports.'
    );
    assertEquals_(2, cacheSheets.metadata.dataRows.length, 'Warmup should write two current-day metadata rows.');
    assertEquals_(
      '2026-05-01,2026-05-01',
      cacheSheets.metadata.dataRows.map(row => row[2]).join(','),
      'Warmup sheet cache writes must be for today only.'
    );
    assertEquals_(1, cacheSheets.rows.outstandingOrders.dataRows.length, 'Warmup should write Outstanding Orders row cache.');
    assertEquals_(1, cacheSheets.rows.palletAndProductByMembers.dataRows.length, 'Warmup should write Pallet/Product row cache.');
    assertEquals_(0, sideEffects.count(), 'Warmup must not touch summary/raw/dedupe/email/Gemini/Drive/Gmail-printer services.');
  } finally {
    sideEffects.restore();
    EodReportCsvService.resetTestDoubles_();
  }
}

function buildMockEodReportCacheSheet_() {
  return buildMockEodReportCacheSheets_().metadata;
}

function buildMockEodReportCacheSheets_() {
  return {
    metadata: buildMockSheetWithHeaders_([
      'Cache Key',
      'Report Key',
      'Date Key',
      'Source Message ID',
      'Source Filename',
      'Source Date',
      'Cached At',
      'Header Row',
      'Headers JSON',
      'Row Count',
      'Status',
      'Error'
    ]),
    rows: {
      outstandingOrders: buildMockSheetWithHeaders_([
        'Cache Key',
        'Report Key',
        'Date Key',
        'Source Message ID',
        'Source Filename',
        'Source Date',
        'Cached At',
        'Report Row',
        'Order No.',
        'Customer Name',
        'Carrier Code',
        'Customer State',
        'Search Criteria',
        'Qty Ord',
        'Order Type'
      ]),
      palletAndProductByMembers: buildMockSheetWithHeaders_([
        'Cache Key',
        'Report Key',
        'Date Key',
        'Source Message ID',
        'Source Filename',
        'Source Date',
        'Cached At',
        'Report Row',
        'Bin Location',
        'Child pallet no.',
        'Original pallet no.',
        'Owner',
        'Member No',
        'Product Code',
        'Product Description',
        'Vintage',
        'Bottle Size'
      ])
    }
  };
}

function buildMockEodCsvReport_(reportKey, dateKey, options) {
  const settings = options || {};
  const isPalletReport = reportKey === 'palletAndProductByMembers';
  const headers = settings.headers || (isPalletReport
    ? [
      'Bin Location',
      'Child pallet no.',
      'Original pallet no.',
      'Owner',
      'Member No',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size'
    ]
    : [
      'Order No.',
      'Customer Name',
      'Carrier Code',
      'Customer State',
      'Search Criteria',
      'Qty Ord',
      'Order Type'
    ]);
  const rows = settings.rows || (isPalletReport
    ? [['A0101', 'C1234567', 'B1234567', 'ABCDE', 'M001', 'P001', 'Product One', '2020', '750ML']]
    : [['ABCDE123', 'Same Customer', 'AP', 'VIC', 'BB&V1990&OB1234567', '1', 'OL']]);

  return {
    reportKey,
    displayName: isPalletReport ? 'PALLET AND PRODUCT BY MEMBERS' : 'OUTSTANDING ORDERS',
    filename: isPalletReport ? 'RP_Pallet_and_Product_by_Member.csv' : 'RP_OUTSTANDING_ORDERS.csv',
    subject: isPalletReport
      ? 'EOD Reports - RP_Pallet_and_Product_by_Member.csv'
      : 'EOD Reports - RP_OUTSTANDING_ORDERS.csv',
    messageId: `${reportKey}-MSG1`,
    messageDate: new Date(`${dateKey}T09:00:00+10:00`),
    dateKey,
    headerRow: 3,
    headers,
    rows: rows.filter(row => EodReportCsvService.isReportCacheableRow_(reportKey, row, headers))
  };
}

function buildWarmupSideEffectGuards_() {
  const originals = [];
  let sideEffectCount = 0;

  function guard(target, key) {
    if (!target || typeof target[key] !== 'function') {
      return;
    }

    const original = target[key];
    originals.push({
      target,
      key,
      original
    });
    target[key] = function() {
      sideEffectCount++;
      throw new Error(`Unexpected warmup side effect: ${key}`);
    };
  }

  guard(SummaryService, 'appendMissingSummaryRows');
  guard(SheetService, 'appendPartPickRow');
  guard(DedupeService, 'markProcessed');
  guard(SummaryEmailService, 'sendSummaryRowFromEdit');
  guard(GeminiService, 'extractPdf');
  guard(DriveService, 'archivePdf');
  guard(GmailService, 'buildSearchQuery');
  guard(LabelService, 'setupLabels');

  return {
    count() {
      return sideEffectCount;
    },
    restore() {
      originals.forEach(entry => {
        entry.target[entry.key] = entry.original;
      });
    }
  };
}
