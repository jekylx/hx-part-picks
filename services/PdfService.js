const PdfService = {
  splitIntoPortraitPages(pdf) {
    const endpoint = CONFIG.pdf && CONFIG.pdf.processorEndpoint;

    if (!endpoint) {
      throw new Error('Missing CONFIG.pdf.processorEndpoint.');
    }

    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${getPdfProcessorToken_()}`
      },
      payload: JSON.stringify({
        filename: pdf.getName() || 'scan.pdf',
        mimeType: pdf.getContentType() || 'application/pdf',
        rotationDegreesForLandscape: CONFIG.pdf.landscapeRotationDegrees || 90,
        data: Utilities.base64Encode(pdf.getBytes())
      }),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status < 200 || status >= 300) {
      throw new Error(`PDF processor error ${status}: ${body}`);
    }

    const result = JSON.parse(body);

    if (!result.pages || !Array.isArray(result.pages)) {
      throw new Error(`PDF processor returned invalid response: ${body}`);
    }

    return result.pages.map(page => {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(page.data),
        'application/pdf',
        page.filename || this.buildPageFilename_(pdf.getName(), page.pageNumber)
      );

      return {
        pageNumber: page.pageNumber,
        filename: blob.getName(),
        blob,
        rotationApplied: page.rotationApplied || 0
      };
    });
  },

  buildPageFilename_(originalName, pageNumber) {
    const baseName = String(originalName || 'scan.pdf')
      .replace(/\.pdf$/i, '')
      .replace(/[\\/:*?"<>|]/g, '_');

    return `${baseName}_page_${pageNumber}.pdf`;
  }
};

function getPdfProcessorToken_() {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('PDF_PROCESSOR_TOKEN');

  if (!token) {
    throw new Error('Missing PDF_PROCESSOR_TOKEN in Apps Script Project Settings > Script Properties.');
  }

  return token;
}