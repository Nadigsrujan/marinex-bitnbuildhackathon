import type { Coordinate, DebrisCluster } from "./types";

export function vesselLabel(name: string | undefined, identifier: string): string {
  const value = name?.trim();
  if (!value || /^[\d\s]+$/.test(value) || value === "Unknown Vessel") {
    return `Vessel MMSI ${identifier.replace("MMSI-", "")}`;
  }
  if (value.startsWith("MMSI-")) {
    return `Vessel MMSI ${value.replace("MMSI-", "")}`;
  }
  return value;
}


// Ensemble members describe uncertain modeled transport, not separate observations.
// Deterministic offsets ensure scrubbing backwards returns the same positions.
export function debrisPosition(cluster: DebrisCluster, member: number, hours: number): Coordinate {
  const seed = cluster.source_points[member % Math.max(cluster.source_points.length, 1)] ?? cluster.centroid;
  const angle = member * 2.399963;
  const initialSpread = .003 * Math.sqrt(member + 1);
  const u = cluster.drift_vector?.current_u_ms ?? 0;
  const v = cluster.drift_vector?.current_v_ms ?? 0;
  const factor = cluster.drift_vector?.drift_factor ?? 1;
  const t = Math.max(0, Math.min(12, hours));
  const spread = initialSpread + .0015 * t;
  return [seed[0] + u * factor * t * 3600 / (111320 * Math.cos(seed[1] * Math.PI / 180)) + Math.cos(angle) * spread,
    seed[1] + v * factor * t * 3600 / 111320 + Math.sin(angle) * spread];
}
