/**
 * SummarySlaService.js
 *
 * SLA formulas and SLA conditional formatting. Formulas write only the SLA
 * column (validations cleared first) and never touch other columns.
 */

const SummarySlaService = {
  applySlaFormulas_(sheet, startRow, rowCount) {
    const headers = SummarySchemaService.getSheetHeaders_(sheet);
    const slaCol = SummarySchemaService.getSlaColumn_(headers);
    const enteredCol = SummarySchemaService.getEnteredColumn_(headers);
    const completedCol = SummarySchemaService.getCompletedColumn_(headers);

    if (slaCol <= 0 || enteredCol <= 0 || completedCol <= 0) {
      return;
    }

    const formulas = [];

    for (let index = 0; index < rowCount; index++) {
      const row = startRow + index;
      const enteredCell = this.a1_(row, enteredCol);
      const completedCell = this.a1_(row, completedCol);

      formulas.push([
        `=IF(${enteredCell}="","",IF(${completedCell}="",ROUND(MAX(0,(NETWORKDAYS(INT(${enteredCell}),INT(NOW()))-1)+IF(WEEKDAY(NOW(),2)<6,MOD(NOW(),1),1)-IF(WEEKDAY(${enteredCell},2)<6,MOD(${enteredCell},1),0)),1),MAX(0,NETWORKDAYS(INT(${enteredCell}),${completedCell})-1)))`
      ]);
    }

    const slaRange = sheet.getRange(startRow, slaCol, rowCount, 1);

    if (typeof slaRange.clearDataValidations === 'function') {
      slaRange.clearDataValidations();
    } else {
      slaRange.setDataValidation(null);
    }

    slaRange.setFormulas(formulas);
  },

  applySlaConditionalFormatting_(sheet, headers) {
    const slaCol = SummarySchemaService.getSlaColumn_(headers);
    const startRow = SummarySchemaService.summaryDataStartRow_();
    const rowCount = sheet.getMaxRows() - startRow + 1;

    if (slaCol <= 0 || rowCount <= 0) {
      return;
    }

    const slaRange = sheet.getRange(startRow, slaCol, rowCount, 1);
    const slaLetter = this.columnLetter_(slaCol);
    const firstCell = `$${slaLetter}${startRow}`;

    const keptRules = sheet
      .getConditionalFormatRules()
      .filter(rule => {
        return !rule.getRanges().some(range =>
          range.getSheet().getName() === sheet.getName() &&
          range.getColumn() === slaCol &&
          range.getNumColumns() === 1
        );
      });

    const greenRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}<=1)`)
      .setBackground('#D9EAD3')
      .setRanges([slaRange])
      .build();

    const orangeRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}>1,${firstCell}<=2)`)
      .setBackground('#FCE5CD')
      .setRanges([slaRange])
      .build();

    const redRule = SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER(${firstCell}),${firstCell}>2)`)
      .setBackground('#F4CCCC')
      .setRanges([slaRange])
      .build();

    sheet.setConditionalFormatRules([
      ...keptRules,
      greenRule,
      orangeRule,
      redRule
    ]);
  },

  a1_(row, col) {
    return `${this.columnLetter_(col)}${row}`;
  },

  columnLetter_(col) {
    let letter = '';

    while (col > 0) {
      const temp = (col - 1) % 26;

      letter = String.fromCharCode(temp + 65) + letter;
      col = Math.floor((col - temp - 1) / 26);
    }

    return letter;
  }
};
