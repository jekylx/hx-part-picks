/**
 * TestFixtures.js
 *
 * Cross-domain fixtures and sheet helpers:
 * - Summary header fixtures and raw append context builder
 * - Pallet/Product lookup + record builders (EOD and Summary tests)
 * - Product tuple sheet/stub/assert helpers (coordinator + draft append tests)
 * - EOD append stub and inflated-last-row markers (append + sync tests)
 * - Row lookup/cleanup helpers for real test sheets
 */

function summaryRefreshHeaderForTest_() {
  return SummaryService.getRefreshEodHeader_();
}

function summarySendEmailHeaderForTest_() {
  return SummaryService.getSendEmailHeader_();
}

function buildMockAppendContext_(processingKey) {
  const mockMessage = {
    getDate: () => new Date('2026-05-01T09:30:00+10:00'),
    getId: () => 'MOCK_MESSAGE_ID'
  };

  const mockPdf = {
    getName: () => 'mock_scan_page_1.pdf'
  };

  const mockArchiveFile = {
    getUrl: () => 'https://drive.google.com/mock-pdf'
  };

  const mockForm = {
    form_date: '30/4/26',
    state: 'VIC',
    weather_status: 'SHIP',
    picker: 'Warehouse User',
    order_number: '140O385',
    customer_name: 'Example Customer',
    member_code: null,
    original_location: '1 g20 e2',
    b_code: '0888230',
    carton_number: '1637376',
    wine_description: 'Clarendon Hills Brookman',
    vintage: '2008',
    bottles_missing: '02 bottles',
    total_bottle_count: '25/276',
    total_carton_count: '2 x 12pk, 1 x 3pk',
    q_label: '1051890',
    special_instructions: null,
    incomplete_reason: 'BOTTLE NOT IN BOX',
    carrier: 'AUSTRALIA POST',
    picker_initials: null,
    picker_signoff_date: '1/05/26',
    external_misc_notes: 'Diagonal line across page',
    needs_review: false,
    review_reasons: []
  };

  return {
    message: mockMessage,
    pdf: mockPdf,
    archiveFile: mockArchiveFile,
    form: mockForm,
    processingKey,
    extractionStatus: 'AUTO_EXTRACTED',
    extractionError: ''
  };
}

function buildPalletProductRecord_(record) {
  return {
    reportRow: record.reportRow || 4,
    location: String(record.location || '').trim(),
    cNumber: EodReportNormalisationService.normalizeCNumber(record.cNumber),
    bNumber: EodReportNormalisationService.normalizeBNumber(record.bNumber),
    owner: EodReportNormalisationService.normalizeOwner(record.owner),
    memberNo: EodReportNormalisationService.normalizeMember(record.memberNo),
    productCode: String(record.productCode || '').trim(),
    productDescription: String(record.productDescription || '').trim(),
    vintage: String(record.vintage || '').trim(),
    bottleSize: String(record.bottleSize || '').trim()
  };
}

function buildMockPalletProductLookup_(records) {
  const lookup = {
    filename: 'RP_Pallet_and_Product_by_Member.csv',
    dateKey: '2026-05-01',
    byPair: {},
    byCNumber: {},
    byBNumber: {},
    byBNumberAndOwner: {}
  };

  records.forEach((record, index) => {
    const normalized = buildPalletProductRecord_(record);

    normalized.reportRow = index + 4;

    if (normalized.cNumber && normalized.bNumber) {
      lookup.byPair[
        EodReportNormalisationService.pairKey(normalized.cNumber, normalized.bNumber)
      ] = normalized;
    }

    EodReportNormalisationService.addLookupRecord(lookup.byCNumber, normalized.cNumber, normalized);
    EodReportNormalisationService.addLookupRecord(lookup.byBNumber, normalized.bNumber, normalized);

    if (normalized.bNumber && normalized.owner) {
      EodReportNormalisationService.addLookupRecord(
        lookup.byBNumberAndOwner,
        EodReportNormalisationService.bOwnerKey(normalized.bNumber, normalized.owner),
        normalized
      );
    }
  });

  return lookup;
}

function buildProductTupleSummarySheet_() {
  const headers = SummaryService.getConfiguredSummaryHeaders_();
  const row = new Array(headers.length).fill('');

  row[headers.indexOf('_Key')] = TEST_PREFIX + 'PRODUCT_TUPLE';
  row[headers.indexOf('Scanned At')] = new Date('2026-05-01T09:30:00+10:00');
  row[headers.indexOf('Owner')] = 'ABCDE';
  row[headers.indexOf('Order No.')] = '7654321';
  row[headers.indexOf('Location')] = '';
  row[headers.indexOf('C Number')] = 'C7654321';
  row[headers.indexOf('B Number')] = 'B1234567';

  return buildMockMigratableSummarySheet_(headers, [row]);
}

function stubCoordinatorProductTupleLookups_() {
  const originalOutstanding = OutstandingOrdersEodReportService.applyToSummaryRows;
  const originalLookup = PalletAndProductByMembersEodReportService.getLookupForDate_;

  OutstandingOrdersEodReportService.applyToSummaryRows = () =>
    OutstandingOrdersEodReportService.createResult_();

  PalletAndProductByMembersEodReportService.getLookupForDate_ = () =>
    buildMockPalletProductLookup_([
      buildPalletProductRecord_({
        location: 'A-01-02',
        cNumber: 'C7654321',
        bNumber: 'B1234567',
        owner: 'ABCDE',
        memberNo: 'M001',
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
        memberNo: 'M001',
        productCode: 'P001',
        productDescription: 'Product One',
        vintage: '2020',
        bottleSize: '750ML'
      })
    ]);

  return function restore() {
    OutstandingOrdersEodReportService.applyToSummaryRows = originalOutstanding;
    PalletAndProductByMembersEodReportService.getLookupForDate_ = originalLookup;
  };
}

function assertSummaryProductTupleWritten_(sheet, messagePrefix) {
  assertSummaryRowProductTupleWritten_(
    sheet,
    Number(CONFIG.summary.headerRow || 2) + 1,
    messagePrefix
  );
}

function assertSummaryRowProductTupleWritten_(sheet, rowNumber, messagePrefix) {
  const headers = sheet.getHeaderValues
    ? sheet.getHeaderValues()
    : sheet
      .getRange(CONFIG.summary.headerRow, 1, 1, sheet.getLastColumn())
      .getValues()[0];

  function value(headerName) {
    const col = getColumnIndex_(headers, headerName);

    assertTruthy_(col > 0, `${headerName} column missing.`);

    return sheet.getRange(rowNumber, col).getValue();
  }

  function note(headerName) {
    const col = getColumnIndex_(headers, headerName);

    assertTruthy_(col > 0, `${headerName} column missing.`);

    return sheet.getRange(rowNumber, col).getNote();
  }

  assertEquals_('A-01-02', value('Location'), `${messagePrefix} Location should be filled from the same match.`);
  assertEquals_('M001', value('Member'), `${messagePrefix} Member should be filled from the same B+Owner evidence.`);
  assertEquals_('P001', value('Product Code'), `${messagePrefix} Product Code should be written.`);
  assertEquals_('Product One', value('Product Description'), `${messagePrefix} Product Description should be written.`);
  assertEquals_('2020', String(value('Vintage')), `${messagePrefix} Vintage should be written.`);
  assertEquals_('750ML', value('Bottle Size'), `${messagePrefix} Bottle Size should be written.`);
  assertContains_(
    note('B Number'),
    'Product Code: P001',
    `${messagePrefix} B Number note should still be written.`
  );
  assertContains_(
    note('B Number'),
    'Product Description: Product One',
    `${messagePrefix} B Number note should use the same product tuple.`
  );
}

function withEodAppendStub_(callback) {
  const originalEnrich = EodReportCoordinator.enrichSummaryDrafts;

  EodReportCoordinator.enrichSummaryDrafts = drafts => drafts || [];

  try {
    return callback();
  } finally {
    EodReportCoordinator.enrichSummaryDrafts = originalEnrich;
  }
}

function setInflatedSummaryLastRowMarker_(sheet) {
  const markerRow = Math.max(1000, sheet.getLastRow() + 25);
  const markerCol = 2;

  if (sheet.getMaxRows() < markerRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), markerRow - sheet.getMaxRows());
  }

  sheet
    .getRange(markerRow, markerCol)
    .setValue(false);

  return {
    rowNumber: markerRow,
    columnNumber: markerCol
  };
}

function clearInflatedSummaryLastRowMarker_(sheet, marker) {
  if (!marker) {
    return;
  }

  sheet
    .getRange(marker.rowNumber, marker.columnNumber)
    .clearContent();
}

function findRowByFirstColumnValue_(sheet, value) {
  if (sheet.getLastRow() < 2) {
    return {
      rowNumber: -1,
      rowValues: []
    };
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]) === String(value)) {
      return {
        rowNumber: index + 2,
        rowValues: values[index]
      };
    }
  }

  return {
    rowNumber: -1,
    rowValues: []
  };
}

function findRowsWhereFirstColumnStartsWith_(sheet, prefix) {
  const matches = [];

  if (sheet.getLastRow() < 2) {
    return matches;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  values.forEach((row, index) => {
    const value = String(row[0] || '');

    if (value.startsWith(prefix)) {
      matches.push({
        rowNumber: index + 2,
        rowValues: row
      });
    }
  });

  return matches;
}

function deleteRowsWhereFirstColumnStartsWith_(sheet, prefix) {
  const maxRows = sheet.getMaxRows();

  if (maxRows < 2) return;

  const values = sheet
    .getRange(2, 1, maxRows - 1, 1)
    .getValues();

  for (let index = values.length - 1; index >= 0; index--) {
    const value = String(values[index][0] || '');

    if (value.startsWith(prefix)) {
      sheet.deleteRow(index + 2);
    }
  }
}

function getNextTestSummaryRow_(sheet) {
  if (
    typeof SummaryService !== 'undefined' &&
    typeof SummaryService.getNextSummaryAppendRow_ === 'function'
  ) {
    return SummaryService.getNextSummaryAppendRow_(sheet);
  }

  const startRow = Number(CONFIG.summary.headerRow || 2) + 1;
  const maxRows = sheet.getMaxRows();

  if (maxRows < startRow) {
    return startRow;
  }

  const values = sheet
    .getRange(startRow, 1, maxRows - startRow + 1, 1)
    .getValues();

  let lastKeyRow = startRow - 1;

  values.forEach((row, index) => {
    if (String(row[0] || '').trim()) {
      lastKeyRow = startRow + index;
    }
  });

  return Math.max(lastKeyRow + 1, startRow);
}

function getColumnIndex_(headers, headerName) {
  return headers.indexOf(headerName) + 1;
}
