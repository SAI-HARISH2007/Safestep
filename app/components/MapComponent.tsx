import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix for default marker icons not showing in Next.js
const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Convert OSRM duration to minutes
const convertDurationToMinutes = (duration: number) => Math.round(duration / 60);

// Helper to control map view (Center vs Route)
function MapController({ center, routePath }: { center: [number, number], routePath?: [number, number][] | null }) {
    const map = useMap();

    useEffect(() => {
        if (!map) return; // Guard against undefined map
        
        if (routePath && routePath.length > 0) {
            // If route exists, fit bounds to show full path
            const bounds = L.latLngBounds(routePath);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            // If no route, just fly to the center (User Location or Search Result)
            map.flyTo(center, 15, { duration: 1.5 });
        }
    }, [center, routePath, map]);

    return null;
}

export default function MapComponent({
    center,
    userLocation,
    destinationLocation,
    routePath
}: {
    center: [number, number],
    userLocation?: [number, number],
    destinationLocation?: [number, number],
    routePath?: [number, number][] | null
}) {

    return (
        <MapContainer
            key="safestep-map" // Prevent "Map container is being reused" error
            center={center}
            zoom={13}
            className="h-full w-full z-0 block"
        >
            <MapController center={center} routePath={routePath} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Route Line from OSRM */}
            {routePath && <Polyline positions={routePath as L.LatLngExpression[]} color="#00ff9f" weight={5} opacity={0.8} dashArray="1, 10" />}

            {/* User Location Marker */}
            {userLocation && <Marker position={userLocation} icon={icon} />}

            {/* Destination Marker */}
            {destinationLocation && <Marker position={destinationLocation} icon={icon} />}

            {/* Fallback Marker */}
            {!userLocation && !destinationLocation && <Marker position={center} icon={icon} />}
        </MapContainer>
    );
}
