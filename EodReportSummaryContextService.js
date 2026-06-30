const EodReportSummaryContextService = {
  create(sheet, startRow, rowCount) {
    const headerRow = Number(CONFIG.summary.headerRow || 2);
    const headers = sheet
      .getRange(headerRow, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(header => String(header || '').trim());

    const states = {};
    const requiredHeaders = [
      'Location',
      'C Number',
      'B Number',
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
      const expected = EodReportNormalisationService.normalizeHeader(headerName);
      const found = headers.some(header =>
        EodReportNormalisationService.normalizeHeader(header) === expected
      );

      if (!found) {
        throw new Error(
          `Required summary column not found: ${headerName}. Found columns: ${headers.join(', ')}`
        );
      }
    });

    return {
      sheet,
      startRow,
      rowCount,
      headerRow,
      headers,
      states,

      getColumnIndex(headerName) {
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

      getColumnState(headerName) {
        if (states[headerName]) {
          return states[headerName];
        }

        const column = this.getColumnIndex(headerName);
        const range = sheet.getRange(startRow, column, rowCount, 1);

        states[headerName] = {
          range,
          values: range.getValues(),
          backgrounds: range.getBackgrounds(),
          notes: range.getNotes(),
          valuesChanged: false,
          backgroundsChanged: false,
          notesChanged: false
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

          if (state.valuesChanged) {
            if (typeof state.range.clearDataValidations === 'function') {
              state.range.clearDataValidations();
            }

            state.range.setValues(state.values);
          }

          if (state.backgroundsChanged) {
            state.range.setBackgrounds(state.backgrounds);
          }

          if (state.notesChanged) {
            state.range.setNotes(state.notes);
          }
        });
      }
    };
  }
};
