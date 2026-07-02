/**
 * OneOffProductBackfillTest.js — one-off product backfill admin utility.
 *
 * The production one-off functions are temporary admin tools.
 * DO NOT run them against the live spreadsheet; these tests use mocks only.
 */

function getOneOffProductBackfillTestCases_() {
  return [
    { name: 'One-off product note parser parses Product Code', fn: testOneOffProductBackfillParsesProductCode_, suite: 'summary' },
    { name: 'One-off product note parser parses Product Description', fn: testOneOffProductBackfillParsesProductDescription_, suite: 'summary' },
    { name: 'One-off product note parser parses Vintage', fn: testOneOffProductBackfillParsesVintage_, suite: 'summary' },
    { name: 'One-off product note parser parses Bottle Size', fn: testOneOffProductBackfillParsesBottleSize_, suite: 'summary' },
    { name: 'One-off product backfill preserves existing values by default', fn: testOneOffProductBackfillSkipsExistingValues_, suite: 'summary' },
    { name: 'One-off product backfill skips rows with no note', fn: testOneOffProductBackfillSkipsNoNote_, suite: 'summary' },
    { name: 'One-off product backfill skips unparseable notes', fn: testOneOffProductBackfillSkipsUnparseableNote_, suite: 'summary' },
    { name: 'One-off product backfill requires product headers', fn: testOneOffProductBackfillMissingHeaders_, suite: 'summary' },
    { name: 'One-off note shortcut works in one call', fn: testOneOffProductBackfillNoteShortcutOneCall_, suite: 'summary' },
    { name: 'One-off public refresh processes a batch', fn: testOneOffProductBackfillViaRefreshProcessesBatch_, suite: 'summary' },
    { name: 'One-off public refresh stores state when rows remain', fn: testOneOffProductBackfillViaRefreshStoresState_, suite: 'summary' },
    { name: 'One-off public refresh schedules one continuation trigger', fn: testOneOffProductBackfillViaRefreshSchedulesOneTrigger_, suite: 'summary' },
    { name: 'One-off public refresh avoids duplicate triggers', fn: testOneOffProductBackfillViaRefreshAvoidsDuplicateTriggers_, suite: 'summary' },
    { name: 'One-off refresh trigger continues stored state', fn: testOneOffProductBackfillTriggerContinuesState_, suite: 'summary' },
    { name: 'One-off refresh completion clears trigger and state', fn: testOneOffProductBackfillCompletionClearsState_, suite: 'summary' },
    { name: 'One-off refresh reset clears trigger and state', fn: testOneOffProductBackfillResetClearsState_, suite: 'summary' }
  ];
}

function testOneOffProductBackfillParsesProductCode_() {
  const parsed = oneOffParseProductBackfillNote_(buildOneOffProductBackfillNote_());

  assertEquals_('P001', parsed['Product Code'], 'Product Code should parse from note.');
}

function testOneOffProductBackfillParsesProductDescription_() {
  const parsed = oneOffParseProductBackfillNote_(
    ' product code : P001\nPRODUCT DESCRIPTION: Product One\nVintage: 2020\nBottle Size: 750ML'
  );

  assertEquals_(
    'Product One',
    parsed['Product Description'],
    'Product Description should parse with tolerant label whitespace/case.'
  );
}

function testOneOffProductBackfillParsesVintage_() {
  const parsed = oneOffParseProductBackfillNote_(buildOneOffProductBackfillNote_());

  assertEquals_('2020', parsed['Vintage'], 'Vintage should parse from note.');
}

function testOneOffProductBackfillParsesBottleSize_() {
  const parsed = oneOffParseProductBackfillNote_(buildOneOffProductBackfillNote_());

  assertEquals_('750ML', parsed['Bottle Size'], 'Bottle Size should parse from note.');
}

function testOneOffProductBackfillSkipsExistingValues_() {
  const result = oneOffBuildProductBackfillFromNotes_(
    buildOneOffProductBackfillHeaders_(),
    [[
      'TEST::KEY',
      'B1234567',
      'EXISTING',
      '',
      '',
      ''
    ]],
    [[buildOneOffProductBackfillNote_()]]
  );

  assertEquals_(1, result.stats.rowsScanned, 'Existing-value test should scan one row.');
  assertEquals_(0, result.stats.rowsUpdated, 'Conflicting existing values should not update.');
  assertEquals_(1, result.stats.skippedExistingValues, 'Conflicting existing values should be counted.');
  assertEquals_('EXISTING', result.rows[0][2], 'Existing Product Code should be preserved.');
  assertEquals_('', result.rows[0][3], 'Skipped row should not partially fill Product Description.');
}

function testOneOffProductBackfillSkipsNoNote_() {
  const result = oneOffBuildProductBackfillFromNotes_(
    buildOneOffProductBackfillHeaders_(),
    [[
      'TEST::KEY',
      'B1234567',
      '',
      '',
      '',
      ''
    ]],
    [['']]
  );

  assertEquals_(1, result.stats.rowsScanned, 'No-note test should scan one row.');
  assertEquals_(0, result.stats.rowsUpdated, 'No-note row should not update.');
  assertEquals_(1, result.stats.skippedNoNote, 'No-note row should be counted.');
}

function testOneOffProductBackfillSkipsUnparseableNote_() {
  const result = oneOffBuildProductBackfillFromNotes_(
    buildOneOffProductBackfillHeaders_(),
    [[
      'TEST::KEY',
      'B1234567',
      '',
      '',
      '',
      ''
    ]],
    [['Product Code: P001\nVintage: 2020']]
  );

  assertEquals_(1, result.stats.rowsScanned, 'Unparseable-note test should scan one row.');
  assertEquals_(0, result.stats.rowsUpdated, 'Unparseable note should not update.');
  assertEquals_(1, result.stats.skippedUnparseableNote, 'Unparseable note should be counted.');
}

function testOneOffProductBackfillMissingHeaders_() {
  let failed = false;

  try {
    oneOffBuildProductBackfillFromNotes_(
      ['_Key', 'B Number', 'Product Code', 'Product Description', 'Vintage'],
      [],
      []
    );
  } catch (err) {
    failed = true;
    assertContains_(
      String(err),
      'Bottle Size',
      'Missing-header error should name the missing product column.'
    );
  }

  assertEquals_(true, failed, 'Missing required product headers should fail loudly.');
}

function testOneOffProductBackfillNoteShortcutOneCall_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [[
      'TEST::KEY',
      'B1234567',
      '',
      '',
      '',
      ''
    ]]
  });
  const bCol = env.sheet.getColumnByHeader('B Number');

  env.sheet
    .getRange(CONFIG.summary.headerRow + 1, bCol)
    .setNote(buildOneOffProductBackfillNote_());

  const result = oneOffBackfillProductColumnsFromBNumberNotes({
    spreadsheet: env.spreadsheet
  });

  assertEquals_(1, result.rowsUpdated, 'Note shortcut should update one row in one call.');
  assertEquals_(
    'P001',
    env.sheet.getDataValueByHeader('Product Code'),
    'Note shortcut should write Product Code.'
  );
  assertEquals_(
    'Product One',
    env.sheet.getDataValueByHeader('Product Description'),
    'Note shortcut should write Product Description.'
  );
}

function testOneOffProductBackfillViaRefreshProcessesBatch_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', '']
    ],
    batchSize: 1
  });
  const calls = withMockOneOffRefresh_(env, () =>
    oneOffBackfillProductColumnsViaRefresh(env.options)
  );

  assertEquals_(1, calls.length, 'Public refresh should process one row in the configured batch.');
  assertEquals_(
    CONFIG.summary.headerRow + 1,
    calls[0],
    'Public refresh should start with the first data sheet row number.'
  );
}

function testOneOffProductBackfillViaRefreshStoresState_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', '']
    ],
    batchSize: 1
  });

  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));

  const state = JSON.parse(env.properties.getProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY));

  assertEquals_(CONFIG.summary.headerRow + 2, state.nextRow, 'State should resume at the next row.');
  assertEquals_(1, state.rowsScanned, 'State should store scanned count.');
  assertEquals_(1, state.rowsRefreshed, 'State should store refreshed count.');
}

function testOneOffProductBackfillViaRefreshSchedulesOneTrigger_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', '']
    ],
    batchSize: 1
  });

  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));

  assertEquals_(1, env.triggers.length, 'Public refresh should leave one continuation trigger.');
  assertEquals_(
    ONE_OFF_PRODUCT_BACKFILL_TRIGGER_HANDLER,
    env.triggers[0].getHandlerFunction(),
    'Continuation trigger should use the one-off trigger handler.'
  );
}

function testOneOffProductBackfillViaRefreshAvoidsDuplicateTriggers_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', ''],
      ['TEST::KEY3', 'B1234569', '', '', '', '']
    ],
    batchSize: 1
  });

  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));
  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));

  assertEquals_(1, env.activeTriggerCount(), 'Only one active continuation trigger should remain.');
}

function testOneOffProductBackfillTriggerContinuesState_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', ''],
      ['TEST::KEY3', 'B1234569', '', '', '', '']
    ],
    batchSize: 1
  });

  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));
  const calls = withMockOneOffRefresh_(env, () => oneOffProductBackfillViaRefreshTrigger_(env.options));

  assertEquals_(1, calls.length, 'Trigger handler should process one stored-state row.');
  assertEquals_(CONFIG.summary.headerRow + 2, calls[0], 'Trigger handler should continue from stored nextRow.');
}

function testOneOffProductBackfillCompletionClearsState_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', '']
    ],
    batchSize: 10
  });
  const result = withMockOneOffRefresh_(env, () =>
    oneOffBackfillProductColumnsViaRefresh(env.options)
  ).result;

  assertEquals_(true, result.complete, 'Single-row refresh should complete.');
  assertEquals_(null, env.properties.getProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY), 'Complete refresh should clear state.');
  assertEquals_(0, env.activeTriggerCount(), 'Complete refresh should clear temporary triggers.');
}

function testOneOffProductBackfillResetClearsState_() {
  const env = buildOneOffProductBackfillRefreshEnv_({
    rows: [
      ['TEST::KEY1', 'B1234567', '', '', '', ''],
      ['TEST::KEY2', 'B1234568', '', '', '', '']
    ],
    batchSize: 1
  });

  withMockOneOffRefresh_(env, () => oneOffBackfillProductColumnsViaRefresh(env.options));

  assertTruthy_(
    env.properties.getProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY),
    'Precondition: refresh should have stored state.'
  );

  oneOffResetProductBackfillViaRefreshState(env.options);

  assertEquals_(null, env.properties.getProperty(ONE_OFF_PRODUCT_BACKFILL_STATE_KEY), 'Reset should clear state.');
  assertEquals_(0, env.activeTriggerCount(), 'Reset should clear temporary triggers.');
}

function buildOneOffProductBackfillHeaders_() {
  return [
    '_Key',
    'B Number',
    'Product Code',
    'Product Description',
    'Vintage',
    'Bottle Size'
  ];
}

function buildOneOffProductBackfillNote_() {
  return [
    'Product Code: P001',
    'Product Description: Product One',
    'Vintage: 2020',
    'Bottle Size: 750ML'
  ].join('\n');
}

function buildOneOffProductBackfillRefreshEnv_(settings) {
  const options = settings || {};
  const sheet = buildMockMigratableSummarySheet_(
    buildOneOffProductBackfillHeaders_(),
    options.rows || []
  );
  const properties = buildMockOneOffProperties_();
  const triggers = [];
  const scriptApp = buildMockOneOffScriptApp_(triggers);
  const spreadsheet = {
    getSheetByName(name) {
      return name === CONFIG.summary.sheetName ? sheet : null;
    }
  };

  return {
    sheet,
    spreadsheet,
    properties,
    triggers,
    scriptApp,
    options: {
      spreadsheet,
      properties,
      scriptApp,
      batchSize: options.batchSize || 1,
      triggerAfterMs: 1
    },
    activeTriggerCount() {
      return triggers.filter(trigger => !trigger.deleted).length;
    }
  };
}

function buildMockOneOffProperties_() {
  const values = {};

  return {
    getProperty(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setProperty(key, value) {
      values[key] = String(value);
    },
    deleteProperty(key) {
      delete values[key];
    }
  };
}

function buildMockOneOffScriptApp_(triggers) {
  let sequence = 0;

  return {
    getProjectTriggers() {
      return triggers.filter(trigger => !trigger.deleted);
    },
    deleteTrigger(trigger) {
      trigger.deleted = true;
    },
    newTrigger(handlerName) {
      const trigger = {
        handlerName,
        afterMs: 0,
        deleted: false,
        uniqueId: `ONE_OFF_TRIGGER_${++sequence}`,
        getHandlerFunction() {
          return this.handlerName;
        },
        getUniqueId() {
          return this.uniqueId;
        }
      };

      return {
        timeBased() {
          return this;
        },
        after(ms) {
          trigger.afterMs = ms;
          return this;
        },
        create() {
          triggers.push(trigger);
          return trigger;
        }
      };
    }
  };
}

function withMockOneOffRefresh_(env, fn) {
  const originalRefresh = EodReportCoordinator.refreshSummaryRow;
  const calls = [];

  EodReportCoordinator.refreshSummaryRow = (sheet, rowNumber) => {
    calls.push(rowNumber);
    const headers = sheet.getHeaderValues();
    const productCol = getColumnIndex_(headers, 'Product Code');

    sheet.getRange(rowNumber, productCol).setValue(`P${rowNumber}`);
  };

  try {
    calls.result = fn();
    return calls;
  } finally {
    EodReportCoordinator.refreshSummaryRow = originalRefresh;
  }
}
