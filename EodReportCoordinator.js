const EodReportCoordinator = {
  applyToSummaryRows(sheet, startRow, rowCount) {
    // Manual refresh works against existing summary rows. Initial summary
    // append uses enrichSummaryDrafts so EOD is attempted before rows appear.
    try {
      this.applyToSummaryRows_(sheet, startRow, rowCount);
    } catch (err) {
      this.logError_('EOD_REPORT_LOOKUP_FAILED', '', err);
    }
  },

  enrichSummaryDrafts(drafts) {
    if (!drafts || drafts.length === 0) {
      return drafts || [];
    }

    drafts.forEach(draft => {
      try {
        this.applyToSummaryDrafts_([draft]);
      } catch (err) {
        this.writeDraftEnrichmentFailure_(draft, err);
        this.logError_('EOD_REPORT_DRAFT_LOOKUP_FAILED', '', err);
      }
    });

    return drafts;
  },

  applyToSummaryRowsOrThrow(sheet, startRow, rowCount) {
    this.applyToSummaryRows_(sheet, startRow, rowCount);
  },

  refreshSummaryRow(sheet, rowNumber) {
    this.validateRefreshTarget_(sheet, rowNumber);

    try {
      this.applyToSummaryRows_(sheet, rowNumber, 1);

      this.logInfo_(
        'EOD_REPORT_MANUAL_REFRESH_APPLIED',
        '',
        `Summary row: ${rowNumber}`
      );
    } catch (err) {
      this.writeRefreshFailure_(sheet, rowNumber, err);
      this.logError_('EOD_REPORT_MANUAL_REFRESH_FAILED', '', err);
    }
  },

  applyToSummaryRows_(sheet, startRow, rowCount) {
    if (!sheet || rowCount <= 0) {
      return;
    }

    const context = EodReportSummaryContextService.create(
      sheet,
      startRow,
      rowCount
    );

    const validationRows = EodReportValidationService.create(rowCount);

    const outstandingOrdersResult = OutstandingOrdersEodReportService
      .applyToSummaryRows(context, validationRows);

    const palletResult = PalletAndProductByMembersEodReportService
      .applyToSummaryRows(context, validationRows);

    EodReportValidationService.write(context, validationRows);
    context.write();

    this.logInfo_(
      'EOD_REPORT_LOOKUP_APPLIED',
      '',
      [
        `Summary rows: ${startRow}-${startRow + rowCount - 1}`,
        this.formatResult_('PALLET AND PRODUCT BY MEMBERS', palletResult),
        this.formatResult_('OUTSTANDING ORDERS', outstandingOrdersResult)
      ].join(' | ')
    );
  },

  applyToSummaryDrafts_(drafts) {
    if (!drafts || drafts.length === 0) {
      return;
    }

    const context = this.createDraftContext_(drafts);
    const validationRows = EodReportValidationService.create(drafts.length);

    const outstandingOrdersResult = OutstandingOrdersEodReportService
      .applyToSummaryRows(context, validationRows);

    const palletResult = PalletAndProductByMembersEodReportService
      .applyToSummaryRows(context, validationRows);

    EodReportValidationService.write(context, validationRows);
    context.write();

    this.logInfo_(
      'EOD_REPORT_LOOKUP_APPLIED',
      '',
      [
        `Summary drafts: ${drafts.length}`,
        this.formatResult_('PALLET AND PRODUCT BY MEMBERS', palletResult),
        this.formatResult_('OUTSTANDING ORDERS', outstandingOrdersResult)
      ].join(' | ')
    );
  },

  createDraftContext_(drafts) {
    const headers = (drafts[0] && drafts[0].headers ? drafts[0].headers : [])
      .map(header => String(header || '').trim());
    const states = {};
    const requiredHeaders = [
      'Location',
      'C Number',
      'B Number',
      'Order Qty',
      'B Qty',
      'Product Code',
      'Product Description',
      'Vintage',
      'Bottle Size',
      'Date Completed',
      'SLA',
      SummaryService.getRefreshEodHeader_(),
      SummaryService.getSendEmailHeader_()
    ];

    requiredHeaders.forEach(headerName => {
      this.getDraftColumnIndex_(headers, headerName);
    });

    return {
      rowCount: drafts.length,
      headers,
      states,

      getColumnIndex: headerName =>
        EodReportCoordinator.getDraftColumnIndex_(headers, headerName),

      getColumnState(headerName) {
        if (states[headerName]) {
          return states[headerName];
        }

        const column = this.getColumnIndex(headerName);

        states[headerName] = {
          values: drafts.map(draft => [
            draft.values[column - 1] == null ? '' : draft.values[column - 1]
          ]),
          backgrounds: drafts.map(draft => [
            draft.backgrounds[column - 1] == null ? '' : draft.backgrounds[column - 1]
          ]),
          notes: drafts.map(draft => [
            draft.notes[column - 1] == null ? '' : draft.notes[column - 1]
          ]),
          valuesChanged: false,
          backgroundsChanged: false,
          notesChanged: false,
          column
        };

        return states[headerName];
      },

      value(headerName, rowIndex) {
        return this.getColumnState(headerName).values[rowIndex][0];
      },

      setValue(headerName, rowIndex, value) {
        const state = this.getColumnState(headerName);
        const before = state.values[rowIndex][0];

        if (before === value) {
          return false;
        }

        state.values[rowIndex][0] = value;
        state.valuesChanged = true;
        return true;
      },

      setNote(headerName, rowIndex, note) {
        const state = this.getColumnState(headerName);
        const after = note || '';

        if (state.notes[rowIndex][0] === after) {
          return false;
        }

        state.notes[rowIndex][0] = after;
        state.notesChanged = true;
        return true;
      },

      setBackground(headerName, rowIndex, colour) {
        const state = this.getColumnState(headerName);
        state.backgrounds[rowIndex][0] = colour;
        state.backgroundsChanged = true;
      },

      write() {
        Object.keys(states).forEach(headerName => {
          const state = states[headerName];
          const columnIndex = state.column - 1;

          drafts.forEach((draft, rowIndex) => {
            if (state.valuesChanged) {
              draft.values[columnIndex] = state.values[rowIndex][0];
            }

            if (state.backgroundsChanged) {
              draft.backgrounds[columnIndex] = state.backgrounds[rowIndex][0];
            }

            if (state.notesChanged) {
              draft.notes[columnIndex] = state.notes[rowIndex][0];
            }
          });
        });
      }
    };
  },

  getDraftColumnIndex_(headers, headerName) {
    const expected = EodReportNormalisationService.normalizeHeader(headerName);
    const index = headers.findIndex(header =>
      EodReportNormalisationService.normalizeHeader(header) === expected
    );

    if (index < 0) {
      throw new Error(
        `Required summary column not found: ${headerName}. Found columns: ${headers.join(', ')}`
      );
    }

    return index + 1;
  },

  writeDraftEnrichmentFailure_(draft, err) {
    try {
      const headers = draft.headers || [];
      const column = this.getDraftColumnIndex_(
        headers,
        CONFIG.eodReports.validation.summaryColumn
      ) - 1;
      const message = err && err.message ? err.message : String(err);

      draft.values[column] = '';
      draft.backgrounds[column] = CONFIG.eodReports.validation.colours.noMatch;
      draft.notes[column] = `EOD enrichment failed before append: ${message}`;
    } catch (writeErr) {
      this.logError_('EOD_REPORT_DRAFT_FAILURE_NOTE_FAILED', '', writeErr);
    }
  },

  validateRefreshTarget_(sheet, rowNumber) {
    if (!sheet) {
      throw new Error('Manual EOD refresh requires a sheet.');
    }

    if (sheet.getName() !== CONFIG.summary.sheetName) {
      throw new Error(`Manual EOD refresh requires ${CONFIG.summary.sheetName}.`);
    }

    const dataStartRow = Number(CONFIG.summary.headerRow || 2) + 1;

    if (rowNumber < dataStartRow) {
      throw new Error(`Manual EOD refresh requires a data row: ${rowNumber}.`);
    }
  },

  writeRefreshFailure_(sheet, rowNumber, err) {
    try {
      const context = EodReportSummaryContextService.create(sheet, rowNumber, 1);
      const validationRows = EodReportValidationService.create(1);
      const message = err && err.message ? err.message : String(err);

      EodReportValidationService.noMatch(
        validationRows,
        0,
        `Manual EOD refresh failed: ${message}`
      );
      EodReportValidationService.write(context, validationRows);
      context.write();
    } catch (writeErr) {
      this.logError_('EOD_REPORT_MANUAL_REFRESH_FAILURE_NOTE_FAILED', '', writeErr);
    }
  },

  formatResult_(name, result) {
    return [
      name,
      `checked=${result.checked}`,
      `filled=${result.filled}`,
      `corrected=${result.corrected}`,
      result.mismatched == null ? '' : `mismatched=${result.mismatched}`,
      `blocked=${result.blocked || 0}`,
      `notFound=${result.notFound}`
    ].filter(Boolean).join(' ');
  },

  logInfo_(status, filename, details) {
    if (
      typeof LogService !== 'undefined' &&
      typeof LogService.info === 'function'
    ) {
      LogService.info(status, '', filename || '', details || '');
      return;
    }

    Logger.log(`${status}: ${filename || ''} ${details || ''}`);
  },

  logError_(status, filename, err) {
    if (
      typeof LogService !== 'undefined' &&
      typeof LogService.error === 'function'
    ) {
      LogService.error(status, '', filename || '', err, '');
      return;
    }

    Logger.log(`${status}: ${err && err.stack ? err.stack : String(err)}`);
  }
};
