const GmailService = {
  buildSearchQuery() {
    // The printer sends all scans for a day into one Gmail thread and later
    // scans arrive as replies. Do not add -label filters for Processed/Failed:
    // those labels are thread-level visibility only, not processing state.
    return [
      // `from:${CONFIG.gmail.from}`,
      `subject:"${this.escapeSearchPhrase_(CONFIG.gmail.subjectContains)}"`,
      'has:attachment',
      'filename:pdf',
      `label:"${CONFIG.gmail.inboxLabel}"`,
      CONFIG.gmail.searchWindow
    ].join(' ');
  },

  getPdfAttachments(message) {
    return message
      .getAttachments({
        includeInlineImages: false,
        includeAttachments: true
      })
      .filter(attachment => this.isPdfAttachment_(attachment));
  },

  isPdfAttachment_(attachment) {
    const name = String(attachment.getName() || '').toLowerCase();
    const contentType = String(attachment.getContentType() || '').toLowerCase();

    return contentType === 'application/pdf' || name.endsWith('.pdf');
  },

  escapeSearchPhrase_(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }
};

const LabelService = {
  setupLabels() {
    this.getOrCreateLabel_(CONFIG.gmail.processedLabel);
    this.getOrCreateLabel_(CONFIG.gmail.failedLabel);
  },

  getOrCreateLabel_(name) {
    return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  }
};
