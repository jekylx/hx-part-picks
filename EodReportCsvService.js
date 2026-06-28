const EodReportCsvService = {
  _reportCache: {},

  getReportForDate(reportKey, dateKey) {
    const cacheKey = `${reportKey}::${dateKey}`;

    if (this._reportCache[cacheKey] !== undefined) {
      return this._reportCache[cacheKey];
    }

    const report = this.findLatestReportForDate_(reportKey, dateKey);

    this._reportCache[cacheKey] = report;
    return report;
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
    };
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
  }
};
