"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CustomLayerInterface, Map as MapboxMap, MercatorCoordinate } from "mapbox-gl";
import type { GuestPlaceModel } from "@/services/map3d";
import { buildAnchorMatrix, groundingOffset, scaleToTargetHeight } from "@/services/map3d/anchor";

/**
 * ONE Mapbox custom layer, ONE Three.js scene, ONE renderer — for every model on
 * the map.
 *
 * The alternative people reach for first is a layer (or worse, a renderer) per
 * model. That costs a WebGL context each, and browsers hand out a handful before
 * they start discarding the oldest; it also means N draw calls fighting over the
 * same canvas. Here, models are objects in a single scene, drawn in one pass that
 * Mapbox schedules as part of its own frame.
 *
 * The renderer deliberately SHARES Mapbox's WebGL context rather than making its
 * own, so there is exactly one context on the page and depth testing against the
 * map's own 3D buildings works. That also means this layer must never call
 * `renderer.dispose()` on teardown in a way that kills the shared context — see
 * `onRemove`.
 */

/** Grey, unlit, slightly transparent: a silhouette of something not yet earned. */
const LOCKED_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x9aa3af,
  transparent: true,
  opacity: 0.55,
});

/** Below this zoom the models are a few pixels of noise, so they are skipped entirely. */
const MIN_MODEL_ZOOM = 14;

/** How much wider than the screen a model may be and still be loaded: it is ready by the time the guest pans to it. */
const LOAD_PADDING = 0.5;

export type ModelsLayerOptions = {
  /** Called with the Place id when a model is actually hit by a ray — never the nearest marker. */
  onSelect?: (placeId: string) => void;
  /** Lets a constrained device opt out of 3D without changing anything else on the map. */
  enabled?: boolean;
};

type PlacedModel = {
  placeId: string;
  group: THREE.Group;
  /** Anything that needs the file re-read or the object rebuilt: the file, the lock look, the height normalisation. */
  structuralKey: string;
  /** Anything that only moves, turns or stretches the object — cheap to apply in place, no reload. */
  transformKey: string;
};

const structuralKeyOf = (model: GuestPlaceModel) => [model.fileUrl, model.unlocked, model.targetHeightMeters].join("|");

const transformKeyOf = (model: GuestPlaceModel) =>
  [
    model.anchorLatitude,
    model.anchorLongitude,
    model.rotationDegrees,
    model.pitchDegrees,
    model.rollDegrees,
    model.elevationOffsetMeters,
    model.scale,
    model.scaleX,
    model.scaleY,
    model.scaleZ,
  ].join("|");

/**
 * The one matrix that decides where a model is DRAWN: its geographic display anchor and transform. It is built from
 * longitude and latitude, never from screen pixels, so the model stays put through pan, zoom, pitch, bearing, resize
 * and style changes. It is used for drawing and for nothing else.
 */
function matrixFor(model: GuestPlaceModel): THREE.Matrix4 {
  return buildAnchorMatrix(model.anchorLongitude, model.anchorLatitude, {
    rotationDegrees: model.rotationDegrees,
    pitchDegrees: model.pitchDegrees,
    rollDegrees: model.rollDegrees,
    elevationOffsetMeters: model.elevationOffsetMeters,
    scale: model.scale,
    axisScale: { x: model.scaleX, y: model.scaleY, z: model.scaleZ },
  });
}

export class PlaceModelsLayer implements CustomLayerInterface {
  readonly id = "atlas-place-models";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapboxMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly raycaster = new THREE.Raycaster();

  private readonly placed = new Map<string, PlacedModel>();
  private readonly loader = new GLTFLoader();

  /**
   * Parsed GLBs, keyed by URL and shared between Places that use the same file.
   * Each placement clones the scene graph, so one download serves many models and
   * no two placements share mutable transforms.
   */
  private readonly cache = new Map<string, Promise<THREE.Group>>();

  private models: GuestPlaceModel[] = [];
  private disposed = false;

  constructor(private readonly options: ModelsLayerOptions = {}) {
    // Enough light to read a model's form without pretending to match the map's
    // own time of day.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(0, -70, 100).normalize();
    this.scene.add(sun);
  }

  onAdd(map: MapboxMap, gl: WebGLRenderingContext): void {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      // Sharing Mapbox's context: no second context, no second canvas.
      context: gl,
      antialias: false,
    });
    // Mapbox owns the canvas and clears it; this renderer must not.
    this.renderer.autoClear = false;

    // Models are loaded only when they are near the screen, so the set is re-evaluated when the camera settles —
    // not on every frame, and not on a timer.
    map.on("moveend", this.handleMoveEnd);

    void this.syncModels();
  }

  private readonly handleMoveEnd = (): void => {
    if (this.disposed) return;
    void this.syncModels();
  };

  /**
   * Teardown.
   *
   * Geometries, materials and textures are disposed because they hold GPU memory
   * the garbage collector cannot reclaim on its own. The RENDERER is not disposed:
   * it wraps Mapbox's context, and disposing it would take the map's own rendering
   * down with it.
   */
  onRemove(): void {
    this.disposed = true;
    this.map?.off("moveend", this.handleMoveEnd);

    for (const { group } of this.placed.values()) {
      this.disposeGroup(group);
      this.scene.remove(group);
    }
    this.placed.clear();
    this.cache.clear();

    this.renderer = null;
    this.map = null;
  }

  render(_gl: WebGLRenderingContext, matrix: number[]): void {
    if (!this.renderer || !this.map || this.disposed) return;
    if (this.options.enabled === false) return;
    if (this.map.getZoom() < MIN_MODEL_ZOOM) return;

    // Mapbox supplies the frame's view-projection matrix; the camera is only ever
    // a carrier for it. Nothing here derives position from screen pixels.
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // Deliberately NO triggerRepaint() here: asking for another frame from inside render() is an idle loop that
    // never stops. Mapbox already repaints when the camera moves; a repaint is requested only when the set of
    // models or one of them changes (syncModels), which is when there is genuinely something new to draw.
  }

  /** Replaces the whole set of models. Called when the server sends new lock state, or an editor changes a placement. */
  async setModels(models: GuestPlaceModel[]): Promise<void> {
    this.models = models;
    if (this.map) await this.syncModels();
  }

  /** The models worth having loaded right now: zoomed in enough to see them, and within (padded) view. */
  private modelsToKeep(): GuestPlaceModel[] {
    const map = this.map;
    if (!map || this.options.enabled === false || map.getZoom() < MIN_MODEL_ZOOM) return [];

    const bounds = map.getBounds();
    if (!bounds) return this.models;
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const padLng = (east - west) * LOAD_PADDING;
    const padLat = (north - south) * LOAD_PADDING;

    return this.models.filter(
      (model) =>
        model.anchorLongitude >= west - padLng &&
        model.anchorLongitude <= east + padLng &&
        model.anchorLatitude >= south - padLat &&
        model.anchorLatitude <= north + padLat
    );
  }

  private async syncModels(): Promise<void> {
    const keep = this.modelsToKeep();
    const wanted = new Set(keep.map((model) => model.placeId));
    let changed = false;

    // Remove what is no longer wanted (out of range, zoomed out, or gone), freeing its GPU resources.
    for (const [placeId, placement] of this.placed) {
      if (!wanted.has(placeId)) {
        this.scene.remove(placement.group);
        this.disposeGroup(placement.group);
        this.placed.delete(placeId);
        changed = true;
      }
    }

    for (const model of keep) {
      const existing = this.placed.get(model.placeId);
      const structuralKey = structuralKeyOf(model);
      const transformKey = transformKeyOf(model);

      if (existing && existing.structuralKey === structuralKey) {
        // Same file and look. If only the placement changed, move it in place: no reload, no new GPU resources.
        if (existing.transformKey !== transformKey) {
          existing.group.matrix = matrixFor(model);
          existing.group.matrixWorldNeedsUpdate = true;
          existing.transformKey = transformKey;
          changed = true;
        }
        continue;
      }

      if (existing) {
        this.scene.remove(existing.group);
        this.disposeGroup(existing.group);
        this.placed.delete(model.placeId);
        changed = true;
      }

      try {
        const group = await this.buildPlacement(model);
        if (this.disposed) {
          this.disposeGroup(group);
          return;
        }

        this.scene.add(group);
        this.placed.set(model.placeId, { placeId: model.placeId, group, structuralKey, transformKey });
        changed = true;
      } catch {
        /*
         * A model that will not load must not take the map with it. The rest of the
         * day — route, stops, check-in — keeps working, and the Place simply has no
         * 3D object. Deliberately no console noise per failure: on a bad connection
         * that is every model, every pan.
         */
      }
    }

    // One repaint, and only because something changed.
    if (changed) this.map?.triggerRepaint();
  }

  private async buildPlacement(model: GuestPlaceModel): Promise<THREE.Group> {
    const source = await this.loadModel(model.fileUrl);
    const instance = source.clone(true);

    // Normalise to the height an admin asked for, then stand it on the ground.
    const bounds = new THREE.Box3().setFromObject(instance);
    const heightUnits = bounds.max.y - bounds.min.y;
    const normalisingScale = scaleToTargetHeight(heightUnits, model.targetHeightMeters);

    instance.scale.setScalar(normalisingScale);
    instance.position.y = groundingOffset(heightUnits, normalisingScale);

    if (!model.unlocked) this.applyLockedAppearance(instance);

    const group = new THREE.Group();
    group.add(instance);

    // World position comes from the geographic display anchor and transform alone.
    group.matrixAutoUpdate = false;
    group.matrix = matrixFor(model);

    // Picking resolves a hit mesh back to its LINKED Place through this, not by proximity.
    group.userData.placeId = model.placeId;
    instance.traverse((child) => {
      child.userData.placeId = model.placeId;
    });

    return group;
  }

  /** One download and one parse per URL, shared by every Place that uses it. */
  private loadModel(url: string): Promise<THREE.Group> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const loading = new Promise<THREE.Group>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (error) => reject(error)
      );
    });

    this.cache.set(url, loading);

    // A failed load must not be cached as a permanently broken entry.
    loading.catch(() => this.cache.delete(url));

    return loading;
  }

  /** Grey silhouette for something not yet earned. The server already decided this; the material only shows it. */
  private applyLockedAppearance(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = LOCKED_MATERIAL;
    });
  }

  /**
   * Picking by actual ray intersection.
   *
   * Nearest-marker guessing is the usual shortcut and it is wrong exactly when it
   * matters: two Places a few metres apart, or a tall model whose base is far from
   * where it appears on screen. A ray through the pointer resolves the mesh that
   * was really hit, and `userData.placeId` carries it back to the Place.
   */
  pick(point: { x: number; y: number }, canvas: { width: number; height: number }): string | null {
    if (this.placed.size === 0) return null;

    const pointer = new THREE.Vector2(
      (point.x / canvas.width) * 2 - 1,
      -(point.y / canvas.height) * 2 + 1
    );

    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);

    for (const hit of hits) {
      const placeId = findPlaceId(hit.object);
      if (placeId) {
        this.options.onSelect?.(placeId);
        return placeId;
      }
    }

    return null;
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.geometry?.dispose?.();

      // The shared locked material is reused by every locked model, so it is never
      // disposed here — doing so would blank every other locked model on the map.
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material && material !== LOCKED_MATERIAL) material.dispose?.();
      }
    });
  }
}

/** Walks up from a hit mesh to whichever ancestor carries the Place id. */
export function findPlaceId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object;

  while (current) {
    const placeId = current.userData?.placeId;
    if (typeof placeId === "string") return placeId;
    current = current.parent;
  }

  return null;
}

/** Mapbox's MercatorCoordinate type is only used for its altitude helper; re-exported for callers that need it. */
export type { MercatorCoordinate };
