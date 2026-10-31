import { distanceMeters } from "@/lib/geo";

// Atlas's own public convention (matches Place.latitude/Place.longitude) —
// not the same shape as the map engine's internal {lng, lat}. Converting
// between the two happens once, at the AtlasMap React boundary.
export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type LocationStatus =
  | "idle"
  | "locating"
  | "active"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "error";

export interface LocationState {
  status: LocationStatus;
  coords: Coordinates | null;
  accuracy: number | null;
  timestamp: number | null;
  message?: string;
}

type Listener = (state: LocationState) => void;

/** Re-center the location dot only after it moved this far — avoids GPS-jitter redraws. */
const MOVEMENT_THRESHOLD_M = 12;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 30000,
};

const FIRST_FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

function statusFromError(error: GeolocationPositionError): LocationStatus {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "denied";
    case error.POSITION_UNAVAILABLE:
      return "unavailable";
    case error.TIMEOUT:
      return "timeout";
    default:
      return "error";
  }
}

function toCoordinates(position: GeolocationPosition): Coordinates {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/**
 * The only place in Atlas responsible for browser geolocation — components
 * must go through this, never call `navigator.geolocation` directly. Keeps a
 * low-power `watchPosition()` running (justified here: the map's user-location
 * dot needs to track real movement, not just a single snapshot), with jitter
 * suppression so small GPS noise doesn't trigger redraws or re-renders.
 */
class LocationService {
  private state: LocationState = {
    status: "idle",
    coords: null,
    accuracy: null,
    timestamp: null,
  };

  private listeners = new Set<Listener>();
  private watchId: number | null = null;

  getState(): LocationState {
    return this.state;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(partial: LocationState): void {
    this.state = partial;
    for (const listener of this.listeners) listener(this.state);
  }

  /** Call once per mounted map. Gets a first fix, then keeps a low-power watch running. Idempotent — a second call while already watching is a no-op. */
  start(): void {
    if (this.watchId !== null) return;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.setState({ status: "unsupported", coords: null, accuracy: null, timestamp: null });
      return;
    }

    this.setState({ status: "locating", coords: null, accuracy: null, timestamp: null });

    navigator.geolocation.getCurrentPosition(
      (position) => this.handlePosition(position),
      (error) =>
        this.setState({
          status: statusFromError(error),
          coords: null,
          accuracy: null,
          timestamp: null,
          message: error.message,
        }),
      FIRST_FIX_OPTIONS
    );

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePosition(position),
      (error) => {
        // A transient watch error shouldn't erase a location we already have.
        if (!this.state.coords) {
          this.setState({
            status: statusFromError(error),
            coords: null,
            accuracy: null,
            timestamp: null,
            message: error.message,
          });
        }
      },
      WATCH_OPTIONS
    );
  }

  /** Explicit re-request, for a "locate me" button — works even if the passive watch never got a fix (e.g. permission was granted after an initial denial). */
  requestOnce(): void {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.setState({ status: "unsupported", coords: null, accuracy: null, timestamp: null });
      return;
    }

    this.setState({
      status: "locating",
      coords: this.state.coords,
      accuracy: this.state.accuracy,
      timestamp: this.state.timestamp,
    });

    navigator.geolocation.getCurrentPosition(
      (position) => this.handlePosition(position, true),
      (error) =>
        this.setState({
          status: statusFromError(error),
          coords: null,
          accuracy: null,
          timestamp: null,
          message: error.message,
        }),
      FIRST_FIX_OPTIONS
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private handlePosition(position: GeolocationPosition, force = false): void {
    const next = toCoordinates(position);
    const previous = this.state.coords;
    const movedEnough =
      !previous ||
      distanceMeters({ lat: previous.latitude, lng: previous.longitude }, { lat: next.latitude, lng: next.longitude }) >=
        MOVEMENT_THRESHOLD_M;

    if (!force && !movedEnough && this.state.status === "active") {
      return; // GPS jitter — not worth a re-render
    }

    this.setState({
      status: "active",
      coords: next,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    });
  }
}

export const locationService = new LocationService();

/**
 * A one-shot fix WITH the evidence the server needs to judge it: the accuracy
 * radius the device reports, and the moment it took the reading.
 *
 * Both come straight from the Geolocation API and are passed through unchanged.
 * They are the device's own account of itself, not a guarantee — the server
 * treats them as claims and applies its own limits
 * (services/advisor/gps-evidence.ts).
 */
export type PositionEvidence = Coordinates & {
  accuracyMeters: number;
  capturedAtMs: number;
};

/** One-shot position request for callers that don't want a live subscription. Independent of start()/the watch. */
export function getCurrentPosition(options: { fresh?: boolean } = {}): Promise<PositionEvidence> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ...toCoordinates(position),
          accuracyMeters: position.coords.accuracy,
          capturedAtMs: position.timestamp,
        }),
      (error) => reject(new Error(error.message)),
      // `fresh`: a check-in must use where the guest is NOW, not a reading cached from before they walked closer.
      options.fresh ? { ...FIRST_FIX_OPTIONS, maximumAge: 0 } : FIRST_FIX_OPTIONS
    );
  });
}
