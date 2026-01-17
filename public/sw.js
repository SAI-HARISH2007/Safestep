const CACHE_NAME = 'safestep-cache-v1';
const ASSETS = [
    '/',
    '/manifest.json',
    '/globe.svg',
    '/file.svg',
    '/window.svg',
    '/next.svg',
    '/vercel.svg',
    // Add other critical assets here
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        }).catch(() => {
            // Fallback or offline page logic can go here
            return caches.match('/');
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            );
        })
    );
});
