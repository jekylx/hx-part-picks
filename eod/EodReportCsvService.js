const EodReportCsvService = {
  _reportCache: {},
  _cacheSheetForTest: null,
  _rowCacheSheetsForTest: null,
  _reportFinderForTest: null,
  _todayDateKeyForTest: null,

  getReportForDate(reportKey, dateKey) {
    return this.getReportForDateResult_(reportKey, dateKey).report;
  },

  getReportForDateResult_(reportKey, dateKey) {
    const cacheKey = `${reportKey}::${dateKey}`;
    const canUseSheetCache = this.isSheetCacheEligibleDate_(dateKey);

    if (this._reportCache[cacheKey] !== undefined) {
      return {
        report: this._reportCache[cacheKey],
        status: 'runtime_hit'
      };
    }

    if (canUseSheetCache) {
      const cachedReport = this.getSheetCachedReport_(reportKey, dateKey, cacheKey);

      if (cachedReport !== undefined) {
        this._reportCache[cacheKey] = cachedReport;
        return {
          report: cachedReport,
          status: 'sheet_hit'
        };
      }
    }

    const report = this._reportFinderForTest
      ? this._reportFinderForTest(reportKey, dateKey)
      : this.findLatestReportForDate_(reportKey, dateKey);

    if (report && canUseSheetCache) {
      this.writeSheetCachedReport_(cacheKey, report);
    }

    this._reportCache[cacheKey] = report;

    return {
      report,
      status: report ? 'refreshed' : 'miss'
    };
  },

  getCurrentDateKey_() {
    if (this._todayDateKeyForTest) {
      return this._todayDateKeyForTest;
    }

    return EodReportNormalisationService.dateKey(new Date());
  },

  isSheetCacheEligibleDate_(dateKey) {
    return String(dateKey || '') === this.getCurrentDateKey_();
  },

  findLatestReportForDate_(reportKey, dateKey) {
    const reportConfig = CONFIG.eodReports.reports[reportKey];

    const query = [
      `from:${CONFIG.eodReports.email.from}`,
      'has:attachment',
      'filename:csv',
      CONFIG.eodReports.email.searchWindow
    ].filter(Boolean).join(' ');

    const threads = GmailApp.search(
      query,
      0,
      CONFIG.eodReports.email.maxThreadsPerRun
    );

    let latest = null;

    threads.forEach(thread => {
      thread.getMessages().forEach(message => {
        const messageDate = message.getDate();

        if (EodReportNormalisationService.dateKey(messageDate) !== dateKey) {
          return;
        }

        if (!this.containsText_(message.getSubject(), reportConfig.subjectContains)) {
          return;
        }

        const attachments = message
          .getAttachments({
            includeInlineImages: false,
            includeAttachments: true
          })
          .filter(attachment => this.isCsvAttachment_(attachment))
          .filter(attachment =>
            this.containsText_(attachment.getName(), reportConfig.filenameContains)
          );

        attachments.forEach(attachment => {
          if (!latest || messageDate > latest.messageDate) {
            latest = {
              message,
              messageDate,
              attachment
            };
          }
        });
      });
    });

    if (!latest) {
      return null;
    }

    return this.parseReport_(reportKey, reportConfig, latest, dateKey);
  },

  parseReport_(reportKey, reportConfig, latest, dateKey) {
    const csvText = latest.attachment.getDataAsString();
    const values = Utilities.parseCsv(csvText);
    const headerRow = Number(reportConfig.headerRow);
    const headerIndex = headerRow - 1;

    if (!values || values.length <= headerIndex) {
      throw new Error(
        `${reportConfig.displayName} CSV does not contain header row ${headerRow}: ${latest.attachment.getName()}`
      );
    }

    return {
      reportKey,
      displayName: reportConfig.displayName,
      filename: latest.attachment.getName(),
      subject: latest.message.getSubject(),
      messageId: latest.message.getId(),
      messageDate: latest.messageDate,
      dateKey,
      headerRow,
      headers: values[headerIndex].map(header => String(header || '').trim()),
      rows: values
        .slice(headerIndex + 1)
        .filter(row => row.some(cell => String(cell || '').trim() !== ''))
        .filter(row => this.isReportCacheableRow_(reportKey, row, values[headerIndex]))
    };
  },

  getSheetCachedReport_(reportKey, dateKey, cacheKey) {
    try {
      const sheet = this.getCacheMetadataSheet_();
      const rowSheet = this.getCacheRowSheet_(reportKey);

      if (!sheet || !rowSheet || sheet.getLastRow() < 2) {
        return undefined;
      }

      const values = sheet
        .getRange(2, 1, sheet.getLastRow() - 1, 12)
        .getValues();

      for (let index = 0; index < values.length; index++) {
        const row = values[index];

        if (String(row[0] || '') !== cacheKey) {
          continue;
        }

        const headers = JSON.parse(row[8] || '[]');
        const rows = this.getSheetCachedRows_(rowSheet, cacheKey, headers.length);
        const expectedRowCount = Number(row[9] || 0);

        if (expectedRowCount !== rows.length) {
          throw new Error(
            `Cached row count mismatch for ${cacheKey}: metadata=${expectedRowCount}, rows=${rows.length}`
          );
        }

        return {
          reportKey: row[1],
          displayName: CONFIG.eodReports.reports[row[1]].displayName,
          dateKey: row[2],
          messageId: row[3],
          filename: row[4],
          subject: '',
          messageDate: row[5] ? new Date(row[5]) : null,
          headerRow: Number(row[7]),
          headers,
          rows
        };
      }

      return undefined;
    } catch (err) {
      Logger.log(`EOD report sheet cache read failed for ${cacheKey}: ${this.stringifyError_(err)}`);
      return undefined;
    }
  },

  writeSheetCachedReport_(cacheKey, report) {
    try {
      const sheet = this.getCacheMetadataSheet_();
      const rowSheet = this.getCacheRowSheet_(report.reportKey);

      if (!sheet || !rowSheet) {
        Logger.log(`EOD report sheet cache missing; not caching ${cacheKey}.`);
        return;
      }

      const existingRow = this.findCacheRow_(sheet, cacheKey);
      const row = [
        cacheKey,
        report.reportKey,
        report.dateKey,
        report.messageId || '',
        report.filename || '',
        report.messageDate || '',
        new Date(),
        report.headerRow || '',
        JSON.stringify(report.headers || []),
        (report.rows || []).length,
        'ok',
        ''
      ];

      if (existingRow > 0) {
        sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      } else {
        sheet
          .getRange(sheet.getLastRow() + 1, 1, 1, row.length)
          .setValues([row]);
      }

      this.replaceSheetCachedRows_(rowSheet, cacheKey, report);
    } catch (err) {
      Logger.log(`EOD report sheet cache write failed for ${cacheKey}: ${this.stringifyError_(err)}`);
    }
  },

  getSheetCachedRows_(sheet, cacheKey, headerCount) {
    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }

    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 8 + headerCount))
      .getValues();

    return values
      .filter(row => String(row[0] || '') === cacheKey)
      .map(row => row.slice(8, 8 + headerCount));
  },

  replaceSheetCachedRows_(sheet, cacheKey, report) {
    const metadataColumnCount = 8;
    const headers = [
      'Cache Key',
      'Report Key',
      'Date Key',
      'Source Message ID',
      'Source Filename',
      'Source Date',
      'Cached At',
      'Report Row',
      ...(report.headers || [])
    ];
    const existingValues =
      sheet.getLastRow() > 1
        ? sheet
          .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), headers.length))
          .getValues()
        : [];
    const keptRows = existingValues
      .filter(row => String(row[0] || '') !== cacheKey)
      .map(row => this.resizeRow_(row, headers.length));
    const cachedAt = new Date();
    const reportRows = (report.rows || []).map((row, index) => [
      cacheKey,
      report.reportKey,
      report.dateKey,
      report.messageId || '',
      report.filename || '',
      report.messageDate || '',
      cachedAt,
      Number(report.headerRow || 0) + index + 1,
      ...row
    ]).map(row => this.resizeRow_(row, metadataColumnCount + (report.headers || []).length));
    const output = [headers].concat(keptRows, reportRows);

    sheet.clearContents();
    sheet
      .getRange(1, 1, output.length, headers.length)
      .setValues(output);
    sheet.setFrozenRows(1);
  },

  resizeRow_(row, width) {
    const resized = (row || []).slice(0, width);

    while (resized.length < width) {
      resized.push('');
    }

    return resized;
  },

  findCacheRow_(sheet, cacheKey) {
    if (!sheet || sheet.getLastRow() < 2) {
      return 0;
    }

    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 1)
      .getValues();

    for (let index = 0; index < values.length; index++) {
      if (String(values[index][0] || '') === cacheKey) {
        return index + 2;
      }
    }

    return 0;
  },

  getCacheMetadataSheet_() {
    if (this._cacheSheetForTest) {
      return this._cacheSheetForTest;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss || !CONFIG.sheets.eodReportCacheSheetName) {
      return null;
    }

    return ss.getSheetByName(CONFIG.sheets.eodReportCacheSheetName);
  },

  getCacheRowSheet_(reportKey) {
    if (this._rowCacheSheetsForTest) {
      return this._rowCacheSheetsForTest[reportKey] || null;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return null;
    }

    const sheetName = this.getCacheRowSheetName_(reportKey);

    return sheetName ? ss.getSheetByName(sheetName) : null;
  },

  getCacheRowSheetName_(reportKey) {
    if (reportKey === 'outstandingOrders') {
      return CONFIG.sheets.eodOutstandingOrdersCacheSheetName;
    }

    if (reportKey === 'palletAndProductByMembers') {
      return CONFIG.sheets.eodPalletProductCacheSheetName;
    }

    return '';
  },

  setCacheSheetForTest_(sheet) {
    this._cacheSheetForTest = sheet;
  },

  setCacheSheetsForTest_(metadataSheet, rowSheets) {
    this._cacheSheetForTest = metadataSheet;
    this._rowCacheSheetsForTest = rowSheets || {};
  },

  setReportFinderForTest_(finder) {
    this._reportFinderForTest = finder;
  },

  setTodayDateKeyForTest_(dateKey) {
    this._todayDateKeyForTest = dateKey;
  },

  resetTestDoubles_() {
    this._cacheSheetForTest = null;
    this._rowCacheSheetsForTest = null;
    this._reportFinderForTest = null;
    this._todayDateKeyForTest = null;
    this._reportCache = {};
  },

  isReportCacheableRow_(reportKey, row, headers) {
    if (reportKey !== 'outstandingOrders') {
      return true;
    }

    return this.isOutstandingOrdersCacheableRow_(row, headers);
  },

  isOutstandingOrdersCacheableRow_(rowObjectOrValues, headers) {
    const expected = EodReportNormalisationService.normalizeHeader('Order Type');

    if (Array.isArray(rowObjectOrValues)) {
      const orderTypeIndex = (headers || []).findIndex(header =>
        EodReportNormalisationService.normalizeHeader(header) === expected
      );

      if (orderTypeIndex < 0) {
        return false;
      }

      return EodReportNormalisationService.normalizeStrictCode(rowObjectOrValues[orderTypeIndex]) === 'OL';
    }

    if (rowObjectOrValues && typeof rowObjectOrValues === 'object') {
      const key = Object.keys(rowObjectOrValues).find(header =>
        EodReportNormalisationService.normalizeHeader(header) === expected
      );

      return key
        ? EodReportNormalisationService.normalizeStrictCode(rowObjectOrValues[key]) === 'OL'
        : false;
    }

    return false;
  },

  isCsvAttachment_(attachment) {
    const name = String(attachment.getName() || '').toLowerCase();
    const contentType = String(attachment.getContentType() || '').toLowerCase();

    return (
      name.endsWith('.csv') ||
      contentType === 'text/csv' ||
      contentType === 'application/csv' ||
      contentType === 'application/vnd.ms-excel'
    );
  },

  containsText_(value, expectedText) {
    const haystack = String(value || '').toUpperCase();

    if (Array.isArray(expectedText)) {
      return expectedText.some(text =>
        haystack.indexOf(String(text || '').toUpperCase()) >= 0
      );
    }

    return haystack.indexOf(String(expectedText || '').toUpperCase()) >= 0;
  },

  getRequiredHeaderIndex_(headers, expectedHeader) {
    const expected = EodReportNormalisationService.normalizeHeader(expectedHeader);

    const index = headers.findIndex(header =>
      EodReportNormalisationService.normalizeHeader(header) === expected
    );

    if (index < 0) {
      throw new Error(
        `Required EOD column not found: ${expectedHeader}. Found columns: ${headers.join(', ')}`
      );
    }

    return index;
  },

  stringifyError_(err) {
    if (!err) return '';
    return err && err.stack ? String(err.stack) : String(err);
  }
};
