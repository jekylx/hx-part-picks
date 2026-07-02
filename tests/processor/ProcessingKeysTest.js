/**
 * ProcessingKeysTest.js — batch/page processing key stability and legacy
 * key handling. Processed keys are the dedupe source of truth (not labels).
 */

function getProcessingKeysTestCases_() {
  return [
    { name: 'Batch and page processing keys are stable and unique', fn: testPageProcessingKey_, suite: 'core' },
    { name: 'Legacy page key does not skip whole batch', fn: testLegacyPageKeyDoesNotSkipBatch_, suite: 'core' }
  ];
}

function testPageProcessingKey_() {
  const batchPdf = Utilities.newBlob(
    'batch pdf bytes',
    'application/pdf',
    'batch.pdf'
  );

  const pagePdf1a = {
    pageNumber: 1,
    filename: 'batch_page_1.pdf',
    blob: Utilities.newBlob(
      'generated page bytes version A',
      'application/pdf',
      'batch_page_1.pdf'
    )
  };

  const pagePdf1b = {
    pageNumber: 1,
    filename: 'batch_page_1.pdf',
    blob: Utilities.newBlob(
      'generated page bytes version B',
      'application/pdf',
      'batch_page_1.pdf'
    )
  };

  const pagePdf2 = {
    pageNumber: 2,
    filename: 'batch_page_2.pdf',
    blob: Utilities.newBlob(
      'generated page 2 bytes',
      'application/pdf',
      'batch_page_2.pdf'
    )
  };

  const key1a = buildPageProcessingKey_(batchPdf, pagePdf1a);
  const key1b = buildPageProcessingKey_(batchPdf, pagePdf1b);
  const key2 = buildPageProcessingKey_(batchPdf, pagePdf2);
  const batchKey = buildBatchProcessingKey_(batchPdf);
  const expectedBatchKey = `BATCH::${Utils.md5Hex(batchPdf.getBytes())}`;

  assertEquals_(
    expectedBatchKey,
    batchKey,
    'Batch key should use the original batch PDF bytes.'
  );

  assertEquals_(
    `${batchKey}::PAGE-1`,
    key1a,
    'Page key should remain compatible with existing BATCH::<md5>::PAGE-N keys.'
  );

  assertEquals_(
    key1a,
    key1b,
    'Same original batch PDF and page number should generate same processing key even if generated page bytes differ.'
  );

  assertTruthy_(
    key1a !== key2,
    'Different page numbers should generate different processing keys.'
  );

  assertContains_(key1a, 'PAGE-1', 'Page key should include page number.');
  assertContains_(key2, 'PAGE-2', 'Page key should include page number.');
}

function testLegacyPageKeyDoesNotSkipBatch_() {
  const batchPdf = Utilities.newBlob(
    'legacy migration batch pdf bytes',
    'application/pdf',
    'legacy_batch.pdf'
  );

  const pagePdfs = [
    {
      pageNumber: 1,
      filename: 'legacy_batch_page_1.pdf',
      blob: Utilities.newBlob(
        'page 1 bytes',
        'application/pdf',
        'legacy_batch_page_1.pdf'
      )
    },
    {
      pageNumber: 2,
      filename: 'legacy_batch_page_2.pdf',
      blob: Utilities.newBlob(
        'page 2 bytes',
        'application/pdf',
        'legacy_batch_page_2.pdf'
      )
    }
  ];

  const legacyPage1Key = buildPageProcessingKey_(batchPdf, pagePdfs[0]);
  const batchKey = buildBatchProcessingKey_(batchPdf);
  const status = buildBatchPageDedupeStatus_(batchPdf, pagePdfs, [legacyPage1Key]);

  assertEquals_(
    batchKey,
    status.batchProcessingKey,
    'Dedupe status should report the exact batch key.'
  );

  assertEquals_(
    false,
    status.skipBatchBeforeSplit,
    'A legacy page key must not skip the whole batch before splitting.'
  );

  assertEquals_(
    true,
    status.pages[0].skipPageAfterSplit,
    'Existing legacy page 1 key should skip page 1 after splitting.'
  );

  assertEquals_(
    false,
    status.pages[1].skipPageAfterSplit,
    'Missing page 2 key should leave page 2 eligible for processing.'
  );
}
