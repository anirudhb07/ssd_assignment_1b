import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';

// A small map of one place, with its coordinates underneath. The database
// stores latitude and longitude only (no address), so this is the readable
// way to show where something is (issue #59). Scroll-zoom is off so the page
// still scrolls past it; drag and the +/- buttons work.
export function LocationMap({ latitude, longitude, label, zoom = 15 }) {
  const center = [latitude, longitude];

  return (
    <figure className="stack" style={{ margin: 0, gap: 'var(--space-2)' }}>
      <div style={{ height: 220, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker
            center={center}
            radius={9}
            pathOptions={{ color: 'var(--color-primary, #1f6f5c)', fillColor: 'var(--color-primary, #1f6f5c)', fillOpacity: 0.85, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{label}</Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>
      <figcaption className="small muted">{latitude.toFixed(4)}, {longitude.toFixed(4)}</figcaption>
    </figure>
  );
}
