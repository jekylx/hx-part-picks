/**
 * TestAssertions.js
 *
 * Shared assertion helpers for all local test modules.
 * Assertions throw on failure; runTest_ (tests/TestRunner.js) records the result.
 */

function assertTruthy_(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertEquals_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(`${message} Expected "${expected}", got "${actual}".`);
  }
}

function assertArrayEquals_(expected, actual, message) {
  const expectedText = JSON.stringify(expected);
  const actualText = JSON.stringify(actual);

  if (expectedText !== actualText) {
    throw new Error(`${message} Expected ${expectedText}, got ${actualText}.`);
  }
}

function assertNotEquals_(unexpected, actual, message) {
  if (unexpected === actual) {
    throw new Error(`${message} Did not expect "${actual}".`);
  }
}

function assertContains_(value, expectedSubstring, message) {
  const text = String(value || '');

  if (text.indexOf(expectedSubstring) === -1) {
    throw new Error(`${message} Missing "${expectedSubstring}".`);
  }
}

function assertNotContains_(value, unexpectedSubstring, message) {
  const text = String(value || '');

  if (text.indexOf(unexpectedSubstring) !== -1) {
    throw new Error(`${message} Found "${unexpectedSubstring}".`);
  }
}

function assertCellDisplayValue_(sheet, rowNumber, headers, headerName, expected, message) {
  const col = getColumnIndex_(headers, headerName);

  assertTruthy_(col > 0, `Column not found: ${headerName}`);

  const actual = sheet.getRange(rowNumber, col).getDisplayValue();

  assertEquals_(
    String(expected),
    String(actual),
    message
  );
}

function assertCellNumberFormat_(sheet, rowNumber, headers, headerName, expected, message) {
  const col = getColumnIndex_(headers, headerName);

  assertTruthy_(col > 0, `Column not found: ${headerName}`);

  const actual = sheet.getRange(rowNumber, col).getNumberFormat();

  assertEquals_(
    String(expected),
    String(actual),
    message
  );
}
