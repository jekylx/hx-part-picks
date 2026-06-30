const NormalisationService = {
  normalizeSummaryValue(fieldKey, value) {
    if (value == null || value === '') {
      return '';
    }

    if (fieldKey === 'order_number') {
      return this.normalizeOrderNumber_(value) || value;
    }

    if (fieldKey === 'b_code') {
      return this.normalizeBNumber_(value) || value;
    }

    if (fieldKey === 'carton_number') {
      return this.normalizeCartonNumber_(value) || value;
    }

    if (fieldKey === 'state') {
      return this.normalizeState_(value) || '';
    }

    if (fieldKey === 'carrier') {
      return this.normalizeCarrier_(value) || '';
    }

    return value;
  },

  normalizeOrderNumber_(value) {
    const cleaned = String(value)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');

    return cleaned ? cleaned : null;
  },

  normalizePrefixedSevenDigitCode_(value, prefix) {
    let cleaned = String(value)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(1);
    }

    const digits = cleaned
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');

    return /^\d{7}$/.test(digits) ? prefix + digits : null;
  },

  normalizeBNumber_(value) {
    let cleaned = String(value)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    if (!cleaned) {
      return null;
    }

    if (cleaned.startsWith('B')) {
      cleaned = cleaned.slice(1);
    }

    let digits = cleaned
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');

    if (/^[85]\d{7}$/.test(digits)) {
      digits = digits.slice(1);
    }

    return /^\d{7}$/.test(digits) ? 'B' + digits : null;
  },

  normalizeCartonNumber_(value) {
    const raw = String(value)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    const cCode = this.normalizePrefixedSevenDigitCode_(raw, 'C');

    if (cCode) {
      return cCode;
    }

    const digits = raw
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');

    if (/^393000010000\d{6}$/.test(digits)) {
      return digits;
    }

    if (digits.startsWith('393') && digits.length >= 9) {
      return '393000010000' + digits.slice(-6);
    }

    return null;
  },

  normalizeState_(value) {
    const cleaned = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    return ['NSW', 'VIC', 'ACT', 'WA', 'TAS', 'NT', 'QLD', 'SA']
      .indexOf(cleaned) >= 0
      ? cleaned
      : null;
  },

  normalizeCarrier_(value) {
    const cleaned = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const aliases = {
      AP: 'AP',
      'AUSTRALIA POST': 'AP',
      NXM: 'NXM',
      NEXDAY: 'NXM',
      'NEX DAY': 'NXM',
      AC: 'AC',
      'ALTERNATE CARRIER': 'AC',
      'ALTERNATIVE CARRIER': 'AC'
    };

    return aliases[cleaned] || null;
  }
};

function normalizeExtraction(record) {
  return record;
}
