const DedupeService = {
  _processedKeys: null,

  hasProcessed(key) {
    const normalizedKey = this.normalizeKey_(key);

    if (!normalizedKey) {
      return false;
    }

    return this.getProcessedKeys_().has(normalizedKey);
  },

  /**
   * Record a completed unit of work.
   *
   * Current rows may contain either:
   * - BATCH::<md5(original batch PDF bytes)>
   * - BATCH::<same hash>::PAGE-<pageNumber>
   *
   * Page keys remain important even when a batch key is later added: old rows
   * may only have page keys, and partial retries must leave completed pages
   * skipped while missing pages are reprocessed.
   */
  markProcessed(key, message, pdf, archiveFile, formsExtracted) {
    const normalizedKey = this.normalizeKey_(key);

    if (!normalizedKey || this.hasProcessed(normalizedKey)) {
      return;
    }

    const sheet = SheetService.getSheet_(CONFIG.sheets.processedSheetName);

    sheet.appendRow([
      normalizedKey,
      new Date(),
      message.getId(),
      pdf.getName(),
      Utils.md5Hex(pdf.getBytes()),
      archiveFile ? archiveFile.getUrl() : '',
      formsExtracted
    ]);

    this.getProcessedKeys_().add(normalizedKey);
  },

  getProcessedKeys_() {
    if (this._processedKeys) {
      return this._processedKeys;
    }

    const sheet = SheetService.getSheet_(CONFIG.sheets.processedSheetName);
    const values = sheet.getDataRange().getValues();
    const keys = new Set();

    for (let row = 1; row < values.length; row++) {
      const normalizedKey = this.normalizeKey_(values[row][0]);

      if (normalizedKey) {
        keys.add(normalizedKey);
      }
    }

    this._processedKeys = keys;
    return this._processedKeys;
  },

  normalizeKey_(key) {
    return String(key || '').trim();
  },

  clearCache() {
    this._processedKeys = null;
  }
};