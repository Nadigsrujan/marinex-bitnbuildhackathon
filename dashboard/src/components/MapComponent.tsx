'use client';

import { CircleMarker, MapContainer, Polygon, Polyline, Popup } from 'react-leaflet';
import type { DashboardState, VesselGeometry } from '@/lib/types';

interface MapProps {
  state: DashboardState;
}

function toLeafletPosition([lon, lat]: [number, number]): [number, number] {
  return [lat, lon];
}

function vesselPosition(geometry: VesselGeometry): [number, number] | null {
  if (geometry.type === 'Point') return toLeafletPosition(geometry.coordinates);
  const firstCoordinate = geometry.coordinates[0]?.[0];
  return firstCoordinate ? toLeafletPosition(firstCoordinate) : null;
}

export default function MapComponent({ state }: MapProps) {
  const routeResult = state.navigator.route_result;
  const cleanupPlan = state.cleaner.cleanup_plan;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[-0.5, -90.5]} zoom={6} scrollWheelZoom style={{ height: '100%', width: '100%', zIndex: 0 }}>
        {state.sentinel.risk_zones.map((zone, index) => (
          <Polygon
            key={`risk-zone-${index}`}
            positions={zone.coordinates[0].map(toLeafletPosition)}
            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2, className: 'glow-zone-red' }}
          />
        ))}

        {state.sentinel.cases.map((vessel) => {
          const position = vesselPosition(vessel.geometry);
          return position ? (
            <CircleMarker
              key={vessel.vessel_id}
              center={position}
              radius={7}
              pathOptions={{ color: '#f87171', fillColor: '#ef4444', fillOpacity: 0.9 }}
            >
              <Popup>
                <strong>{vessel.name}</strong><br />
                Risk: {vessel.risk_level} ({vessel.risk_score}/100)
              </Popup>
            </CircleMarker>
          ) : null;
        })}

        {routeResult && (
          <>
            <Polyline
              positions={routeResult.baseline_polyline.map(toLeafletPosition)}
              pathOptions={{ color: '#94a3b8', weight: 3, dashArray: '5, 10' }}
            />
            <Polyline
              positions={routeResult.optimized_polyline.map(toLeafletPosition)}
              pathOptions={{ color: '#3b82f6', weight: 4, className: 'glow-route-blue animated-path' }}
            />
          </>
        )}

        {state.cleaner.clusters.map((cluster) => (
          <CircleMarker
            key={cluster.cluster_id}
            center={toLeafletPosition(cluster.centroid)}
            radius={Math.max(5, Math.min(20, cluster.estimated_mass_kg / 20))}
            pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.6 }}
          >
            <Popup>
              <strong>Debris Cluster</strong><br />
              Mass: {cluster.estimated_mass_kg} kg<br />
              Urgency: {cluster.urgency}
            </Popup>
          </CircleMarker>
        ))}

        {cleanupPlan?.route_sequences.map((sequence, index) => (
          <Polyline
            key={`usv-route-${index}`}
            positions={sequence.map(toLeafletPosition)}
            pathOptions={{ color: '#10b981', weight: 2, className: 'glow-route-green animated-path' }}
          />
        ))}

        {cleanupPlan?.route_sequences.map((sequence, index) => sequence[0] && (
          <CircleMarker
            key={`usv-${index}`}
            center={toLeafletPosition(sequence[0])}
            radius={6}
            pathOptions={{ color: '#6ee7b7', fillColor: '#10b981', fillOpacity: 1 }}
          >
            <Popup><strong>USV {index + 1}</strong><br />Mission base</Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="map-legend">
        <strong>Map Legend</strong>
        <span><i className="legend-box risk" />Risk Zone (SENTINEL)</span>
        <span><i className="legend-line baseline" />Baseline Route</span>
        <span><i className="legend-line optimized" />Optimized Route (NAVIGATOR)</span>
        <span><i className="legend-dot debris" />Debris Cluster</span>
        <span><i className="legend-dot usv" />USV / Cleanup Route</span>
      </div>
    </div>
  );
}
