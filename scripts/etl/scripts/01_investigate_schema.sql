-- Investigation script for Kartverket Stedsnavn PostGIS dump
-- Use this to understand the structure before running the transformation

-- List all tables
\dt

-- Check stedsnavn table structure
\d stedsnavn

-- Sample data
SELECT * FROM stedsnavn LIMIT 5;

-- Count total records
SELECT COUNT(*) as total_records FROM stedsnavn;

-- Check available object types (navneobjekttyper)
SELECT navneobjekttyper, COUNT(*) as count
FROM stedsnavn
GROUP BY navneobjekttyper
ORDER BY count DESC
LIMIT 20;

-- Check geometry type and SRID
SELECT ST_GeometryType(geometri) as geom_type,
       ST_SRID(geometri) as srid,
       COUNT(*) as count
FROM stedsnavn
GROUP BY geom_type, srid;

-- Sample place names with Norwegian characters
SELECT skrivemaatenavn
FROM stedsnavn
WHERE skrivemaatenavn LIKE '%ø%'
   OR skrivemaatenavn LIKE '%æ%'
   OR skrivemaatenavn LIKE '%å%'
LIMIT 10;

-- Check kommune (municipality) data
SELECT DISTINCT kommunenummer, kommunenavn
FROM stedsnavn
WHERE kommunenummer IS NOT NULL
ORDER BY kommunenummer
LIMIT 10;

-- Check fylke (county) data
SELECT DISTINCT fylkesnummer, fylkesnavn
FROM stedsnavn
WHERE fylkesnavn IS NOT NULL
ORDER BY fylkesnummer
LIMIT 10;
