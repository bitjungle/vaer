#!/usr/bin/env python3
"""
Export transformed data to SQLite:
- Create database and schema
- Import data from CSV
- Build FTS5 index
- Optimize and verify
"""

import os
import sys
import csv
import json
import sqlite3
from datetime import datetime

def create_database(db_path, schema_path):
    """Create SQLite database with schema"""
    print(f"\n=== Creating database: {db_path} ===")

    # Remove existing database
    if os.path.exists(db_path):
        os.remove(db_path)
        print("✓ Removed existing database")

    # Connect and execute schema
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')

    with open(schema_path, 'r') as f:
        schema_sql = f.read()
        conn.executescript(schema_sql)

    print("✓ Schema created")
    return conn

def import_csv(conn, csv_path):
    """Import places data from CSV"""
    print(f"\n=== Importing from CSV: {csv_path} ===")

    if not os.path.exists(csv_path):
        print(f"✗ CSV file not found: {csv_path}")
        sys.exit(1)

    cursor = conn.cursor()

    # Read and import CSV
    with open(csv_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        rows = list(reader)

        print(f"✓ Read {len(rows)} records from CSV")

        # Insert records
        insert_sql = """
        INSERT INTO places (
            ssr_id, primary_name, alt_names, lat, lon,
            place_class, municipality_code, municipality_name, county_name,
            population, is_county_seat, is_municipality_seat, importance_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        records_inserted = 0
        for row in rows:
            try:
                cursor.execute(insert_sql, (
                    row['ssr_id'],
                    row['primary_name'],
                    row['alt_names'] if row['alt_names'] else None,
                    float(row['lat']),
                    float(row['lon']),
                    row['place_class'],
                    row['municipality_code'],
                    row['municipality_name'],
                    row['county_name'],
                    int(row['population']) if row['population'] else None,
                    int(row['is_county_seat']),
                    int(row['is_municipality_seat']),
                    float(row['importance_score']),
                ))
                records_inserted += 1
            except Exception as e:
                print(f"✗ Failed to insert record {row['ssr_id']}: {e}")

        conn.commit()
        print(f"✓ Inserted {records_inserted} records into places table")

    return records_inserted

def build_metadata(conn, record_count):
    """Add build metadata"""
    print("\n=== Adding metadata ===")

    cursor = conn.cursor()

    metadata = [
        ('build_date', datetime.utcnow().isoformat()),
        ('build_timestamp', str(int(datetime.utcnow().timestamp()))),
        ('record_count', str(record_count)),
        ('projection_source', 'EPSG:25833'),
        ('projection_target', 'EPSG:4326'),
    ]

    for key, value in metadata:
        cursor.execute(
            'INSERT OR REPLACE INTO _metadata (key, value) VALUES (?, ?)',
            (key, value)
        )

    conn.commit()
    print(f"✓ Added {len(metadata)} metadata entries")

def optimize_database(conn):
    """Optimize database for read performance"""
    print("\n=== Optimizing database ===")

    cursor = conn.cursor()

    # Analyze for query planner
    cursor.execute('ANALYZE')
    print("✓ Analyzed tables")

    # Compact database
    cursor.execute('VACUUM')
    print("✓ Vacuumed database")

    conn.commit()

def verify_database(conn, db_path):
    """Verify database integrity and functionality"""
    print("\n=== Verifying database ===")

    cursor = conn.cursor()

    # Check record counts
    cursor.execute('SELECT COUNT(*) FROM places')
    places_count = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM places_fts')
    fts_count = cursor.fetchone()[0]

    print(f"✓ Places table: {places_count} records")
    print(f"✓ FTS index: {fts_count} entries")

    if places_count != fts_count:
        print("✗ Warning: Record count mismatch between places and FTS!")

    # Test queries
    test_queries = [
        ("Exact match (Oslo)", "SELECT COUNT(*) FROM places WHERE LOWER(primary_name) = 'oslo'"),
        ("Norwegian char (ø)", "SELECT COUNT(*) FROM places WHERE primary_name LIKE '%ø%'"),
        ("FTS search (berg)", "SELECT COUNT(*) FROM places_fts WHERE places_fts MATCH 'berg*'"),
    ]

    for name, query in test_queries:
        cursor.execute(query)
        count = cursor.fetchone()[0]
        status = "✓" if count > 0 else "✗"
        print(f"{status} {name}: {count} results")

    # Database file size
    size_bytes = os.path.getsize(db_path)
    size_mb = size_bytes / (1024 * 1024)
    print(f"✓ Database size: {size_mb:.2f} MB")

    # Validation summary
    if places_count > 0 and fts_count == places_count and size_mb < 100:
        print("\n✓ Database verification PASSED")
        return True
    else:
        print("\n✗ Database verification FAILED")
        return False

def main():
    print("=== Stedsnavn ETL: Export to SQLite ===\n")

    # Paths
    csv_path = '/data/places_staging.csv'
    db_path = '/data/places.db'
    schema_path = '/scripts/schema.sql'

    # Create database
    conn = create_database(db_path, schema_path)

    try:
        # Import CSV
        record_count = import_csv(conn, csv_path)

        # Add metadata
        build_metadata(conn, record_count)

        # Optimize
        optimize_database(conn)

        # Verify
        success = verify_database(conn, db_path)

        if success:
            print("\n✓ SQLite export complete")
            print(f"  Database: {db_path}")
            print(f"  Records: {record_count}")
        else:
            print("\n✗ SQLite export completed with warnings")
            sys.exit(1)

    except Exception as e:
        print(f"\n✗ Export failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
