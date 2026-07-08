// Core data model (DESIGN.md §5). Pure types — safe to import anywhere.

export type StopSource = 'map' | 'search' | 'coords' | 'clipboard' | 'gps' | 'import';

export interface Stop {
  id: string;
  lat: number;
  lon: number;
  name: string; // "" allowed in-app; defaulted at export
  note: string; // maps to <desc>
  source: StopSource;
  createdAt: number;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  /** Array order IS the route order — never add a parallel index field. */
  stops: Stop[];
  /** Export closes the route back to the first stop. */
  loop: boolean;
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
}

export interface LatLon {
  lat: number;
  lon: number;
}
