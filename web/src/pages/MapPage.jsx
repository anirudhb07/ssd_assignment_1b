import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

// Workflow 3. Owner: Member D.
export function MapPage() {
  return (
    <>
      <PageHeader title="Map" description="Drivers within 5 km of a restaurant." />
      <ScreenPlaceholder
        owner="Member D"
        todo={[
          'react-leaflet map with OpenStreetMap tiles. Import "leaflet/dist/leaflet.css" in this file.',
          'Origin = the chosen restaurant (lat/lng), or a click on the map.',
          'Draw a 5 km Circle around the origin and a marker per driver.',
          'Side list of drivers sorted by distance (formatDistance).',
          'Poll every 5 s: useQuery({ ..., refetchInterval: 5000 }) — no page reload.',
        ]}
        endpoints={['getNearbyDrivers', 'listRestaurants']}
      />
    </>
  );
}
