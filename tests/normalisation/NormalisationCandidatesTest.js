/**
 * NormalisationCandidatesTest.js — safe display normalisation and
 * candidate generation for B/C/Order numbers.
 *
 * Invariants under test:
 * - B Number must be B + 7 digits.
 * - C Number must be C + 7 digits OR 393000010000 + 6 digits.
 * - Risky OCR candidates are generated, never blindly applied.
 */

function getNormalisationCandidatesTestCases_() {
  return [
    { name: 'B number OCR normalisation handles leading B misreads', fn: testBNumberOcrNormalisation_, suite: 'core' },
    { name: 'B and C candidate generation handles OCR formats', fn: testCandidateGeneration_, suite: 'core' },
    { name: 'Order number normalisation accepts variable length', fn: testOrderNumberNormalisation_, suite: 'core' }
  ];
}

function testBNumberOcrNormalisation_() {
  [
    ['B0867173', 'B0867173'],
    ['0867173', 'B0867173']
  ].forEach(pair => {
    assertEquals_(
      pair[1],
      NormalisationService.normalizeSummaryValue('b_code', pair[0]),
      `B Number should normalize ${pair[0]}.`
    );
  });

  assertEquals_(
    '80867173',
    NormalisationService.normalizeSummaryValue('b_code', '80867173'),
    'Eight digit OCR candidates must not be blindly accepted as Summary B Numbers.'
  );
}

function testCandidateGeneration_() {
  assertArrayEquals_(
    ['B0991354'],
    NormalisationService.getBNumberCandidates('B9 B0991354'),
    'B candidate generation should recover the embedded seven digit B value.'
  );

  assertArrayEquals_(
    ['B0867173'],
    NormalisationService.getBNumberCandidates('80867173'),
    'B candidate generation should recover leading B misreads.'
  );

  assertArrayEquals_(
    ['B0940416'],
    NormalisationService.getBNumberCandidates('BO 940416'),
    'B candidate generation should map OCR O to zero.'
  );

  assertArrayEquals_(
    ['393000010000514066'],
    NormalisationService.getCartonNumberCandidates('393-1-514066'),
    'C candidate generation should expand shortened 393 values.'
  );

  assertArrayEquals_(
    ['C1741875'],
    NormalisationService.getCartonNumberCandidates('C17 41 875'),
    'C candidate generation should keep C plus seven digits.'
  );

  assertArrayEquals_(
    ['393000010000562500'],
    NormalisationService.getCartonNumberCandidates('893-1-562500'),
    'C candidate generation should recover 393 when OCR reads leading 3 as 8.'
  );
}

function testOrderNumberNormalisation_() {
  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('1234567'),
    'Normal seven digit order number should stay unchanged.'
  );

  assertEquals_(
    '12',
    NormalisationService.normalizeOrderNumber_('12'),
    'Short order numbers should be accepted.'
  );

  assertEquals_(
    '1234567890',
    NormalisationService.normalizeOrderNumber_('1234567890'),
    'Long order numbers should be accepted.'
  );

  assertEquals_(
    '1400385',
    NormalisationService.normalizeOrderNumber_('140O385'),
    'Order number should normalize OCR O to zero.'
  );

  assertEquals_(
    '1400385',
    NormalisationService.normalizeOrderNumber_('14QQ385'),
    'Order number should normalize OCR Q to zero.'
  );

  assertEquals_(
    '1112345',
    NormalisationService.normalizeOrderNumber_('1IL2345'),
    'Order number should normalize OCR I/L to one.'
  );

  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('123-45/67'),
    'Order number should remove separators.'
  );

  assertEquals_(
    '1234567',
    NormalisationService.normalizeOrderNumber_('Ref 1234567'),
    'Order number should keep only digits from OCR-safe mixed text.'
  );

  assertEquals_(
    null,
    NormalisationService.normalizeOrderNumber_(''),
    'Blank order number should be invalid.'
  );

  assertEquals_(
    null,
    NormalisationService.normalizeOrderNumber_('ABC'),
    'Order number with no digits should be invalid.'
  );

  assertEquals_(
    '0012345',
    NormalisationService.normalizeOrderNumber_('0012345'),
    'Order number should preserve leading zeros.'
  );
}
