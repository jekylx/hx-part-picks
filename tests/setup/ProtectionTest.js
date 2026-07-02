/**
 * ProtectionTest.js — internal sheet protection: idempotent helpers,
 * hidden+protected internal sheets, effective-user-only editors,
 * Summary protection cleanup.
 */

function getProtectionTestCases_() {
  return [
    { name: 'Sheet protection helper is idempotent', fn: testSheetProtectionHelperIdempotent_, suite: 'sheet_setup' },
    { name: 'New internal sheets are hidden and protected', fn: testNewInternalSheetsAreHiddenAndProtected_, suite: 'sheet_setup' },
    { name: 'New internal sheet protections retain effective user', fn: testInternalSheetProtectionRetainsOnlyEffectiveUser_, suite: 'sheet_setup' },
    { name: 'Summary sheet removes only HX internal protection', fn: testSummaryProtectionCleanup_, suite: 'sheet_setup' }
  ];
}

function testSheetProtectionHelperIdempotent_() {
  const effectiveUser = buildMockUser_('owner@example.com');
  const sheet = buildMockProtectableSheet_('Part Picks', []);

  SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);
  SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);

  const activeProtections = sheet.protections.filter(protection => !protection.removed);

  assertEquals_(1, activeProtections.length, 'Repeated protection setup should not create duplicates.');
  assertEquals_(
    SheetService.internalProtectionDescription,
    activeProtections[0].getDescription(),
    'Internal protection description should be recognizable.'
  );
  assertEquals_(false, activeProtections[0].domainEdit, 'Domain editing should be disabled.');
  assertEquals_(false, activeProtections[0].warningOnly, 'Internal protection should not be warning-only.');
  assertEquals_(
    1,
    activeProtections[0].editors.length,
    'Only the effective user should remain as explicit editor.'
  );
  assertEquals_(
    'owner@example.com',
    activeProtections[0].editors[0].getEmail(),
    'Effective user should be retained as editor.'
  );
}

function testNewInternalSheetsAreHiddenAndProtected_() {
  ensureLocalTestSetup_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const effectiveUser = Session.getEffectiveUser();
  const effectiveEmail = SheetService.getUserEmail_(effectiveUser);
  const newInternalSheetNames = [
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName
  ];

  newInternalSheetNames.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    const protection = assertInternalSheetProtected_(sheet, sheetName);

    assertEquals_(true, SheetService.shouldHideImplementationSheet_(sheetName), `${sheetName} should use the normal internal sheet hiding rule.`);

    if (typeof sheet.isSheetHidden === 'function') {
      assertEquals_(true, sheet.isSheetHidden(), `${sheetName} should be hidden by setup.`);
    }

    if (effectiveEmail) {
      const editorEmails = protection.getEditors().map(editor =>
        SheetService.getUserEmail_(editor)
      );

      assertTruthy_(
        editorEmails.indexOf(effectiveEmail) > -1,
        `${sheetName} should explicitly retain the effective user as protection editor.`
      );
    }
  });

  assertEquals_(
    false,
    SheetService.shouldHideImplementationSheet_(CONFIG.summary.sheetName),
    'Summary should remain visible/editable.'
  );

  const summarySheet = ss.getSheetByName(CONFIG.summary.sheetName);
  if (typeof summarySheet.isSheetHidden === 'function') {
    assertEquals_(false, summarySheet.isSheetHidden(), 'Summary should remain visible after setup.');
  }
}

function testInternalSheetProtectionRetainsOnlyEffectiveUser_() {
  const effectiveUser = buildMockUser_('owner@example.com');
  const newInternalSheetNames = [
    CONFIG.sheets.eodReportCacheSheetName,
    CONFIG.sheets.eodOutstandingOrdersCacheSheetName,
    CONFIG.sheets.eodPalletProductCacheSheetName,
    CONFIG.sheets.summaryEmailLedgerSheetName
  ];

  newInternalSheetNames.forEach(sheetName => {
    const sheet = buildMockProtectableSheet_(sheetName, []);

    SheetService.ensureInternalSheetProtection_(sheet, effectiveUser);

    const protection = sheet.protections[0];

    assertEquals_(true, SheetService.shouldHideImplementationSheet_(sheetName), `${sheetName} should use the normal internal sheet hiding rule.`);
    assertEquals_(false, protection.domainEdit, `${sheetName} domain editing should be disabled.`);
    assertEquals_(
      'owner@example.com',
      protection.editors[0].getEmail(),
      `${sheetName} should explicitly retain the effective user as editor.`
    );
  });

  assertEquals_(
    true,
    SheetService.shouldHideImplementationSheet_(CONFIG.sheets.extractedSheetName),
    'Older internal implementation sheets should remain hideable.'
  );
  assertEquals_(
    false,
    SheetService.shouldHideImplementationSheet_(CONFIG.summary.sheetName),
    'Summary should remain visible/editable.'
  );
}

function testSummaryProtectionCleanup_() {
  const hxProtection = buildMockProtection_(SheetService.internalProtectionDescription);
  const manualProtection = buildMockProtection_('Manual finance lock');
  const summarySheet = buildMockProtectableSheet_(
    CONFIG.summary.sheetName,
    [hxProtection, manualProtection]
  );

  SheetService.removeScriptInternalProtections_(summarySheet);

  assertEquals_(true, hxProtection.removed, 'HX internal protection should be removed from summary.');
  assertEquals_(false, manualProtection.removed, 'Manual summary protections should not be removed.');
}

function assertInternalSheetProtected_(sheet, sheetName) {
  assertTruthy_(sheet, `Missing internal sheet: ${sheetName}`);

  const protections = SheetService.getScriptInternalProtections_(sheet);

  assertEquals_(
    1,
    protections.length,
    `Expected exactly one HX internal sheet protection on ${sheetName}.`
  );
  assertEquals_(
    SheetService.internalProtectionDescription,
    protections[0].getDescription(),
    `Unexpected protection description on ${sheetName}.`
  );

  return protections[0];
}
