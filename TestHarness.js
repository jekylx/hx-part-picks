/**
 * TestHarness.js
 *
 * Compatibility anchor for the old monolithic test harness filename.
 *
 * The test suite now lives in focused modules under tests/:
 * - tests/TestRunner.js owns the public runner functions.
 * - tests/TestAssertions.js owns assertion helpers.
 * - tests/TestMocks.js owns fake Spreadsheet/Gmail/Drive/trigger services.
 * - tests/TestFixtures.js owns shared data builders and setup helpers.
 * - tests/<domain>/*.js own the individual test registries.
 *
 * This file intentionally defines no duplicate runners. Apps Script loads all
 * project files globally, so the public functions from tests/TestRunner.js
 * remain available as runLocalTests(), runSummaryTestsOnly(), and the other
 * runner entry points documented there.
 */
