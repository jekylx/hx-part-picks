/**
 * Code.gs
 * Main entry points.
 *
 * Critical rules:
 * - setup() is manual / one-time.
 * - processPrinterEmails() must not run setup().
 * - Gmail labels are thread-level visibility markers only; they are not dedupe.
 * - The Gmail search stays Inbox-only and does not exclude processed/failed
 *   labels: later printer replies can return archived daily threads to Inbox.
 * - Batch PDFs are deduped by BATCH::<md5(original PDF bytes)> before split.
 * - Split pages are deduped by BATCH::<same hash>::PAGE-<pageNumber>.
 * - Gemini is optional: extraction failure must still create a blank review row.
 * - Critical failure only means Drive save and/or sheet append failed.
 * - Critical page failure must prevent writing the batch-level completion key.
 * - Part Picks stores raw Gemini output as plain text; summary/EOD normalises later.
 * - A row is successful if the PDF is saved to Drive and a row is appended to the sheet.
 */

function setup() {
  LabelService.setupLabels();
  SheetService.setupSheets();
  DriveService.setupFolders();
  SummaryService.appendMissingSummaryRows();
  SheetService.protectImplementationSheets();
  SheetService.hideImplementationSheets();

  Logger.log('Setup complete. Add a time trigger for processPrinterEmails.');
}

function handleSummaryRefreshEdit(e) {
  const route = getSummaryEditRoute_(e);

  if (!route) {
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  if (route === 'refresh_eod') {
    refreshSummaryRowFromEdit_(e, lock);
    return;
  }

  if (route === 'send_email') {
    SummaryEmailService.sendSummaryRowFromEdit(e, lock);
  }
}

function refreshSummaryRowFromEdit_(e, lock) {
  try {
    const range = e.range;
    EodReportCoordinator.refreshSummaryRow(range.getSheet(), range.getRow());
  } finally {
    try {
      e.range.setValue(false);
    } finally {
      lock.releaseLock();
    }
  }
}

function installSummaryRefreshTrigger() {
  const handlerName = 'handleSummaryRefreshEdit';
  const triggers = ScriptApp.getProjectTriggers();

  if (hasProjectTriggerForHandler_(triggers, handlerName)) {
    Logger.log(`${handlerName} trigger already installed.`);
    return;
  }

  ScriptApp
    .newTrigger(handlerName)
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log(`${handlerName} trigger installed.`);
}

function isSummaryRefreshEdit_(e) {
  return isSummaryCheckboxEditForHeader_(e, 'Refresh EOD');
}

function isSummarySendEmailEdit_(e) {
  return isSummaryCheckboxEditForHeader_(e, 'Send Email');
}

function getSummaryEditRoute_(e) {
  if (isSummaryRefreshEdit_(e)) {
    return 'refresh_eod';
  }

  if (isSummarySendEmailEdit_(e)) {
    return 'send_email';
  }

  return '';
}

function isSummaryCheckboxEditForHeader_(e, headerName) {
  if (!e || !e.range) {
    return false;
  }

  const range = e.range;

  if (
    range.getNumRows() !== 1 ||
    range.getNumColumns() !== 1
  ) {
    return false;
  }

  const sheet = range.getSheet();

  if (!sheet || sheet.getName() !== CONFIG.summary.sheetName) {
    return false;
  }

  if (range.getRow() <= Number(CONFIG.summary.headerRow || 2)) {
    return false;
  }

  const actionColumn = getSummaryColumnIndexByHeader_(sheet, headerName);

  if (actionColumn <= 0 || range.getColumn() !== actionColumn) {
    return false;
  }

  return isCheckedEditValue_(e.value);
}

function isCheckedEditValue_(value) {
  return value === true || String(value || '').toUpperCase() === 'TRUE';
}

function getSummaryColumnIndexByHeader_(sheet, headerName) {
  const headerRow = Number(CONFIG.summary.headerRow || 2);

  if (!sheet || sheet.getLastColumn() < 1) {
    return 0;
  }

  const headers = sheet
    .getRange(headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  return headers.indexOf(headerName) + 1;
}

function hasProjectTriggerForHandler_(triggers, handlerName) {
  return (triggers || []).some(trigger =>
    trigger &&
    typeof trigger.getHandlerFunction === 'function' &&
    trigger.getHandlerFunction() === handlerName
  );
}

function processPrinterEmails() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Do not exclude Processed/Failed labels here: the printer keeps appending
    // later scans as replies to the same daily Gmail thread.
    const query = GmailService.buildSearchQuery();
    const threads = GmailApp.search(query, 0, CONFIG.gmail.maxThreadsPerRun);

    LogService.info(
      'SEARCH',
      '',
      '',
      `Found ${threads.length} thread(s): ${query}`
    );

    threads.forEach(thread => processThread_(thread));

    SummaryService.appendMissingSummaryRows();
  } finally {
    lock.releaseLock();
  }
}

function processThread_(thread) {
  const processedLabel = LabelService.getOrCreateLabel_(CONFIG.gmail.processedLabel);
  const failedLabel = LabelService.getOrCreateLabel_(CONFIG.gmail.failedLabel);

  let anyCriticalFailure = false;
  let processedAnyPdf = false;
  let skippedAnyDuplicate = false;

  thread.getMessages().forEach(message => {
    const batchPdfs = GmailService.getPdfAttachments(message);

    batchPdfs.forEach(batchPdf => {
      const batchProcessingKey = buildBatchProcessingKey_(batchPdf);

      // Batch key is a fast pre-split completion marker for this exact original
      // PDF. Older processed rows may only have page keys, so absence of this
      // marker does not prove the pages are new.
      if (DedupeService.hasProcessed(batchProcessingKey)) {
        skippedAnyDuplicate = true;

        LogService.info(
          'SKIPPED_DUPLICATE_BATCH',
          message.getId(),
          batchPdf.getName(),
          batchProcessingKey
        );

        return;
      }

      const pagePdfs = splitPdfOrFallbackToBatch_(batchPdf, message);
      let allPagesAccountedFor = true;

      pagePdfs.forEach(pagePdf => {
        const processingKey = buildPageProcessingKey_(batchPdf, pagePdf);

        // Page keys protect row uniqueness and partial retries after a critical
        // failure. A single existing page key must never be treated as proof
        // that the whole batch completed.
        if (DedupeService.hasProcessed(processingKey)) {
          skippedAnyDuplicate = true;

          LogService.info(
            'SKIPPED_DUPLICATE',
            message.getId(),
            pagePdf.filename,
            processingKey
          );

          return;
        }

        let archiveFile = null;

        try {
          archiveFile = DriveService.archivePdf(pagePdf.blob, message);

          const extractionResult = extractFormOrBlank_(pagePdf.blob, message, pagePdf);

          SheetService.appendPartPickRow({
            message,
            pdf: pagePdf.blob,
            archiveFile,
            form: extractionResult.form,
            processingKey,
            extractionStatus: extractionResult.extractionStatus,
            extractionError: extractionResult.extractionError
          });

          DedupeService.markProcessed(
            processingKey,
            message,
            batchPdf,
            archiveFile,
            extractionResult.extractionStatus === 'AUTO_EXTRACTED' ? 1 : 0
          );

          LogService.info(
            'PROCESSED',
            message.getId(),
            pagePdf.filename,
            [
              'Drive saved and sheet row appended.',
              `Extraction status: ${extractionResult.extractionStatus}`,
              `Rotation applied: ${pagePdf.rotationApplied || 0}`
            ].join(' ')
          );

          processedAnyPdf = true;
        } catch (err) {
          anyCriticalFailure = true;
          allPagesAccountedFor = false;

          LogService.error(
            'FAILED_DRIVE_OR_SHEET',
            message.getId(),
            pagePdf.filename,
            err,
            archiveFile ? archiveFile.getUrl() : ''
          );
        }
      });

      // Only mark the whole batch complete after every page was either already
      // accounted for or successfully saved to Drive and appended to the sheet.
      if (allPagesAccountedFor) {
        DedupeService.markProcessed(
          batchProcessingKey,
          message,
          batchPdf,
          null,
          0
        );
      }
    });
  });

  if (anyCriticalFailure) {
    thread.addLabel(failedLabel);
  }

  if ((processedAnyPdf || skippedAnyDuplicate) && !anyCriticalFailure) {
    thread.addLabel(processedLabel);
    thread.markRead();
    // Archive processed threads to keep Inbox clean. Processed labels are not
    // excluded from search because later printer replies can return the daily
    // thread to Inbox; batch/page dedupe handles already-seen PDFs/pages.
    thread.moveToArchive();
  }
}

function splitPdfOrFallbackToBatch_(batchPdf, message) {
  try {
    // The scanner can merge back-to-back scans into one N-page PDF. The splitter
    // service returns one portrait-oriented PDF per source page.
    const pagePdfs = PdfService.splitIntoPortraitPages(batchPdf);

    LogService.info(
      'SPLIT_BATCH_PDF',
      message.getId(),
      batchPdf.getName(),
      `Split into ${pagePdfs.length} one-page PDF(s).`
    );

    return pagePdfs;
  } catch (err) {
    const errorText = stringifyError_(err);

    // Split failure is non-fatal to ingestion: archive the original batch PDF
    // and create a review row so the operator still sees the work item.
    LogService.error(
      'PDF_SPLIT_FAILED_NON_FATAL',
      message.getId(),
      batchPdf.getName(),
      err,
      ''
    );

    return [
      {
        pageNumber: 1,
        filename: batchPdf.getName(),
        blob: batchPdf,
        rotationApplied: 0,
        extractionStatus: 'PDF_SPLIT_FAILED',
        extractionError: errorText
      }
    ];
  }
}

function extractFormOrBlank_(pagePdfBlob, message, pagePdf) {
  if (pagePdf.extractionStatus === 'PDF_SPLIT_FAILED') {
    return {
      form: buildBlankForm_('PDF split failed. Original batch PDF was saved instead.'),
      extractionStatus: 'PDF_SPLIT_FAILED',
      extractionError: pagePdf.extractionError || ''
    };
  }

  try {
    const extraction = GeminiService.extractPdf(pagePdfBlob);
    const forms = GeminiService.normalizeForms(extraction);

    if (!forms.length) {
      throw new Error('Gemini returned no forms for one-page PDF.');
    }

    if (forms.length > 1) {
      LogService.info(
        'MULTIPLE_FORMS_RETURNED_FOR_ONE_PAGE',
        message.getId(),
        pagePdf.filename,
        `Gemini returned ${forms.length} forms for one-page PDF. Using the first form only.`
      );
    }

    return {
      form: forms[0],
      extractionStatus: 'AUTO_EXTRACTED',
      extractionError: ''
    };
  } catch (err) {
    const errorText = stringifyError_(err);

    // Extraction is advisory. A blank row that needs review is still a
    // successful page if Drive save and sheet append complete.
    LogService.error(
      'GEMINI_FAILED_NON_FATAL',
      message.getId(),
      pagePdf.filename,
      err,
      ''
    );

    return {
      form: buildBlankForm_('Gemini extraction failed. Manual entry required.'),
      extractionStatus: 'GEMINI_FAILED',
      extractionError: errorText
    };
  }
}

function buildBlankForm_(reason) {
  const form = {};

  CONFIG.fields.forEach(field => {
    form[field.key] = null;
  });

  form.needs_review = true;
  form.review_reasons = [reason || 'Manual entry required.'];

  return form;
}

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

function stringifyError_(err) {
  if (!err) return '';

  if (err.stack) {
    return String(err.stack);
  }

  return String(err);
}
