#!/usr/bin/env python3
"""
Transform Kartverket Stedsnavn data:
- Reproject from EPSG:25833 (UTM Zone 33) to EPSG:4326 (WGS84 lat/lon)
- Filter to relevant place types
- Normalize names and extract metadata
- Export to CSV for SQLite import
"""

import os
import sys
import csv
import json
import psycopg2
from psycopg2.extras import RealDictCursor

# Place type mapping from Norwegian to English
PLACE_TYPE_MAPPING = {
    'by': 'city',
    'tettsted': 'town',
    'bygdelagBygd': 'village',
    'tettbebyggelse': 'settlement',
    'gard': 'farm',
    'bydel': 'district',
    'tettsteddel': 'town_part',
    'poststed': 'postal_town',
}

# Place types we want to include (populated places primarily)
INCLUDED_TYPES = [
    'by',  # Cities (80)
    'tettsted',  # Towns (553)
    'bygdelagBygd',  # Villages (1,306)
    'bydel',  # Districts (259)
    'tettbebyggelse',  # Settlements (570)
    'gard',  # Farms (33,239)
]

def connect_db():
    """Connect to PostgreSQL staging database"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('PGHOST', 'localhost'),
            port=os.getenv('PGPORT', '5432'),
            database=os.getenv('PGDATABASE', 'stedsnavn_staging'),
            user=os.getenv('PGUSER', 'postgres'),
            password=os.getenv('PGPASSWORD', 'postgres')
        )
        print("✓ Connected to PostGIS database")

        # Find and set search_path to stedsnavn schema
        cursor = conn.cursor()
        cursor.execute("""
            SELECT nspname
            FROM pg_namespace
            WHERE nspname LIKE 'stedsnavn_%'
            LIMIT 1
        """)
        result = cursor.fetchone()
        if result:
            schema_name = result[0]
            cursor.execute(f"SET search_path TO {schema_name}, public")
            print(f"✓ Using schema: {schema_name}")
        else:
            print("⚠ Warning: stedsnavn schema not found, using public schema")
        cursor.close()

        return conn
    except Exception as e:
        print(f"✗ Failed to connect to database: {e}")
        sys.exit(1)

def extract_places(conn):
    """Extract and transform place data from PostGIS"""
    print("\n=== Extracting place data ===")

    # Build type filter
    type_placeholders = ','.join(['%s'] * len(INCLUDED_TYPES))

    query = f"""
    SELECT DISTINCT
        s.lokalid as ssr_id,
        sm.komplettskrivemate as primary_name,
        sm.skrivematestatus as name_status,
        s.navneobjekttype as object_type,
        ST_Y(ST_Transform(s.posisjon, 4326)) as lat,
        ST_X(ST_Transform(s.posisjon, 4326)) as lon,
        k.kommunenummer as municipality_code,
        k.kommunenavn as municipality_name,
        k.fylkesnavn as county_name,
        false as representasjonspunkt
    FROM sted_posisjon s
    JOIN stedsnavn sn ON sn.sted_fk = s.objid
    JOIN skrivemate sm ON sm.stedsnavn_fk = sn.objid
    LEFT JOIN kommune k ON k.sted_fk = s.objid
    WHERE s.navneobjekttype IN ({type_placeholders})
      AND sm.komplettskrivemate IS NOT NULL
      AND s.posisjon IS NOT NULL
      AND sm.skrivematenummer = 1
    ORDER BY k.kommunenummer, sm.komplettskrivemate;
    """

    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(query, INCLUDED_TYPES)

    records = cursor.fetchall()
    print(f"✓ Extracted {len(records)} place records")

    return records

def calculate_importance(record):
    """Calculate importance score (0-10) based on place type and other factors"""
    type_scores = {
        'by': 10.0,
        'tettsted': 8.0,
        'bydel': 7.0,
        'bygdelagBygd': 5.0,
        'tettbebyggelse': 4.0,
        'gard': 2.0,
    }

    base_score = type_scores.get(record['object_type'], 1.0)

    # Boost for being a municipality or county name
    # (These are typically important administrative centers)
    if record.get('primary_name') == record.get('municipality_name'):
        base_score += 2.0

    return min(10.0, base_score)

def transform_records(records):
    """Transform records into final format for CSV export"""
    print("\n=== Transforming records ===")

    transformed = []
    seen_names = {}  # Track duplicates

    for record in records:
        # Map Norwegian type to English
        place_class = PLACE_TYPE_MAPPING.get(record['object_type'], 'place')

        # Calculate importance
        importance = calculate_importance(record)

        # Detect municipality/county seats
        # (Simple heuristic: if place name matches municipality name)
        is_municipality_seat = (
            record['primary_name'] == record['municipality_name']
        ) if record['municipality_name'] else False

        # County seats are harder to detect automatically
        # For now, we'll mark major cities
        major_cities = ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø', 'Drammen']
        is_county_seat = record['primary_name'] in major_cities

        # Create transformed record
        transformed_record = {
            'ssr_id': record['ssr_id'],
            'primary_name': record['primary_name'],
            'alt_names': None,  # TODO: Extract from alternative name fields if available
            'lat': round(record['lat'], 6),
            'lon': round(record['lon'], 6),
            'place_class': place_class,
            'municipality_code': record['municipality_code'],
            'municipality_name': record['municipality_name'],
            'county_name': record['county_name'],
            'population': None,  # Not available in Stedsnavn
            'is_county_seat': 1 if is_county_seat else 0,
            'is_municipality_seat': 1 if is_municipality_seat else 0,
            'importance_score': importance,
        }

        # Track duplicates (same name + municipality)
        key = (record['primary_name'], record['municipality_code'])
        if key in seen_names:
            # Keep the one with higher importance
            if importance > seen_names[key]['importance_score']:
                transformed[seen_names[key]['index']] = transformed_record
                seen_names[key] = {'importance_score': importance, 'index': len(transformed) - 1}
        else:
            seen_names[key] = {'importance_score': importance, 'index': len(transformed)}
            transformed.append(transformed_record)

    print(f"✓ Transformed {len(transformed)} unique records")
    return transformed

def export_to_csv(records, output_path):
    """Export records to CSV for SQLite import"""
    print(f"\n=== Exporting to CSV: {output_path} ===")

    fieldnames = [
        'ssr_id', 'primary_name', 'alt_names', 'lat', 'lon',
        'place_class', 'municipality_code', 'municipality_name', 'county_name',
        'population', 'is_county_seat', 'is_municipality_seat', 'importance_score'
    ]

    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"✓ Exported {len(records)} records to CSV")

def main():
    print("=== Stedsnavn ETL: Transform ===\n")

    # Connect to PostGIS
    conn = connect_db()

    try:
        # Extract
        records = extract_places(conn)

        # Transform
        transformed = transform_records(records)

        # Export
        output_path = '/data/places_staging.csv'
        export_to_csv(transformed, output_path)

        print(f"\n✓ Transformation complete")
        print(f"  Records: {len(transformed)}")
        print(f"  Output: {output_path}")

    finally:
        conn.close()

if __name__ == '__main__':
    main()
