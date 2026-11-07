-- Catalogue phase C3: a 2-D GiST index for the map's viewport query.
-- Built-in `point` type, no extension. The query uses exactly this expression:
--   point(longitude, latitude) <@ box(point(west, south), point(east, north))
-- Additive and non-destructive: only adds an index.
CREATE INDEX "places_location_gist_idx" ON "places" USING gist (point("longitude", "latitude"));
