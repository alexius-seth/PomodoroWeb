// sw.js - Minimal working service worker
const CACHE_NAME = 'diplomat-pomodoro-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=EB+Garamond:ital@0;1&display=swap'
];

// Install event - cache files
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - take control immediately
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Now ready to handle fetches');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  console.log('[SW] Fetching:', event.request.url);
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          console.log('[SW] Serving from cache:', event.request.url);
          return response;
        }
        
        // Not in cache - fetch from network
        console.log('[SW] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(networkResponse => {
            // Check if valid response
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            
            // Cache the new response
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch(error => {
            console.error('[SW] Fetch failed:', error);
            // Return offline fallback for HTML pages
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            return new Response('Offline - content not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});