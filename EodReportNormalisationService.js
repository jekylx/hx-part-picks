const EodReportNormalisationService = {
  normalizeHeader(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },

  normalizeBNumber(value) {
    return this.normalizeSummaryFieldValue('b_code', value);
  },

  normalizeCNumber(value) {
    return this.normalizeSummaryFieldValue('carton_number', value);
  },

  normalizeSummaryOrderNumber(value) {
    return this.normalizeSummaryFieldValue('order_number', value);
  },

  parseOutstandingOrdersOrderNo(value) {
    const cleaned = String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    const owner = cleaned.slice(0, 5);
    const orderNumber = cleaned.slice(5);

    return {
      owner: /^[A-Z0-9]{5}$/.test(owner) ? owner : '',
      orderNumber: orderNumber ? orderNumber : ''
    };
  },

  normalizeOutstandingOrdersOrderNumber(value) {
    return this.parseOutstandingOrdersOrderNo(value).orderNumber;
  },

  extractOwnerFromOutstandingOrdersOrderNo(value) {
    return this.parseOutstandingOrdersOrderNo(value).owner;
  },

  normalizeOwner(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z]/g, '')
      .slice(0, 5);
  },

  normalizeMember(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  },

  normalizeSummaryFieldValue(fieldKey, value) {
    if (value == null || value === '') {
      return '';
    }

    if (
      typeof NormalisationService !== 'undefined' &&
      typeof NormalisationService.normalizeSummaryValue === 'function'
    ) {
      const normalized = NormalisationService.normalizeSummaryValue(
        fieldKey,
        value
      );

      return String(normalized || '')
        .trim()
        .toUpperCase();
    }

    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  },

  normalizeName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },

  normalizeStrictCode(value) {
    return String(value || '')
      .trim()
      .toUpperCase();
  },

  isValidCarrier(value) {
    return ['NXM', 'AP', 'AC'].indexOf(this.normalizeStrictCode(value)) >= 0;
  },

  isValidState(value) {
    return ['NSW', 'VIC', 'ACT', 'WA', 'TAS', 'NT', 'QLD', 'SA']
      .indexOf(this.normalizeStrictCode(value)) >= 0;
  },

  toDate(value) {
    if (
      Object.prototype.toString.call(value) === '[object Date]' &&
      !isNaN(value.getTime())
    ) {
      return value;
    }

    const parsed = new Date(value);

    return isNaN(parsed.getTime()) ? null : parsed;
  },

  dateKey(date) {
    return Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  },

  pairKey(cNumber, bNumber) {
    return `${cNumber}::${bNumber}`;
  },

  bOwnerKey(bNumber, owner) {
    return `${bNumber}::${this.normalizeOwner(owner)}`;
  },

  addLookupRecord(lookup, key, record) {
    if (!key) {
      return;
    }

    if (!lookup[key]) {
      lookup[key] = [];
    }

    lookup[key].push(record);
  },

  displayValue(value) {
    if (value == null || value === '') {
      return '(blank)';
    }

    return String(value);
  },

  buildCorrectionNote(beforeValue, afterValue) {
    return [
      'Corrected from EOD.',
      `Before: ${this.displayValue(beforeValue)}`,
      `After: ${this.displayValue(afterValue)}`
    ].join('\n');
  },

  buildProductNote(product) {
    return [
      `Product Code: ${this.displayValue(product.productCode)}`,
      `Product Description: ${this.displayValue(product.productDescription)}`,
      `Vintage: ${this.displayValue(product.vintage)}`,
      `Bottle Size: ${this.displayValue(product.bottleSize)}`
    ].join('\n');
  }
};
