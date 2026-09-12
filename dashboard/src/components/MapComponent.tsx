'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet's default icon path issues with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapProps {
  state: any;
}

export default function MapComponent({ state }: MapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="map-container flex items-center justify-center">Loading map...</div>;

  const sentinel = state?.sentinel || {};
  const navigator = state?.navigator?.route_result || {};
  const cleaner = state?.cleaner || {};

  // Center on the hero corridor (Galapagos region)
  const center: [number, number] = [-0.5, -90.5]; 
  const zoom = 6;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark-tiles"
        />
        
        {/* 1. SENTINEL: Vessel Case & Risk Zones */}
        {sentinel.risk_zones?.map((zone: any, i: number) => {
          if (zone.type === 'Polygon') {
            // GeoJSON is [lon, lat], Leaflet is [lat, lon]
            const positions = zone.coordinates[0].map((coord: [number, number]) => [coord[1], coord[0]]);
            return <Polygon key={`rz-${i}`} positions={positions} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2, className: 'glow-zone-red' }} />;
          }
          return null;
        })}

        {sentinel.cases?.map((vcase: any) => {
          if (vcase.geometry?.type === 'Point' || vcase.geometry?.type === 'Polygon') {
            let lat, lon;
            if (vcase.geometry.type === 'Point') {
               lon = vcase.geometry.coordinates[0];
               lat = vcase.geometry.coordinates[1];
            } else {
               lon = vcase.geometry.coordinates[0][0][0];
               lat = vcase.geometry.coordinates[0][0][1];
            }
            return (
              <Marker key={vcase.vessel_id} position={[lat, lon]}>
                <Popup>
                  <strong>{vcase.name}</strong><br/>
                  Risk: {vcase.risk_level} ({vcase.risk_score}/100)
                </Popup>
              </Marker>
            );
          }
          return null;
        })}

        {/* 2. NAVIGATOR: Routes */}
        {navigator.baseline_polyline && (
          <Polyline 
            positions={navigator.baseline_polyline.map((p: [number, number]) => [p[1], p[0]])} 
            pathOptions={{ color: '#94a3b8', weight: 3, dashArray: '5, 10' }} 
          />
        )}
        {navigator.optimized_polyline && (
          <Polyline 
            positions={navigator.optimized_polyline.map((p: [number, number]) => [p[1], p[0]])} 
            pathOptions={{ color: '#3b82f6', weight: 4, className: 'glow-route-blue animated-path' }} 
          />
        )}

        {/* 3. CLEANER: Debris Clusters & USV assignments */}
        {cleaner.clusters?.map((cluster: any) => (
          <CircleMarker 
            key={cluster.cluster_id} 
            center={[cluster.centroid[1], cluster.centroid[0]]} 
            radius={Math.max(5, Math.min(20, cluster.estimated_mass_kg / 20))}
            pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.6 }}
          >
            <Popup>
              <strong>Debris Cluster</strong><br/>
              Mass: {cluster.estimated_mass_kg} kg<br/>
              Urgency: {cluster.urgency}
            </Popup>
          </CircleMarker>
        ))}

        {cleaner.cleanup_plan?.route_sequences?.map((seq: any[], i: number) => (
          <Polyline 
            key={`usv-route-${i}`}
            positions={seq.map(p => [p[1], p[0]])} 
            pathOptions={{ color: '#10b981', weight: 2, className: 'glow-route-green animated-path' }} 
          />
        ))}
        
      </MapContainer>

      {/* Map Legend */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        backgroundColor: 'rgba(20, 26, 40, 0.85)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '10px 14px',
        zIndex: 1000,
        color: '#e2e8f0',
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ fontWeight: 600, marginBottom: '2px', color: '#fff' }}>Map Legend</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: 'rgba(239, 68, 68, 0.3)', border: '1px solid #ef4444' }}></div>
          <span>Risk Zone (SENTINEL)</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '3px', backgroundColor: '#94a3b8', borderTop: '2px dashed #94a3b8' }}></div>
          <span>Baseline Route</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '3px', backgroundColor: '#3b82f6' }}></div>
          <span>Optimized Route (NAVIGATOR)</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.6)', border: '1px solid #f59e0b' }}></div>
          <span>Debris Cluster</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '3px', borderTop: '2px dashed #10b981' }}></div>
          <span>USV Cleanup Route (CLEANER)</span>
        </div>
      </div>
    </div>
  );
}
