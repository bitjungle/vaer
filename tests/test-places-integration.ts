/**
 * Integration test for Places module (Phase 7)
 * Tests PlacesDB, matcher, and tool handler
 */

import { PlacesDB } from '../src/places/db.js';
import { resolveName } from '../src/places/matcher.js';
import { handlePlaceResolve } from '../src/tools/places-resolve.js';
import type { PlaceResolveInput } from '../src/places/schemas.js';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function log(emoji: string, message: string, color: string = colors.reset) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function logError(message: string, error: unknown) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
  console.error(colors.dim, error, colors.reset);
}

/**
 * Test PlacesDB initialization
 */
async function testPlacesDBInit(): Promise<PlacesDB | null> {
  log('🔍', 'Testing PlacesDB initialization...', colors.blue);

  try {
    const db = new PlacesDB('./data/places.db');
    log('✓', 'PlacesDB initialized successfully', colors.green);

    const stats = db.getStats();
    console.log(`  ${colors.dim}→ Total places: ${stats.totalPlaces.toLocaleString()}`);
    console.log(`  → FTS index size: ${stats.ftsIndexSize.toLocaleString()} rows`);
    console.log(`  → Build date: ${stats.metadata.build_date || 'unknown'}${colors.reset}`);

    return db;
  } catch (error) {
    logError('PlacesDB initialization failed (database may not exist yet)', error);
    log('ℹ️', 'Run ETL pipeline to create the database: cd scripts/etl && make run', colors.yellow);
    return null;
  }
}

/**
 * Test basic database queries
 */
async function testDatabaseQueries(db: PlacesDB) {
  log('🔍', 'Testing database queries...', colors.blue);

  // Test exact primary name match
  const osloExact = db.findExactPrimary('Oslo');
  if (osloExact.length > 0) {
    log('✓', `Found ${osloExact.length} exact matches for "Oslo"`, colors.green);
    console.log(`  ${colors.dim}→ Top result: ${osloExact[0].primary_name} (${osloExact[0].lat.toFixed(4)}°N, ${osloExact[0].lon.toFixed(4)}°E)${colors.reset}`);
  } else {
    logError('No exact matches found for "Oslo"', 'Expected at least one result');
  }

  // Test FTS query
  const bergenFTS = db.findFTS('berg', 5);
  if (bergenFTS.length > 0) {
    log('✓', `Found ${bergenFTS.length} FTS matches for "berg"`, colors.green);
    console.log(`  ${colors.dim}→ Top result: ${bergenFTS[0].primary_name} (rank: ${bergenFTS[0].fts_rank})${colors.reset}`);
  } else {
    logError('No FTS matches found for "berg"', 'Expected at least one result');
  }

  // Test Norwegian characters (æøå)
  const norwegianChars = db.findFTS('tromsø', 3);
  if (norwegianChars.length > 0) {
    log('✓', `Norwegian characters (ø) handled correctly: ${norwegianChars.length} matches for "tromsø"`, colors.green);
  } else {
    logError('Norwegian character handling failed for "tromsø"', 'Expected at least one result');
  }
}

/**
 * Test matcher logic
 */
async function testMatcher(db: PlacesDB) {
  log('🔍', 'Testing matcher logic...', colors.blue);

  // Test case 1: Exact match with high confidence
  const osloMatches = resolveName(db, { query: 'Oslo', limit: 5 });
  if (osloMatches.length > 0 && osloMatches[0].confidence >= 0.8) {
    log('✓', `Matcher: "Oslo" → ${osloMatches[0].name} (confidence: ${(osloMatches[0].confidence * 100).toFixed(0)}%)`, colors.green);
  } else {
    logError('Matcher failed for "Oslo"', `Expected high-confidence match, got ${osloMatches.length} results`);
  }

  // Test case 2: Fuzzy matching
  const fuzzyMatches = resolveName(db, { query: 'bergen', limit: 5 });
  if (fuzzyMatches.length > 0) {
    log('✓', `Matcher: "bergen" → ${fuzzyMatches[0].name} (confidence: ${(fuzzyMatches[0].confidence * 100).toFixed(0)}%)`, colors.green);
    console.log(`  ${colors.dim}→ ${fuzzyMatches.length} total matches${colors.reset}`);
  } else {
    logError('Matcher failed for "bergen"', 'Expected at least one result');
  }

  // Test case 3: Ambiguous query
  const ambiguousMatches = resolveName(db, { query: 'sand', limit: 5 });
  if (ambiguousMatches.length >= 2) {
    log('✓', `Matcher: "sand" → ${ambiguousMatches.length} matches (ambiguous, as expected)`, colors.green);
    console.log(`  ${colors.dim}→ Top 3: ${ambiguousMatches.slice(0, 3).map(m => m.name).join(', ')}${colors.reset}`);
  } else {
    logError('Matcher failed for ambiguous query "sand"', 'Expected multiple results');
  }

  // Test case 4: Norwegian characters
  const tromsøMatches = resolveName(db, { query: 'tromsø', limit: 5 });
  if (tromsøMatches.length > 0 && tromsøMatches[0].name.toLowerCase().includes('tromsø')) {
    log('✓', `Matcher: "tromsø" → ${tromsøMatches[0].name} (Norwegian chars preserved)`, colors.green);
  } else {
    logError('Matcher failed for "tromsø" with Norwegian characters', 'Expected match with ø preserved');
  }
}

/**
 * Test tool handler
 */
async function testToolHandler(db: PlacesDB) {
  log('🔍', 'Testing tool handler...', colors.blue);

  // Test case 1: High-confidence single match
  const osloInput: PlaceResolveInput = {
    query: 'Oslo',
    limit: 5,
    language: 'en',
  };

  const osloResponse = await handlePlaceResolve(osloInput, db);
  if (osloResponse.isError) {
    logError('Tool handler failed for "Oslo"', osloResponse.content[0].text);
  } else {
    log('✓', 'Tool handler: "Oslo" returned successfully', colors.green);
    console.log(`  ${colors.dim}→ Text summary: ${osloResponse.content[0].text.split('\n')[0]}${colors.reset}`);

    if (osloResponse.structuredContent) {
      const matches = osloResponse.structuredContent.matches;
      console.log(`  ${colors.dim}→ Structured: ${matches.length} matches, top confidence: ${(matches[0].confidence * 100).toFixed(0)}%${colors.reset}`);
    }
  }

  // Test case 2: Ambiguous query
  const sandInput: PlaceResolveInput = {
    query: 'sand',
    limit: 5,
    language: 'en',
  };

  const sandResponse = await handlePlaceResolve(sandInput, db);
  if (sandResponse.isError) {
    logError('Tool handler failed for "sand"', sandResponse.content[0].text);
  } else {
    log('✓', 'Tool handler: "sand" (ambiguous) returned disambiguation', colors.green);
    const textPreview = sandResponse.content[0].text.split('\n').slice(0, 2).join('\n');
    console.log(`  ${colors.dim}→ ${textPreview}${colors.reset}`);
  }

  // Test case 3: No matches
  const invalidInput: PlaceResolveInput = {
    query: 'xyzabc12345',
    limit: 5,
    language: 'en',
  };

  const invalidResponse = await handlePlaceResolve(invalidInput, db);
  if (invalidResponse.isError) {
    log('✓', 'Tool handler: Invalid query correctly returned error', colors.green);
    console.log(`  ${colors.dim}→ ${invalidResponse.content[0].text.split('\n')[0]}${colors.reset}`);
  } else {
    logError('Tool handler should have returned error for invalid query', 'Expected isError: true');
  }
}

/**
 * Main test suite
 */
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.blue}Places Module Integration Test (Phase 7)${colors.reset}`);
  console.log(`${'='.repeat(60)}\n`);

  // Initialize database
  const db = await testPlacesDBInit();
  if (!db) {
    console.log(`\n${colors.yellow}⚠ Tests skipped: Database not available${colors.reset}`);
    console.log(`Run the ETL pipeline to create the database:`);
    console.log(`  cd scripts/etl && make run\n`);
    process.exit(1);
  }

  console.log();

  // Run tests
  try {
    await testDatabaseQueries(db);
    console.log();

    await testMatcher(db);
    console.log();

    await testToolHandler(db);
    console.log();

    // Summary
    console.log(`${'='.repeat(60)}`);
    log('✓', 'All tests completed successfully', colors.green);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.log();
    console.log(`${'='.repeat(60)}`);
    logError('Test suite failed', error);
    console.log(`${'='.repeat(60)}\n`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run tests
main().catch((error) => {
  logError('Unhandled error in test suite', error);
  process.exit(1);
});
