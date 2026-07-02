# Normalisation

## Raw Versus Summary

Raw `Part Picks` values remain raw Gemini output. Normalisation begins only when values are copied into the Summary/EOD workflow.

Summary display normalisation is intentionally conservative. It can clean clearly structured display values, but risky OCR interpretations are carried as candidates and accepted only when EOD or dictionary evidence confirms them.

## Candidate-Based Fields

Candidate normalisation applies to B Number, C Number, Order No., Location, and picker/member style values. The candidate functions return possible values; callers decide whether evidence is strong enough to accept them.

Hard formats:

- B Number: `B` plus 7 digits.
- C Number: `C` plus 7 digits, or `393000010000` plus 6 digits.
- Order No.: numeric, almost always 7 digits.
- Location: warehouse/row/bay/height/displacement pattern, confirmed against known EOD/dictionary locations where possible.

Risky OCR values must not blindly overwrite Summary values. Examples include a leading `B` read as `8` or `5`, lookalike digit/letter substitutions, and overlong digit runs. Those are candidates, not automatic truth.

## Safe Summary Normalisation

`NormalisationService.normalizeSummaryValue()` is used while building Summary drafts. It handles low-risk presentation cleanup such as:

- order number digit cleanup
- B/C values that already resolve to one valid formatted value
- state/carrier cleanup
- bottle count fields

This is not permission to write corrected values back to raw `Part Picks`.

## EOD Confirmation

EOD services may accept candidates when report evidence confirms them:

- Outstanding Orders confirms order/B evidence and order quantities.
- Pallet/Product confirms B ownership, C/location relationships, member, and unique product tuples.
- Location corrections require acceptable C/B/owner evidence, not just text similarity.

When evidence is missing, ambiguous, mismatched, or blocked by policy, the Summary row should keep the safe value and receive the appropriate note/background instead of silently overwriting it.

## Missing Units

Missing Units is raw-normalised only. EOD enrichment must not overwrite it.
