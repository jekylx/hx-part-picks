/**
 * PromptRulesTest.js — Gemini extraction prompt content rules.
 */

function getPromptRulesTestCases_() {
  return [
    { name: 'Prompt contains raw extraction rules', fn: testPromptRules_, suite: 'core' }
  ];
}

function testPromptRules_() {
  const prompt = PromptService.buildExtractionPrompt();

  assertContains_(prompt, 'Part Pick Form', 'Prompt should describe Part Pick Form.');
  assertContains_(prompt, 'Fields to extract', 'Prompt should include fields section.');
  assertContains_(prompt, 'ORDER NUMBER', 'Prompt missing order number field.');
  assertContains_(prompt, 'ORIGINAL LOCATION', 'Prompt missing original location field.');
  assertContains_(prompt, 'B CODE', 'Prompt missing B code field.');
  assertContains_(prompt, 'CARTON NUMBER', 'Prompt missing carton number field.');
  assertContains_(prompt, 'Q LABEL', 'Prompt missing Q label field.');

  assertContains_(prompt, 'Return the handwritten value as written', 'Prompt should preserve raw handwritten values.');
  assertContains_(prompt, 'Do not infer', 'Prompt should prevent inference.');
  assertContains_(prompt, 'Return ONLY valid JSON', 'Prompt missing JSON-only rule.');

  assertTruthy_(
    prompt.indexOf('exactly ONE page') > -1 || prompt.indexOf('exactly one page') > -1,
    'Prompt should say the PDF is exactly one page now that PdfService splits batches.'
  );
}
