const GmailService = {
  buildSearchQuery() {
    return [
      // `from:${CONFIG.gmail.from}`,
      `subject:"${CONFIG.gmail.subjectContains}"`,
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