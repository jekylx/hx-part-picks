/**
 * ProcessingKeyService.js
 *
 * Batch/page processing key construction. Keys are immutable identifiers:
 * BATCH::<md5(original batch PDF bytes)> and ...::PAGE-<pageNumber>.
 * Do not change formats; processed rows depend on them for dedupe.
 */

function buildPageProcessingKey_(batchPdf, pagePdf) {
  // Format: BATCH::<md5(original batch PDF bytes)>::PAGE-<pageNumber>.
  return [
    buildBatchProcessingKey_(batchPdf),
    `PAGE-${pagePdf.pageNumber}`
  ].join('::');
}

function buildBatchProcessingKey_(batchPdf) {
  // Format: BATCH::<md5(original batch PDF bytes)>.
  return [
    'BATCH',
    Utils.md5Hex(batchPdf.getBytes())
  ].join('::');
}

function buildBatchPageDedupeStatus_(batchPdf, pagePdfs, processedKeys) {
  // Test/debug helper that models the production dedupe contract: skip a batch
  // before split only when the batch key exists, then evaluate each page key
  // independently for backwards compatibility and partial retry safety.
  const normalizedProcessedKeys = {};

  (processedKeys || []).forEach(key => {
    const normalizedKey = String(key || '').trim();

    if (normalizedKey) {
      normalizedProcessedKeys[normalizedKey] = true;
    }
  });

  const batchProcessingKey = buildBatchProcessingKey_(batchPdf);

  return {
    batchProcessingKey,
    skipBatchBeforeSplit: !!normalizedProcessedKeys[batchProcessingKey],
    pages: (pagePdfs || []).map(pagePdf => {
      const processingKey = buildPageProcessingKey_(batchPdf, pagePdf);

      return {
        pageNumber: pagePdf.pageNumber,
        processingKey,
        skipPageAfterSplit: !!normalizedProcessedKeys[processingKey]
      };
    })
  };
}
