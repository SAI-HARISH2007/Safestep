export interface RouteData {
    coordinates: [number, number][];
    duration: number; // in seconds
    distance: number; // in meters
}

// Helper to calculate distance (Haversine) for fallback
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}

export async function getRoute(start: [number, number], end: [number, number], profile: 'walking' | 'driving' | 'cycling' = 'walking'): Promise<RouteData | null> {
    try {
        // OSRM expects {lon},{lat}
        const startStr = `${start[1]},${start[0]}`;
        const endStr = `${end[1]},${end[0]}`;

        // Specific URL endpoints for Multi-Modal Routing
        let baseUrl = "https://router.project-osrm.org/route/v1";
        let osrmProfile = "foot"; // Default

        if (profile === 'walking') {
            baseUrl = "https://router.project-osrm.org/route/v1";
            osrmProfile = "foot";
        } else if (profile === 'cycling') {
            // specialized bike server (uses 'driving' profile internally)
            baseUrl = "https://routing.openstreetmap.de/routed-bike/route/v1";
            osrmProfile = "driving";
        } else if (profile === 'driving') {
            // specialized car server
            baseUrl = "https://routing.openstreetmap.de/routed-car/route/v1";
            osrmProfile = "driving";
        }

        const url = `${baseUrl}/${osrmProfile}/${startStr};${endStr}?overview=full&geometries=geojson`;

        // Console log for debugging distinctive calls
        console.log(`Fetching Route (${profile}):`, url);

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
            return {
                coordinates,
                duration: route.duration, // Actual OSRM duration in seconds
                distance: route.distance // meters
            };
        }
        throw new Error("No route found");
    } catch (error) {
        console.warn(`OSRM Routing Error (${profile}). Using fallback calculation.`, error);

        // Fallback: Calculate straight-line distance and estimate time
        const distKm = getDistanceFromLatLonInKm(start[0], start[1], end[0], end[1]);
        const speeds = { walking: 5, cycling: 15, driving: 30 }; // km/h
        const speed = speeds[profile] || 5;
        const durationSeconds = (distKm / speed) * 3600;

        return {
            coordinates: [start, end], // Straight line
            duration: durationSeconds,
            distance: distKm * 1000
        };
    }
}
