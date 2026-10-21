-- Reload PostgREST schema cache to pick up FK constraint metadata
-- This is needed because PostgREST caches FK constraint names and the cache
-- can become stale after migrations that add/modify foreign keys.
NOTIFY pgrst, 'reload schema';
