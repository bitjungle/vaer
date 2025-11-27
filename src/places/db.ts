/**
 * PlacesDB - SQLite database access layer for Norwegian place names
 */

import Database from 'better-sqlite3';
import { logger } from '../domain/logger.js';
import type { PlaceRecord } from './types.js';

export class PlacesDB {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = './data/places.db') {
    this.dbPath = dbPath;
    try {
      this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000');  // 64MB cache
      logger.info('PlacesDB initialized', { dbPath });
    } catch (error) {
      logger.error('Failed to open places database', { dbPath, error });
      throw new Error(`Could not open places database at ${dbPath}: ${error}`);
    }
  }

  /**
   * Find exact matches on primary_name (case-insensitive)
   */
  findExactPrimary(name: string): PlaceRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM places
      WHERE LOWER(primary_name) = LOWER(?)
      ORDER BY importance_score DESC NULLS LAST, population DESC NULLS LAST
      LIMIT 20
    `);

    return stmt.all(name) as PlaceRecord[];
  }

  /**
   * Find exact matches in alt_names JSON array (case-insensitive)
   */
  findExactAlt(name: string): PlaceRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM places
      WHERE alt_names IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM json_each(alt_names)
          WHERE LOWER(json_each.value) = LOWER(?)
        )
      ORDER BY importance_score DESC NULLS LAST, population DESC NULLS LAST
      LIMIT 20
    `);

    return stmt.all(name) as PlaceRecord[];
  }

  /**
   * Full-text search using FTS5 (prefix + fuzzy matching)
   */
  findFTS(query: string, limit: number = 20): Array<PlaceRecord & { fts_rank: number }> {
    // FTS5 query: exact phrase or prefix match
    const ftsQuery = `"${query.replace(/"/g, '""')}"*`;

    const stmt = this.db.prepare(`
      SELECT
        places.*,
        rank AS fts_rank
      FROM places_fts
      JOIN places ON places.id = places_fts.rowid
      WHERE places_fts MATCH ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    return stmt.all(ftsQuery, limit) as Array<PlaceRecord & { fts_rank: number }>;
  }

  /**
   * Get metadata about the gazetteer build
   */
  getMetadata(): Record<string, string> {
    try {
      const stmt = this.db.prepare('SELECT key, value FROM _metadata');
      const rows = stmt.all() as Array<{ key: string; value: string }>;
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    } catch (error) {
      logger.warn('Could not read metadata from places database', { error });
      return {};
    }
  }

  /**
   * Get statistics about the database
   */
  getStats() {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM places');
    const ftsCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM places_fts');

    const count = (countStmt.get() as { count: number }).count;
    const ftsCount = (ftsCountStmt.get() as { count: number }).count;

    return {
      totalPlaces: count,
      ftsIndexSize: ftsCount,
      metadata: this.getMetadata(),
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    logger.info('PlacesDB connection closed', { dbPath: this.dbPath });
  }
}
