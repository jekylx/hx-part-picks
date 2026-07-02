/**
 * PdfProcessorHealthTest.js — PDF processor health endpoint check.
 */

function getPdfProcessorHealthTestCases_() {
  return [
    { name: 'PDF processor health endpoint works', fn: testPdfProcessorHealth_, suite: 'core' }
  ];
}

function testPdfProcessorHealth_() {
  const endpoint = CONFIG.pdf && CONFIG.pdf.processorEndpoint;

  assertTruthy_(endpoint, 'CONFIG.pdf.processorEndpoint missing.');

  const healthUrl = endpoint.replace(/\/split$/, '/health');

  const response = UrlFetchApp.fetch(healthUrl, {
    method: 'get',
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  Logger.log(`PDF processor health status: ${status}`);
  Logger.log(`PDF processor health body: ${body}`);

  assertEquals_(200, status, `PDF processor health failed: ${body}`);
  assertContains_(body, 'ok', 'PDF processor health response should contain ok.');
}
