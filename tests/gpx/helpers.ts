import type { Route, Stop, StopSource } from '../../src/lib/types';

let counter = 0;

export function makeStop(partial: Partial<Stop> & { lat: number; lon: number }): Stop {
  counter += 1;
  return {
    id: `stop-${counter}`,
    name: '',
    note: '',
    source: 'coords' as StopSource,
    createdAt: 1700000000000,
    ...partial
  };
}

export function makeRoute(partial: Partial<Route> = {}): Route {
  counter += 1;
  return {
    id: `route-${counter}`,
    name: 'Test route',
    description: '',
    stops: [],
    loop: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    schemaVersion: 1,
    ...partial
  };
}

export const MELBOURNE_STOPS = [
  makeStop({ lat: -37.81534, lon: 144.966249, name: 'Flinders Street Station' }),
  makeStop({ lat: -37.817979, lon: 144.96828, name: 'Federation Square', note: 'Meet at the big screen' }),
  makeStop({ lat: -37.821227, lon: 144.968119, name: 'Boyd Park' }),
  makeStop({ lat: -37.818078, lon: 144.952695, name: 'Sea Life Melbourne' })
];
