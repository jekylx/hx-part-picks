/**
 * TestMocks.js
 *
 * Generic mock Apps Script objects shared across test domains:
 * mock sheets/ranges, validation rules, conditional format builders,
 * time triggers, locks, users and protections.
 *
 * Domain-specific mocks live next to their tests (e.g. email, one-off).
 */

function buildMockSummarySheet_(sheetName, headers) {
  const headerValues = headers || [
    '_Key',
    ...CONFIG.summary.columns.map(column => column.header)
  ];

  return {
    getName: () => sheetName || CONFIG.summary.sheetName,
    getLastColumn: () => headerValues.length,
    getRange(row, col, rowCount, colCount) {
      return {
        getValues: () => {
          if (row === Number(CONFIG.summary.headerRow || 2)) {
            return [headerValues.slice(col - 1, col - 1 + colCount)];
          }

          return [new Array(colCount).fill('')];
        }
      };
    }
  };
}

function buildMockSheetWithHeaders_(headers) {
  const state = {
    headers: headers.slice(),
    appendRowCalls: 0,
    setValuesCalls: 0
  };
  const sheet = {
    dataRows: [],
    getLastRow() {
      return 1 + this.dataRows.length;
    },
    getLastColumn() {
      return Math.max(
        state.headers.length,
        this.dataRows.reduce((max, row) => Math.max(max, row.length), 0)
      );
    },
    getRange(row, col, rowCount, colCount) {
      return {
        getValues: () => {
          const source = row === 1
            ? [state.headers]
            : sheet.dataRows.slice(row - 2, row - 2 + rowCount);

          return source.map(sourceRow => {
            const output = sourceRow.slice(col - 1, col - 1 + colCount);

            while (output.length < colCount) {
              output.push('');
            }

            return output;
          });
        },
        setValues(values) {
          state.setValuesCalls++;
          values.forEach((valueRow, index) => {
            if (row + index === 1) {
              state.headers = valueRow.slice();
              return;
            }

            sheet.dataRows[row - 2 + index] = valueRow.slice();
          });
        }
      };
    },
    clearContents() {
      state.headers = [];
      this.dataRows.length = 0;
    },
    setFrozenRows() {},
    appendRow(row) {
      state.appendRowCalls++;
      this.dataRows.push(row.slice());
    },
    get appendRowCalls() {
      return state.appendRowCalls;
    },
    get setValuesCalls() {
      return state.setValuesCalls;
    }
  };

  return sheet;
}

function buildMockValidationRule_(criteriaType) {
  return {
    getCriteriaType() {
      return criteriaType;
    }
  };
}

function buildMockValidationBlockingLogSheet_(options) {
  options = options || {};

  const state = {
    rows: [],
    staleValidation: true,
    clearDataValidationsCalled: false,
    fullRowValidationCleared: false,
    maxRows: options.maxRows || 25,
    maxColumns: options.maxColumns || 17,
    lastColumn: options.lastColumn || 7,
    insertedRows: 0,
    insertedColumns: 0
  };

  return {
    rows: state.rows,
    get insertedRows() {
      return state.insertedRows;
    },
    get insertedColumns() {
      return state.insertedColumns;
    },
    get clearDataValidationsCalled() {
      return state.clearDataValidationsCalled;
    },
    get fullRowValidationCleared() {
      return state.fullRowValidationCleared;
    },
    getName() {
      return CONFIG.sheets.logSheetName;
    },
    getLastRow() {
      return state.rows.length;
    },
    getLastColumn() {
      return state.lastColumn;
    },
    getMaxRows() {
      return state.maxRows;
    },
    getMaxColumns() {
      return state.maxColumns;
    },
    insertRowsAfter(row, count) {
      if (row !== state.maxRows || count < 1) {
        throw new Error(`Invalid row insert: after ${row}, count ${count}.`);
      }

      state.maxRows += count;
      state.insertedRows += count;
      return this;
    },
    insertColumnsAfter(col, count) {
      if (col !== state.maxColumns || count < 1) {
        throw new Error(`Invalid column insert: after ${col}, count ${count}.`);
      }

      state.maxColumns += count;
      state.insertedColumns += count;
      return this;
    },
    getRange(row, col, rowCount, colCount) {
      if (row < 1 || col < 1) {
        throw new Error(`Range starts outside sheet: row ${row}, col ${col}.`);
      }

      if (row + rowCount - 1 > state.maxRows) {
        throw new Error(`Range row exceeds sheet: row ${row}, rows ${rowCount}.`);
      }

      if (col + colCount - 1 > state.maxColumns) {
        throw new Error(`Range column exceeds sheet: col ${col}, cols ${colCount}.`);
      }

      return {
        clearDataValidations() {
          state.clearDataValidationsCalled = true;
          if (rowCount === 1 && col === 1 && colCount >= state.maxColumns) {
            state.staleValidation = false;
            state.fullRowValidationCleared = true;
          }
          return this;
        },
        setValues(values) {
          if (state.staleValidation) {
            throw new Error('Enter a valid completed date, e.g. 13/06/2026.');
          }

          values.forEach((valueRow, index) => {
            state.rows[row - 1 + index] = valueRow.slice(0, colCount);
          });

          return this;
        }
      };
    }
  };
}

function buildMockMigratableSummarySheet_(headers, dataRows) {
  const headerRow = Number(CONFIG.summary.headerRow || 2);
  const startRow = headerRow + 1;
  const maxRows = Math.max(25, startRow + (dataRows || []).length + 5);
  const maxCols = Math.max((headers || []).length, 1);
  const state = {
    rows: [],
    notes: [],
    backgrounds: [],
    formats: [],
    validations: [],
    frozenRows: 0,
    hiddenColumns: {},
    conditionalRules: []
  };

  function ensureCell(row, col) {
    while (state.rows.length < row) state.rows.push([]);
    while (state.notes.length < row) state.notes.push([]);
    while (state.backgrounds.length < row) state.backgrounds.push([]);
    while (state.formats.length < row) state.formats.push([]);
    while (state.validations.length < row) state.validations.push([]);

    [state.rows, state.notes, state.backgrounds, state.formats, state.validations].forEach(matrix => {
      while (matrix[row - 1].length < col) {
        matrix[row - 1].push(matrix === state.validations ? null : '');
      }
    });
  }

  function getMatrixValue(matrix, row, col) {
    ensureCell(row, col);
    return matrix[row - 1][col - 1];
  }

  function setMatrixValue(matrix, row, col, value) {
    ensureCell(row, col);
    matrix[row - 1][col - 1] = value;
  }

  for (let row = 1; row <= maxRows; row++) {
    for (let col = 1; col <= maxCols; col++) {
      ensureCell(row, col);
    }
  }

  (headers || []).forEach((header, index) => {
    setMatrixValue(state.rows, headerRow, index + 1, header);
  });

  (dataRows || []).forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      setMatrixValue(state.rows, startRow + rowIndex, colIndex + 1, value);
    });
  });

  function insertColumnBefore_(col) {
    [state.rows, state.notes, state.backgrounds, state.formats, state.validations].forEach(matrix => {
      for (let row = 0; row < matrix.length; row++) {
        matrix[row].splice(col - 1, 0, matrix === state.validations ? null : '');
      }
    });
  }

  const sheet = {
    getName: () => CONFIG.summary.sheetName,
    showSheet() {},
    setFrozenRows(count) {
      state.frozenRows = count;
    },
    hideColumns(col) {
      state.hiddenColumns[col] = true;
    },
    getLastColumn() {
      return state.rows.reduce((max, row) => {
        for (let index = row.length - 1; index >= 0; index--) {
          if (String(row[index] || '').trim() !== '') {
            return Math.max(max, index + 1);
          }
        }

        return max;
      }, 0);
    },
    getLastRow() {
      for (let row = state.rows.length - 1; row >= 0; row--) {
        if (state.rows[row].some(value => String(value || '').trim() !== '')) {
          return row + 1;
        }
      }

      return 0;
    },
    getMaxRows() {
      return state.rows.length;
    },
    insertColumnBefore(col) {
      insertColumnBefore_(col);
      return this;
    },
    insertColumnAfter(col) {
      insertColumnBefore_(col + 1);
      return this;
    },
    getConditionalFormatRules() {
      return state.conditionalRules;
    },
    setConditionalFormatRules(rules) {
      state.conditionalRules = rules || [];
    },
    getRange(row, col, rowCount, colCount) {
      return buildMockMigratableRange_(sheet, state, row, col, rowCount || 1, colCount || 1);
    },
    getHeaderValues() {
      return this
        .getRange(headerRow, 1, 1, this.getLastColumn())
        .getValues()[0];
    },
    getColumnByHeader(headerName) {
      return this.getHeaderValues().indexOf(headerName) + 1;
    },
    getDataValueByHeader(headerName) {
      const headers = this.getHeaderValues();
      const col = headers.indexOf(headerName) + 1;

      return col > 0 ? this.getRange(startRow, col).getValue() : '';
    },
    getNoteByHeader(headerName) {
      const headers = this.getHeaderValues();
      const col = headers.indexOf(headerName) + 1;

      return col > 0 ? this.getRange(startRow, col).getNote() : '';
    },
    getNumberFormatByHeader(headerName) {
      const headers = this.getHeaderValues();
      const col = headers.indexOf(headerName) + 1;

      return col > 0 ? this.getRange(startRow, col).getNumberFormat() : '';
    },
    getValidationTypeByHeader(headerName) {
      const headers = this.getHeaderValues();
      const col = headers.indexOf(headerName) + 1;
      const rule = col > 0 ? this.getRange(startRow, col).getDataValidation() : null;

      return rule && typeof rule.getCriteriaType === 'function'
        ? rule.getCriteriaType()
        : '';
    }
  };

  return sheet;
}

function buildMockMigratableRange_(sheet, state, row, col, rowCount, colCount) {
  function ensureCell(rowNumber, colNumber) {
    while (state.rows.length < rowNumber) state.rows.push([]);
    while (state.notes.length < rowNumber) state.notes.push([]);
    while (state.backgrounds.length < rowNumber) state.backgrounds.push([]);
    while (state.formats.length < rowNumber) state.formats.push([]);
    while (state.validations.length < rowNumber) state.validations.push([]);

    [state.rows, state.notes, state.backgrounds, state.formats, state.validations].forEach(matrix => {
      while (matrix[rowNumber - 1].length < colNumber) {
        matrix[rowNumber - 1].push(matrix === state.validations ? null : '');
      }
    });
  }

  function getMatrix(matrix) {
    const output = [];

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
      const rowValues = [];

      for (let colOffset = 0; colOffset < colCount; colOffset++) {
        ensureCell(row + rowOffset, col + colOffset);
        rowValues.push(matrix[row + rowOffset - 1][col + colOffset - 1]);
      }

      output.push(rowValues);
    }

    return output;
  }

  function setMatrix(matrix, values) {
    values.forEach((valueRow, rowOffset) => {
      valueRow.forEach((value, colOffset) => {
        ensureCell(row + rowOffset, col + colOffset);
        matrix[row + rowOffset - 1][col + colOffset - 1] = value;
      });
    });
  }

  return {
    getSheet() {
      return sheet;
    },
    getColumn() {
      return col;
    },
    getNumColumns() {
      return colCount;
    },
    getValues() {
      return getMatrix(state.rows);
    },
    setValues(values) {
      setMatrix(state.rows, values);
      return this;
    },
    setFormulas(values) {
      setMatrix(state.rows, values);
      return this;
    },
    getValue() {
      return getMatrix(state.rows)[0][0];
    },
    setValue(value) {
      setMatrix(state.rows, [[value]]);
      return this;
    },
    setFontWeight() {
      return this;
    },
    getNote() {
      return getMatrix(state.notes)[0][0];
    },
    setNote(value) {
      setMatrix(state.notes, [[value]]);
      return this;
    },
    getNotes() {
      return getMatrix(state.notes);
    },
    setNotes(values) {
      setMatrix(state.notes, values);
      return this;
    },
    getBackgrounds() {
      return getMatrix(state.backgrounds);
    },
    setBackgrounds(values) {
      setMatrix(state.backgrounds, values);
      return this;
    },
    getNumberFormats() {
      return getMatrix(state.formats);
    },
    setNumberFormats(values) {
      setMatrix(state.formats, values);
      return this;
    },
    getNumberFormat() {
      return getMatrix(state.formats)[0][0];
    },
    setNumberFormat(value) {
      setMatrix(
        state.formats,
        new Array(rowCount).fill(null).map(() => new Array(colCount).fill(value))
      );
      return this;
    },
    getDataValidations() {
      return getMatrix(state.validations);
    },
    setDataValidations(values) {
      setMatrix(state.validations, values);
      return this;
    },
    getDataValidation() {
      return getMatrix(state.validations)[0][0];
    },
    setDataValidation(value) {
      setMatrix(
        state.validations,
        new Array(rowCount).fill(null).map(() => new Array(colCount).fill(value))
      );
      return this;
    },
    clearDataValidations() {
      setMatrix(
        state.validations,
        new Array(rowCount).fill(null).map(() => new Array(colCount).fill(null))
      );
      return this;
    },
    clearContent() {
      setMatrix(
        state.rows,
        new Array(rowCount).fill(null).map(() => new Array(colCount).fill(''))
      );
      return this;
    }
  };
}

function stubConditionalFormatRuleBuilderForTest_() {
  const originalNewConditionalFormatRule = SpreadsheetApp.newConditionalFormatRule;

  SpreadsheetApp.newConditionalFormatRule = function() {
    return buildMockConditionalFormatRuleBuilder_();
  };

  return function restore() {
    SpreadsheetApp.newConditionalFormatRule = originalNewConditionalFormatRule;
  };
}

function buildMockConditionalFormatRuleBuilder_() {
  const state = {
    background: '',
    condition: null,
    ranges: []
  };
  const builder = {
    whenFormulaSatisfied(formula) {
      state.condition = {
        type: 'formula',
        value: formula
      };
      return this;
    },
    whenNumberLessThanOrEqualTo(value) {
      state.condition = {
        type: 'number_lte',
        value
      };
      return this;
    },
    whenNumberBetween(min, max) {
      state.condition = {
        type: 'number_between',
        min,
        max
      };
      return this;
    },
    whenNumberGreaterThan(value) {
      state.condition = {
        type: 'number_gt',
        value
      };
      return this;
    },
    setBackground(color) {
      state.background = color;
      return this;
    },
    setRanges(ranges) {
      state.ranges = ranges || [];
      return this;
    },
    build() {
      const ranges = state.ranges.slice();
      const condition = state.condition;
      const background = state.background;

      return {
        getRanges() {
          return ranges;
        },
        getBooleanCondition() {
          return condition;
        },
        getBackground() {
          return background;
        }
      };
    }
  };

  return builder;
}

function buildMockScriptAppForTimeTrigger_(triggers, createdHandlers) {
  const triggerList = triggers || [];

  return {
    deletedTriggers: [],
    getProjectTriggers: () => triggerList,
    deleteTrigger(trigger) {
      this.deletedTriggers.push(trigger);
      const index = triggerList.indexOf(trigger);

      if (index > -1) {
        triggerList.splice(index, 1);
      }
    },
    newTrigger(handlerName) {
      const created = {
        handlerName,
        everyDays: 0,
        atHour: -1,
        afterMs: 0
      };

      return {
        timeBased() {
          return this;
        },
        everyDays(days) {
          created.everyDays = days;
          return this;
        },
        atHour(hour) {
          created.atHour = hour;
          return this;
        },
        after(milliseconds) {
          created.afterMs = milliseconds;
          return this;
        },
        create() {
          createdHandlers.push(created);
          return created;
        }
      };
    }
  };
}

function buildMockLock_() {
  return {
    released: false,
    tryLock() {
      return true;
    },
    waitLock() {},
    releaseLock() {
      this.released = true;
    }
  };
}

function buildMockLockService_(options) {
  const settings = options || {};
  const locks = [];

  return {
    locks,
    getScriptLock() {
      const lock = buildMockLock_();

      lock.tryLock = () => settings.tryLock !== false;
      locks.push(lock);

      return lock;
    }
  };
}

function buildMockUser_(email) {
  return {
    getEmail: () => email
  };
}

function buildMockProtectableSheet_(name, protections) {
  const sheet = {
    protections: protections || [],
    getName: () => name,
    getProtections: () => sheet.protections.filter(protection => !protection.removed),
    protect() {
      const protection = buildMockProtection_('');

      sheet.protections.push(protection);

      return protection;
    }
  };

  return sheet;
}

function buildMockProtection_(description, options) {
  const settings = options || {};
  const protection = {
    description: description || '',
    removed: false,
    domainEdit: settings.domainEdit == null ? true : settings.domainEdit,
    warningOnly: settings.warningOnly == null ? true : settings.warningOnly,
    editors: settings.editors || [
      buildMockUser_('owner@example.com'),
      buildMockUser_('normal.user@example.com')
    ],

    getDescription() {
      return this.description;
    },

    setDescription(value) {
      this.description = value;
      return this;
    },

    remove() {
      this.removed = true;
    },

    canDomainEdit() {
      return this.domainEdit;
    },

    setDomainEdit(value) {
      this.domainEdit = value;
      return this;
    },

    isWarningOnly() {
      return this.warningOnly;
    },

    setWarningOnly(value) {
      this.warningOnly = value;
      return this;
    },

    addEditor(user) {
      const email = user && user.getEmail ? user.getEmail() : '';

      if (
        email &&
        !this.editors.some(editor => editor.getEmail() === email)
      ) {
        this.editors.push(user);
      }

      return this;
    },

    getEditors() {
      return this.editors.slice();
    },

    removeEditors(editors) {
      const removeEmails = {};

      (editors || []).forEach(editor => {
        removeEmails[editor.getEmail()] = true;
      });

      this.editors = this.editors.filter(editor => !removeEmails[editor.getEmail()]);

      return this;
    }
  };

  return protection;
}
