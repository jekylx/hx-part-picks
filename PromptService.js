const PromptService = {
  buildExtractionPrompt() {
    const fieldsText = CONFIG.fields
      .map(field => this.buildFieldLine_(field))
      .join('\n');

    const keys = CONFIG.fields
      .map(field => `"${field.key}": null`)
      .join(',\n      ');

    return `
This is a wine warehouse Part Pick Form.

The PDF contains exactly ONE page.
The page contains exactly ONE Part Pick Form.
Return exactly ONE object in the forms array.

Extract the handwritten fields and selected options from the form.

Rules:
- Return raw values as written.
- Do not normalise values.
- Do not correct values.
- Do not infer missing values.
- Do not add missing prefixes.
- Do not expand shortened values.
- Do not convert similar-looking characters.
- Do not copy printed labels as field values.
- If a field is blank, empty, crossed-out, or unclear, return null.
- Random writing outside the boxes should only go into external_misc_notes.
- For selections, return the clearly selected option only.
- If no option is clearly selected, return null.
- If multiple options are marked and there is no clear single selection, return null.
- A long horizontal line may appear throughout the page. Ignore this.
- Do not summarize.

Fields to extract:
${fieldsText}

Return ONLY valid JSON in exactly this shape:
{
  "forms": [
    {
      ${keys}
    }
  ]
}
`.trim();
  },

  buildFieldLine_(field) {
    const options = field.options
      ? ` Allowed values: ${field.options.join(' | ')}.`
      : '';

    const required = field.required
      ? ' Required.'
      : ' Optional; blank is acceptable.';

    const description = field.description
      ? ` ${field.description}`
      : '';

    return `- ${field.key}: printed label "${field.label}". Type: ${field.type}.${options}${required}${description}`;
  }
};