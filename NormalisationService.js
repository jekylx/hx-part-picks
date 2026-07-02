const NormalisationService = {
  normalizeSummaryValue(fieldKey, value) {
    if (value == null || value === '') {
      return '';
    }

    if (fieldKey === 'order_number') {
      return this.normalizeOrderNumber_(value) || value;
    }

    if (fieldKey === 'b_code') {
      return this.normalizeBNumberForSummary_(value) || value;
    }

    if (fieldKey === 'carton_number') {
      return this.normalizeCartonNumberForSummary_(value) || value;
    }

    if (fieldKey === 'state') {
      return this.normalizeState_(value) || '';
    }

    if (fieldKey === 'carrier') {
      return this.normalizeCarrier_(value) || '';
    }

    if (fieldKey === 'total_bottle_count' || fieldKey === 'bottles_missing') {
      const count = this.normalizeCount_(value);

      return count == null ? '' : count;
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
    const candidates = this.getBNumberCandidates(value);

    return candidates.length === 1 ? candidates[0] : null;
  },

  normalizeBNumberForSummary_(value) {
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

    const digits = cleaned
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');

    return /^\d{7}$/.test(digits) ? 'B' + digits : null;
  },

  normalizeCartonNumber_(value) {
    const candidates = this.getCartonNumberCandidates(value);

    return candidates.length === 1 ? candidates[0] : null;
  },

  normalizeCartonNumberForSummary_(value) {
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

  getBNumberCandidates(value) {
    const raw = String(value == null ? '' : value).toUpperCase();
    const compact = raw
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
    const candidates = [];

    this.addCandidate_(candidates, this.normalizeBNumberForSummary_(compact));

    const digitRuns = this.ocrDigits_(raw).match(/\d{7,8}/g) || [];
    const allDigits = this.ocrDigits_(compact);

    digitRuns.forEach(digits => {
      this.addCandidate_(candidates, this.bNumberFromDigits_(digits));

      if (/^[85]\d{7}$/.test(digits)) {
        this.addCandidate_(candidates, this.bNumberFromDigits_(digits.slice(1)));
      }
    });

    this.addCandidate_(candidates, this.bNumberFromDigits_(allDigits));

    if (compact.indexOf('B') >= 0 && allDigits.length > 7) {
      this.addCandidate_(candidates, this.bNumberFromDigits_(allDigits.slice(-7)));
    }

    return candidates;
  },

  getCartonNumberCandidates(value) {
    const raw = String(value == null ? '' : value).toUpperCase();
    const compact = raw
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
    const digits = this.ocrDigits_(compact);
    const candidates = [];

    this.addCandidate_(candidates, this.normalizeCartonNumberForSummary_(compact));

    if (compact.charAt(0) === 'C') {
      this.addCandidate_(candidates, this.cNumberFromDigits_(digits));
    }

    if (/^393000010000\d{6}$/.test(digits)) {
      this.addCandidate_(candidates, digits);
    }

    if (/^[38]93/.test(digits) && digits.length >= 9) {
      this.addCandidate_(candidates, '393000010000' + digits.slice(-6));
    }

    return candidates;
  },

  getOrderNumberCandidates(value) {
    const normalized = this.normalizeOrderNumber_(value);

    return normalized ? [normalized] : [];
  },

  getLocationCandidates(value, validLocations) {
    const valid = {};
    const candidates = [];

    (validLocations || []).forEach(location => {
      const normalizedLocation = this.normalizeLocation_(location);

      if (normalizedLocation) {
        valid[normalizedLocation] = String(location || '').trim();
      }
    });

    [
      this.normalizeLocation_(value),
      this.normalizeLocation_(this.ocrLocationText_(value))
    ].forEach(candidate => {
      if (candidate && valid[candidate]) {
        this.addCandidate_(candidates, valid[candidate]);
      }
    });

    return candidates;
  },

  getPickerCandidates(value, validPickers) {
    const cleaned = this.normalizePicker_(value);
    const candidates = [];

    if (!cleaned) {
      return candidates;
    }

    (validPickers || []).forEach(picker => {
      const normalizedPicker = this.normalizePicker_(picker);

      if (normalizedPicker && normalizedPicker === cleaned) {
        this.addCandidate_(candidates, String(picker || '').trim());
      }
    });

    return candidates;
  },

  bNumberFromDigits_(digits) {
    return /^\d{7}$/.test(digits) ? 'B' + digits : null;
  },

  cNumberFromDigits_(digits) {
    return /^\d{7}$/.test(digits) ? 'C' + digits : null;
  },

  ocrDigits_(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');
  },

  normalizeLocation_(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
  },

  ocrLocationText_(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[IL]/g, '1')
      .replace(/[OQ]/g, '0');
  },

  normalizePicker_(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z]+/g, '');
  },

  addCandidate_(candidates, value) {
    if (value && candidates.indexOf(value) === -1) {
      candidates.push(value);
    }
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
  },

  normalizeCount_(value) {
    if (value == null || value === '') {
      return null;
    }

    const cleaned = String(value)
      .replace(/,/g, '')
      .trim();

    if (!cleaned || /^N\s*\/?\s*A$/i.test(cleaned)) {
      return null;
    }

    const matches = cleaned.match(/\d+(?:\.\d+)?/g) || [];

    if (matches.length !== 1) {
      return null;
    }

    const numberValue = Number(matches[0]);

    return isFinite(numberValue) ? numberValue : null;
  }
};

function normalizeExtraction(record) {
  return record;
}
