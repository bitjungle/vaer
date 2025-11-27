#!/usr/bin/env python3
"""
Main ETL orchestration script
Coordinates the full ETL pipeline:
1. Wait for PostGIS to be ready
2. Load PostGIS dump
3. Transform data
4. Export to SQLite
"""

import os
import sys
import time
import subprocess

def wait_for_postgres():
    """Wait for PostgreSQL to be ready"""
    print("=== Waiting for PostgreSQL ===")

    max_attempts = 30
    for attempt in range(max_attempts):
        try:
            result = subprocess.run(
                ['pg_isready', '-h', os.getenv('PGHOST', 'localhost')],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                print("✓ PostgreSQL is ready")
                return True
        except Exception as e:
            pass

        print(f"  Waiting... ({attempt + 1}/{max_attempts})")
        time.sleep(2)

    print("✗ PostgreSQL did not become ready in time")
    return False

def load_postgis_dump():
    """Load PostGIS dump into staging database"""
    print("\n=== Loading PostGIS Dump ===")

    dump_path = '/postgis/Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql'

    if not os.path.exists(dump_path):
        print(f"✗ PostGIS dump not found: {dump_path}")
        print("  Please ensure the postgis/ directory contains the Stedsnavn dump")
        return False

    # Check if data already loaded
    try:
        # Find the stedsnavn schema
        schema_query = "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'stedsnavn_%' LIMIT 1;"
        result = subprocess.run(
            ['psql', '-t', '-c', schema_query],
            capture_output=True,
            text=True,
            env=os.environ
        )
        if result.returncode == 0 and result.stdout.strip():
            schema_name = result.stdout.strip()
            # Check if table has data
            count_query = f"SELECT COUNT(*) FROM {schema_name}.stedsnavn;"
            result = subprocess.run(
                ['psql', '-t', '-c', count_query],
                capture_output=True,
                text=True,
                env=os.environ
            )
            if result.returncode == 0:
                count = int(result.stdout.strip())
                if count > 0:
                    print(f"✓ PostGIS data already loaded ({count} records)")
                    return True
    except:
        pass

    # Load the dump
    print(f"  Loading from: {dump_path}")
    print("  This may take 30-60 seconds...")

    try:
        result = subprocess.run(
            ['psql', '-f', dump_path],
            capture_output=True,
            text=True,
            env=os.environ,
            timeout=300  # 5 minute timeout
        )

        if result.returncode == 0:
            print("✓ PostGIS dump loaded successfully")
            return True
        else:
            print(f"✗ Failed to load PostGIS dump")
            print(f"  stderr: {result.stderr[:500]}")
            return False
    except subprocess.TimeoutExpired:
        print("✗ Loading PostGIS dump timed out")
        return False
    except Exception as e:
        print(f"✗ Error loading PostGIS dump: {e}")
        return False

def run_transform():
    """Run data transformation"""
    print("\n=== Running Transformation ===")

    try:
        result = subprocess.run(
            ['python3', '/scripts/02_transform.py'],
            env=os.environ,
            timeout=300  # 5 minute timeout
        )

        if result.returncode == 0:
            print("✓ Transformation completed")
            return True
        else:
            print("✗ Transformation failed")
            return False
    except subprocess.TimeoutExpired:
        print("✗ Transformation timed out")
        return False
    except Exception as e:
        print(f"✗ Error running transformation: {e}")
        return False

def run_export():
    """Run SQLite export"""
    print("\n=== Running SQLite Export ===")

    try:
        result = subprocess.run(
            ['python3', '/scripts/03_export_sqlite.py'],
            env=os.environ,
            timeout=300  # 5 minute timeout
        )

        if result.returncode == 0:
            print("✓ SQLite export completed")
            return True
        else:
            print("✗ SQLite export failed")
            return False
    except subprocess.TimeoutExpired:
        print("✗ SQLite export timed out")
        return False
    except Exception as e:
        print(f"✗ Error running SQLite export: {e}")
        return False

def main():
    print("=" * 60)
    print("  Stedsnavn ETL Pipeline")
    print("  Kartverket → PostGIS → SQLite")
    print("=" * 60)
    print()

    start_time = time.time()

    # Step 1: Wait for PostgreSQL
    if not wait_for_postgres():
        sys.exit(1)

    # Step 2: Load PostGIS dump
    if not load_postgis_dump():
        sys.exit(1)

    # Step 3: Transform data
    if not run_transform():
        sys.exit(1)

    # Step 4: Export to SQLite
    if not run_export():
        sys.exit(1)

    # Success
    duration = time.time() - start_time
    print()
    print("=" * 60)
    print(f"  ✓ ETL Pipeline Complete")
    print(f"  Duration: {duration:.1f} seconds")
    print(f"  Output: /data/places.db")
    print("=" * 60)

if __name__ == '__main__':
    main()
