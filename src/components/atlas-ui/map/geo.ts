import { HOTEL, PLACES, YOU_DESIGN_POINT, type PlaceId } from "../fixtures";

/*
 * Turns positions on the Figma map art into coordinates, so the Mapbox map shows places in the
 * same arrangement the design draws them.
 *
 * The design frame is 390 x 844 and its centre (195, 422) is pinned to MAP_CENTER, a point in
 * Batumi's old town whose coastline falls where the design draws water (along the top). At
 * DESIGN_ZOOM one design pixel is one screen pixel, so on a 390 x 844 screen every marker lands
 * on its design position.
 *
 * Fictional fixtures: the coordinates are derived from the drawing, not from any real business.
 */

export type LngLat = [number, number];

export const MAP_CENTER: LngLat = [41.638, 41.6485];
export const DESIGN_ZOOM = 14;
const DESIGN_CENTER: [number, number] = [195, 422];

// Mapbox GL uses 512px tiles: metres per pixel = 78271.517 * cos(lat) / 2^zoom.
const METRES_PER_PIXEL = (78271.517 * Math.cos((MAP_CENTER[1] * Math.PI) / 180)) / 2 ** DESIGN_ZOOM;
const METRES_PER_DEG_LAT = 110574;
const METRES_PER_DEG_LNG = 111320 * Math.cos((MAP_CENTER[1] * Math.PI) / 180);

export function designPointToLngLat([x, y]: [number, number]): LngLat {
  const dx = (x - DESIGN_CENTER[0]) * METRES_PER_PIXEL;
  const dy = (y - DESIGN_CENTER[1]) * METRES_PER_PIXEL;
  return [MAP_CENTER[0] + dx / METRES_PER_DEG_LNG, MAP_CENTER[1] - dy / METRES_PER_DEG_LAT];
}

export const HOTEL_LNGLAT = designPointToLngLat(HOTEL.designPoint);
export const YOU_LNGLAT = designPointToLngLat(YOU_DESIGN_POINT);

export const PLACE_LNGLAT = Object.fromEntries(
  Object.values(PLACES).map((place) => [place.id, designPointToLngLat(place.designPoint)])
) as Record<PlaceId, LngLat>;
