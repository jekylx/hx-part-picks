const PromptService = {
  buildExtractionPrompt() {
    const fieldsText = CONFIG.fields
      .map(field => this.buildFieldLine_(field))
      .join('\n');

    const keys = CONFIG.fields
      .map(field => `"${field.key}": null`)
      .join(',\n      ');

    return `
You are extracting data from a wine warehouse Part Pick Form.

Document assumptions:
- The PDF contains exactly ONE page.
- The page contains exactly ONE Part Pick Form.
- Return exactly ONE object in the forms array.

Extraction goal:
Extract only handwritten values and clearly selected printed options from the form.

Core rules:
- Return raw values as written.
- Do not normalise values.
- Do not correct values.
- Do not infer missing values.
- Do not add missing prefixes.
- Do not expand shortened values.
- Do not convert similar-looking characters.
- Do not guess unclear characters.
- Do not use examples from these instructions as extracted values.
- Do not copy printed labels as field values.
- Do not copy unselected option text as field values.
- Do not summarize.

Location rules:
- For each field, look only in the labelled field box or the immediate marked area for that label.
- Do not pull values from unrelated nearby boxes.
- Random writing outside the form boxes should only go into external_misc_notes.
- A long horizontal line may appear throughout the page. Ignore this.

Blank / unclear rules:
- If a field is blank, empty, crossed-out, or unclear, return null.
- If a value is partly readable but key characters are unclear, return null.
- If handwriting is readable but messy, return the raw handwritten text exactly as seen.

Selection rules:
- For selection fields, return the exact allowed option only when one option is clearly selected.
- Selection marks may be circles, ticks, slashes, crosses, or obvious marks around/near an option.
- If no option is clearly selected, return null.
- If multiple options are marked and there is no clear single selection, return null.

Output rules:
- Return ONLY valid JSON.
- Do not wrap JSON in markdown.
- Do not include comments.
- Do not include explanations.
- Include every key exactly once.
- Do not include extra keys.
- Every value must be either a string or null.

Fields to extract:
${fieldsText}

Before returning, verify:
- The JSON is valid.
- The top-level object has only "forms".
- "forms" contains exactly one object.
- The object contains exactly the requested keys.
- No value has been normalised, corrected, inferred, or copied from examples.

Return exactly this JSON shape:
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