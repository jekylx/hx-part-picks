const DriveService = {
  setupFolders() {
    const root = this.getOrCreateFolder_(CONFIG.drive.rootFolderName);
    this.getOrCreateChildFolder_(root, CONFIG.drive.processedFolderName);

    return root;
  },

  archivePdf(pdf, message) {
    const folder = this.getProcessedFolder_();
    const archiveName = this.buildArchiveName_(pdf, message);

    return folder
      .createFile(pdf.copyBlob())
      .setName(archiveName);
  },

  getProcessedFolder_() {
    const root = this.getOrCreateFolder_(CONFIG.drive.rootFolderName);
    return this.getOrCreateChildFolder_(root, CONFIG.drive.processedFolderName);
  },

  buildArchiveName_(pdf, message) {
    const timestamp = Utilities.formatDate(
      message.getDate(),
      Session.getScriptTimeZone(),
      'yyyyMMdd_HHmmss'
    );

    const pageNumber = this.extractPageNumber_(pdf.getName());
    const messageId = this.shortMessageId_(message);

    const parts = [timestamp];

    if (pageNumber) {
      parts.push(`p${pageNumber}`);
    }

    if (messageId) {
      parts.push(messageId);
    }

    return this.cleanFileName_(`${parts.join('_')}.pdf`);
  },

  extractPageNumber_(name) {
    const match = String(name || '').match(/(?:^|[_\-\s])page[_\-\s]*(\d+)/i);

    return match ? match[1] : '';
  },

  shortMessageId_(message) {
    return String(message.getId() || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6);
  },

  cleanFileName_(name) {
    return String(name || 'scan.pdf')
      .replace(/[\\/:*?"<>|]/g, '_');
  },

  getOrCreateFolder_(name) {
    const folders = DriveApp.getFoldersByName(name);

    if (folders.hasNext()) {
      return folders.next();
    }

    return DriveApp.createFolder(name);
  },

  getOrCreateChildFolder_(parent, name) {
    const folders = parent.getFoldersByName(name);

    if (folders.hasNext()) {
      return folders.next();
    }

    return parent.createFolder(name);
  }
};