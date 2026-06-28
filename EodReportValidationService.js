const EodReportValidationService = {
  LEVELS: {
    OK: 0,
    CORRECTED: 1,
    NO_MATCH: 2,
    MISMATCH: 3
  },

  create(rowCount) {
    const rows = [];

    for (let index = 0; index < rowCount; index++) {
      rows.push({
        level: this.LEVELS.OK,
        notes: []
      });
    }

    return rows;
  },

  ok(validationRows, rowIndex) {
    this.raise_(validationRows, rowIndex, this.LEVELS.OK, '');
  },

  corrected(validationRows, rowIndex, note) {
    this.raise_(validationRows, rowIndex, this.LEVELS.CORRECTED, note);
  },

  noMatch(validationRows, rowIndex, note) {
    this.raise_(validationRows, rowIndex, this.LEVELS.NO_MATCH, note);
  },

  mismatch(validationRows, rowIndex, note) {
    this.raise_(validationRows, rowIndex, this.LEVELS.MISMATCH, note);
  },

  write(context, validationRows) {
    const column = CONFIG.eodReports.validation.summaryColumn;

    validationRows.forEach((validation, rowIndex) => {
      context.setValue(column, rowIndex, '');
      context.setBackground(column, rowIndex, this.colourForLevel_(validation.level));
      context.setNote(column, rowIndex, validation.notes.join('\n\n'));
    });
  },

  raise_(validationRows, rowIndex, level, note) {
    const validation = validationRows[rowIndex];

    if (level > validation.level) {
      validation.level = level;
    }

    if (note) {
      validation.notes.push(note);
    }
  },

  colourForLevel_(level) {
    if (level === this.LEVELS.MISMATCH) {
      return CONFIG.eodReports.validation.colours.mismatch;
    }

    if (level === this.LEVELS.NO_MATCH) {
      return CONFIG.eodReports.validation.colours.noMatch;
    }

    if (level === this.LEVELS.CORRECTED) {
      return CONFIG.eodReports.validation.colours.corrected;
    }

    return CONFIG.eodReports.validation.colours.ok;
  }
};
