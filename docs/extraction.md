# Extraction

Gemini extraction is intentionally raw. The prompt must help Gemini find fields, not clean them.

## Prompt Contract

- The PDF contains exactly one page.
- The page contains exactly one Part Pick form.
- Gemini returns exactly one object inside `forms`.
- Return only valid JSON.
- Include every configured key exactly once.
- Each value must be a string or `null`.
- Do not include explanations, comments, markdown, or extra keys.

## Raw Value Rules

Gemini must:

- Return handwritten values as written.
- Return selected printed options only when one option is clearly selected.
- Return `null` for blank, crossed-out, unclear, partly unreadable, or ambiguous values.

Gemini must not:

- Normalize values.
- Correct values.
- Infer missing values.
- Add missing prefixes.
- Expand shortened values.
- Convert similar-looking characters.
- Guess unclear characters.
- Copy examples from the prompt.
- Copy printed labels or unselected options as values.

## Fields

Field definitions live in `CONFIG.fields` in `Config.js`. Each field includes:

- `key`: JSON key used by Gemini.
- `label`: printed form label.
- `sheetColumn`: raw `Part Picks` column.
- `type`: handwritten or selection.
- `required` and `critical`: extraction guidance and later review signal.
- `options`: allowed values for selection fields.
- `description`: extra prompt instructions for sensitive fields.

Important fields include `order_number`, `original_location`, `b_code`, `carton_number`, `total_bottle_count`, `q_label`, `incomplete_reason`, and `carrier`.

## Blank, Unclear, And Selection Fields

- Blank field: `null`.
- Empty, crossed-out, or unclear field: `null`.
- Partly readable with key unclear characters: `null`.
- Messy but readable handwriting: raw text exactly as seen.
- Selection fields: exact allowed option only when the mark is clear.
- Multiple marked options with no clear single selection: `null`.

## Raw Sheet Versus Summary

`Part Picks` stores raw Gemini output as plain text so leading zeroes and uncertain human input are preserved.

`Part Pick Summary` is derived later. Summary values may be normalized by `NormalisationService` for display and matching. EOD enrichment then applies controlled corrections and validation notes.

Do not move normalization into the Gemini prompt or raw row append path.
