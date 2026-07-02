/**
 * Code.gs
 * Main entry points.
 *
 * Critical rules:
 * - setup() is manual maintenance.
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

  if (route === 'refresh_eod') {
    schedulePendingSummaryRefreshWorker_();
    return;
  }

  if (route === 'send_email') {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    SummaryEmailService.sendSummaryRowFromEdit(e, lock);
  }
}

function onOpen() {
  addSummaryMenu_(SpreadsheetApp.getUi());
}

function addSummaryMenu_(ui) {
  if (!ui || typeof ui.createMenu !== 'function') {
    return;
  }

  ui
    .createMenu('Summary')
    .addItem('Refresh Checked Rows', 'processPendingSummaryRefreshes')
    .addToUi();
}

function processPendingSummaryRefreshes() {
  processPendingSummaryRefreshes_({
    spreadsheetApp: SpreadsheetApp,
    lockService: LockService,
    scriptApp: ScriptApp,
    logger: Logger,
    now: () => Date.now()
  });
}

function processPendingSummaryRefreshes_(deps) {
  const services = deps || {};
  const lockService = services.lockService || LockService;
  const logger = services.logger || Logger;
  const now = services.now || (() => Date.now());
  const lock = lockService.getScriptLock();
  const stats = {
    checkedRowsFound: 0,
    rowsRefreshed: 0,
    rowsFailed: 0,
    rowsSkipped: 0,
    groupsProcessed: 0,
    continuationScheduled: false,
    deadlineHit: false
  };

  if (!lock.tryLock(1000)) {
    logPendingSummaryRefreshBatch_(logger, stats, 'lock_unavailable');
    return stats;
  }

  try {
    const spreadsheetApp = services.spreadsheetApp || SpreadsheetApp;
    const spreadsheet = spreadsheetApp.getActive();
    const sheet = spreadsheet && spreadsheet.getSheetByName(CONFIG.summary.sheetName);

    if (!sheet) {
      throw new Error(`Summary sheet not found: ${CONFIG.summary.sheetName}`);
    }

    const refreshColumn = getSummaryColumnIndexByHeader_(
      sheet,
      SummaryService.getRefreshEodHeader_()
    );

    if (refreshColumn <= 0) {
      throw new Error(`Summary Refresh column not found: ${SummaryService.getRefreshEodHeader_()}`);
    }

    const deadline = Number(services.deadline || (now() + (4.5 * 60 * 1000)));
    const checkedRows = getPendingSummaryRefreshRows_(sheet, refreshColumn);
    const groups = groupContiguousRows_(checkedRows);

    stats.checkedRowsFound = checkedRows.length;

    for (let index = 0; index < groups.length; index++) {
      if (isPendingSummaryRefreshDeadlineNear_(now, deadline)) {
        stats.deadlineHit = true;
        stats.rowsSkipped += countRowsInGroups_(groups.slice(index));
        break;
      }

      const group = groups[index];
      const groupResult = refreshPendingSummaryRefreshGroup_(
        sheet,
        refreshColumn,
        group.startRow,
        group.rowCount
      );

      stats.groupsProcessed++;
      stats.rowsRefreshed += groupResult.rowsRefreshed;
      stats.rowsFailed += groupResult.rowsFailed;

      if (
        index < groups.length - 1 &&
        isPendingSummaryRefreshDeadlineNear_(now, deadline)
      ) {
        stats.deadlineHit = true;
        stats.rowsSkipped += countRowsInGroups_(groups.slice(index + 1));
        break;
      }
    }

    if (stats.deadlineHit) {
      clearPendingSummaryRefreshTriggers_(services);
      stats.continuationScheduled = schedulePendingSummaryRefreshWorker_(
        Object.assign({}, services, { skipLock: true })
      );
    } else {
      clearPendingSummaryRefreshTriggers_(services);
    }

    logPendingSummaryRefreshBatch_(logger, stats, 'complete');

    return stats;
  } catch (err) {
    logPendingSummaryRefreshError_(err);
    throw err;
  } finally {
    lock.releaseLock();
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

function schedulePendingSummaryRefreshWorker_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;
  const lockService = services.lockService || LockService;
  const lock = services.skipLock ? null : lockService.getScriptLock();
  let locked = !!services.skipLock;

  if (!services.skipLock && typeof lock.tryLock === 'function') {
    locked = lock.tryLock(1000);
  } else if (!services.skipLock) {
    lock.waitLock(1000);
    locked = true;
  }

  if (!locked) {
    return false;
  }

  try {
    if (hasPendingSummaryRefreshTrigger_(services)) {
      return false;
    }

    scriptApp
      .newTrigger('processPendingSummaryRefreshes')
      .timeBased()
      .after(60 * 1000)
      .create();

    return true;
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

function clearPendingSummaryRefreshTriggers_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;
  const triggers = scriptApp.getProjectTriggers();

  (triggers || []).forEach(trigger => {
    if (
      trigger &&
      typeof trigger.getHandlerFunction === 'function' &&
      trigger.getHandlerFunction() === 'processPendingSummaryRefreshes'
    ) {
      scriptApp.deleteTrigger(trigger);
    }
  });
}

function hasPendingSummaryRefreshTrigger_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;

  return hasProjectTriggerForHandler_(
    scriptApp.getProjectTriggers(),
    'processPendingSummaryRefreshes'
  );
}

function getPendingSummaryRefreshRows_(sheet, refreshColumn) {
  const dataStartRow = Number(CONFIG.summary.headerRow || 2) + 1;
  const lastRow = sheet.getLastRow();

  if (lastRow < dataStartRow) {
    return [];
  }

  const values = sheet
    .getRange(dataStartRow, refreshColumn, lastRow - dataStartRow + 1, 1)
    .getValues();
  const rows = [];

  values.forEach((row, index) => {
    if (isCheckedEditValue_(row[0])) {
      rows.push(dataStartRow + index);
    }
  });

  return rows;
}

function groupContiguousRows_(rows) {
  const groups = [];

  (rows || []).forEach(rowNumber => {
    const last = groups[groups.length - 1];

    if (last && last.startRow + last.rowCount === rowNumber) {
      last.rowCount++;
      return;
    }

    groups.push({
      startRow: rowNumber,
      rowCount: 1
    });
  });

  return groups;
}

function refreshPendingSummaryRefreshGroup_(sheet, refreshColumn, startRow, rowCount) {
  const result = {
    rowsRefreshed: 0,
    rowsFailed: 0
  };

  try {
    EodReportCoordinator.applyToSummaryRowsOrThrow(sheet, startRow, rowCount);
    clearSummaryRefreshCheckboxes_(sheet, refreshColumn, startRow, rowCount);
    result.rowsRefreshed += rowCount;
    return result;
  } catch (err) {
    for (let offset = 0; offset < rowCount; offset++) {
      const rowNumber = startRow + offset;

      try {
        EodReportCoordinator.applyToSummaryRowsOrThrow(sheet, rowNumber, 1);
        sheet.getRange(rowNumber, refreshColumn).setValue(false);
        result.rowsRefreshed++;
      } catch (rowErr) {
        EodReportCoordinator.writeRefreshFailure_(sheet, rowNumber, rowErr);
        EodReportCoordinator.logError_('EOD_REPORT_PENDING_REFRESH_ROW_FAILED', '', rowErr);
        sheet.getRange(rowNumber, refreshColumn).setValue(false);
        result.rowsFailed++;
      }
    }
  }

  return result;
}

function clearSummaryRefreshCheckboxes_(sheet, refreshColumn, startRow, rowCount) {
  const values = new Array(rowCount).fill(null).map(() => [false]);

  sheet
    .getRange(startRow, refreshColumn, rowCount, 1)
    .setValues(values);
}

function isPendingSummaryRefreshDeadlineNear_(now, deadline) {
  return now() >= deadline - 10000;
}

function countRowsInGroups_(groups) {
  return (groups || []).reduce((total, group) => total + group.rowCount, 0);
}

function logPendingSummaryRefreshBatch_(logger, stats, status) {
  const details = [
    `status=${status}`,
    `checkedRowsFound=${stats.checkedRowsFound}`,
    `rowsRefreshed=${stats.rowsRefreshed}`,
    `rowsFailed=${stats.rowsFailed}`,
    `rowsSkipped=${stats.rowsSkipped}`,
    `groupsProcessed=${stats.groupsProcessed}`,
    `continuationScheduled=${stats.continuationScheduled}`,
    `deadlineHit=${stats.deadlineHit}`
  ].join(' ');

  if (logger && typeof logger.log === 'function') {
    logger.log(`processPendingSummaryRefreshes ${details}`);
  }
}

function logPendingSummaryRefreshError_(err) {
  if (
    typeof LogService !== 'undefined' &&
    typeof LogService.error === 'function'
  ) {
    LogService.error('EOD_REPORT_PENDING_REFRESH_FAILED', '', '', err, '');
    return;
  }

  Logger.log(`EOD_REPORT_PENDING_REFRESH_FAILED: ${err && err.stack ? err.stack : String(err)}`);
}

function warmTodayEodReportCache() {
  const dateKey = EodReportCsvService.getCurrentDateKey_();
  const reportKeys = [
    'outstandingOrders',
    'palletAndProductByMembers'
  ];

  reportKeys.forEach(reportKey => {
    const result = EodReportCsvService.getReportForDateResult_(reportKey, dateKey);
    const report = result.report;
    const rowCount = report && Array.isArray(report.rows) ? report.rows.length : 0;

    Logger.log([
      'EOD cache warmup',
      `reportKey=${reportKey}`,
      `dateKey=${dateKey}`,
      `status=${result.status}`,
      `rowCount=${rowCount}`
    ].join(' '));
  });
}

function installDailyEodCacheWarmupTrigger() {
  installDailyEodCacheWarmupTrigger_({
    scriptApp: ScriptApp
  });
}

function installDailyEodCacheWarmupTrigger_(deps) {
  const services = deps || {};
  const scriptApp = services.scriptApp || ScriptApp;
  const handlerName = 'warmTodayEodReportCache';
  const triggers = scriptApp.getProjectTriggers();

  if (hasProjectTriggerForHandler_(triggers, handlerName)) {
    Logger.log(`${handlerName} trigger already installed.`);
    return;
  }

  scriptApp
    .newTrigger(handlerName)
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();

  Logger.log(`${handlerName} daily 5am trigger installed.`);
}

function isSummaryRefreshEdit_(e) {
  return isSummaryCheckboxEditForHeader_(e, SummaryService.getRefreshEodHeader_());
}

function isSummarySendEmailEdit_(e) {
  return isSummaryCheckboxColumnEditForHeader_(e, SummaryService.getSendEmailHeader_());
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
  if (!isSummaryCheckboxColumnEditForHeader_(e, headerName)) {
    return false;
  }

  return isCheckedEditValue_(e.value);
}

function isSummaryCheckboxColumnEditForHeader_(e, headerName) {
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

  return true;
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
  processPrinterEmails_({
    lockService: LockService,
    gmailApp: GmailApp,
    gmailService: GmailService,
    summaryService: SummaryService,
    threadProcessor: processThread_
  });
}

function processPrinterEmails_(deps) {
  const services = deps || {};
  const lockService = services.lockService || LockService;
  const gmailApp = services.gmailApp || GmailApp;
  const gmailService = services.gmailService || GmailService;
  const summaryService = services.summaryService || SummaryService;
  const threadProcessor = services.threadProcessor || processThread_;
  const lock = lockService.getScriptLock();
  lock.waitLock(30000);

  try {
    Logger.log('processPrinterEmails start.');

    // Do not exclude Processed/Failed labels here: the printer keeps appending
    // later scans as replies to the same daily Gmail thread.
    const query = gmailService.buildSearchQuery();

    Logger.log(`processPrinterEmails Gmail query: ${query}`);

    const threads = gmailApp.search(query, 0, CONFIG.gmail.maxThreadsPerRun);

    LogService.info(
      'SEARCH',
      '',
      '',
      `Found ${threads.length} thread(s): ${query}`
    );
    Logger.log(`processPrinterEmails found ${threads.length} thread(s).`);

    threads.forEach((thread, index) => {
      try {
        const threadId =
          thread && typeof thread.getId === 'function'
            ? thread.getId()
            : `index ${index + 1}`;

        Logger.log(`processPrinterEmails processing thread ${index + 1}/${threads.length}: ${threadId}`);
        threadProcessor(thread);
      } catch (err) {
        LogService.error(
          'THREAD_FAILED_UNEXPECTED',
          '',
          '',
          err,
          ''
        );
        Logger.log('processPrinterEmails unexpected thread failure.');
        Logger.log(err && err.stack ? err.stack : String(err));
      }
    });

    Logger.log('processPrinterEmails appending missing summary rows.');
    summaryService.appendMissingSummaryRows();
    Logger.log('processPrinterEmails appended missing summary rows.');
  } finally {
    Logger.log('processPrinterEmails end.');
    lock.releaseLock();
  }
}

function repairAppendMissingSummaryRows() {
  const stats = SummaryService.appendMissingSummaryRows();
  Logger.log(`Missing summary rows append repair complete: ${JSON.stringify(stats)}`);
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
