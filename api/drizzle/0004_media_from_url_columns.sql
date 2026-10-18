-- Copies the 1.x photo columns into media (2.0.0-alpha.5): rigs.image_url and gear.image_url
-- become each record's cover (position 0); an event's event_photo_url comes first, then its
-- other photo_urls in order, each URL once. Blank values are skipped, "uploads/x" becomes
-- "/uploads/x", and only uploads and https links are kept (as the API allowed). Videos are
-- told apart by their extension (mp4, mov, webm, m4v). The old columns stay, unused, until a
-- later release drops them.
-- Only owners with no media yet get rows, so this can be re-run without duplicates
-- (scripts/import-mongo.ts runs it after an import; the tests run it on seeded rows).
WITH src AS (
  SELECT 'rig'::text AS owner_type, r.id AS owner_id, r.image_url AS raw, 0::bigint AS ord, r.created_at FROM rigs r
  UNION ALL
  SELECT 'gear', g.id, g.image_url, 0, g.created_at FROM gear g
  UNION ALL
  SELECT 'event', e.id, e.event_photo_url, 0, e.created_at FROM events e
  UNION ALL
  SELECT 'event', e.id, u.url, u.n, e.created_at
  FROM events e CROSS JOIN LATERAL unnest(e.photo_urls) WITH ORDINALITY AS u(url, n)
),
cleaned AS (
  SELECT owner_type, owner_id, ord, created_at,
    CASE WHEN btrim(raw) LIKE 'uploads/%' THEN '/' || btrim(raw) ELSE btrim(raw) END AS url
  FROM src
  WHERE raw IS NOT NULL
),
firsts AS (
  SELECT owner_type, owner_id, url, created_at, min(ord) AS ord
  FROM cleaned
  WHERE url LIKE '/uploads/_%' OR url ~ '^https://\S+$'
  GROUP BY owner_type, owner_id, url, created_at
)
INSERT INTO "media" ("owner_type", "owner_id", "url", "kind", "position", "created_at")
SELECT f.owner_type, f.owner_id, f.url,
  CASE WHEN split_part(f.url, '?', 1) ~* '\.(mp4|mov|webm|m4v)$' THEN 'video' ELSE 'photo' END,
  row_number() OVER (PARTITION BY f.owner_type, f.owner_id ORDER BY f.ord, f.url) - 1,
  f.created_at
FROM firsts f
WHERE NOT EXISTS (
  SELECT 1 FROM "media" m WHERE m.owner_type = f.owner_type AND m.owner_id = f.owner_id
);
