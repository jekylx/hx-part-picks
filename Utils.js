const Utils = {
  md5Hex(bytes) {
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      bytes
    );

    return digest
      .map(byte => ('0' + (byte & 0xff).toString(16)).slice(-2))
      .join('');
  },

  parseJsonRelaxed(text) {
    const cleaned = String(text || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }

      throw err;
    }
  }
};