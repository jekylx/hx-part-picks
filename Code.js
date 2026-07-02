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

function repairAppendMissingSummaryRows() {
  const stats = SummaryService.appendMissingSummaryRows();
  Logger.log(`Missing summary rows append repair complete: ${JSON.stringify(stats)}`);
}
