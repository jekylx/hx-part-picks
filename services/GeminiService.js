const GeminiService = {
  extractPdf(pdf) {
    const apiKey = getGeminiApiKey_();

    const url =
      `${CONFIG.gemini.endpointBase}/${CONFIG.gemini.model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: PromptService.buildExtractionPrompt()
            },
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: Utilities.base64Encode(pdf.getBytes())
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: CONFIG.gemini.temperature,
        maxOutputTokens: CONFIG.gemini.maxOutputTokens,
        responseMimeType: 'application/json'
      }
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status < 200 || status >= 300) {
      throw new Error(`Gemini API error ${status}: ${body}`);
    }

    const data = JSON.parse(body);
    const text = this.extractTextFromResponse_(data);

    return Utils.parseJsonRelaxed(text);
  },

  extractTextFromResponse_(data) {
    const candidate = ((data || {}).candidates || [])[0] || {};
    const content = candidate.content || {};
    const parts = content.parts || [];

    const text = parts
      .map(part => part.text || '')
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Gemini returned no text. Raw response: ' + JSON.stringify(data));
    }

    return text;
  },

  normalizeForms(extraction) {
    if (!extraction) {
      throw new Error('Empty extraction result.');
    }

    if (Array.isArray(extraction.forms)) {
      return extraction.forms;
    }

    if (Array.isArray(extraction)) {
      return extraction;
    }

    return [extraction];
  }
};