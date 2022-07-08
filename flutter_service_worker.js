'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';
const RESOURCES = {
  "version.json": "96d01517297f39743ade6090c6d43266",
"icons/authpass-launcher-512.png": "b9ba6d8d7c5a550b37ed6937d5bea4de",
"icons/authpass-launcher-192.png": "66bc9dfe1b283d730ec395348dc97d31",
"favicon.ico": "5e9ecce5608cfbeda2db0b5e8be7fa7d",
"assets/AssetManifest.json": "e22e879599f45d4f2aaee5d2cadd4272",
"assets/fonts/MaterialIcons-Regular.otf": "95db9098c58fd6db106f1116bae85a0b",
"assets/packages/wakelock_web/assets/no_sleep.js": "7748a45cd593f33280669b29c2c8919a",
"assets/packages/font_awesome_flutter/lib/fonts/fa-brands-400.ttf": "d1722d5cf2c7855862f68edb85e31f88",
"assets/packages/font_awesome_flutter/lib/fonts/fa-solid-900.ttf": "dd3c4233029270506ecc994d67785a37",
"assets/packages/font_awesome_flutter/lib/fonts/fa-regular-400.ttf": "613e4cc1af0eb5148b8ce409ad35446d",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "6d342eb68f170c97609e9da345464e5e",
"assets/assets/images/safe-filled.webp": "164f125783ea068b36bdeb70f7e3a1cd",
"assets/assets/images/onboarding-header.webp": "7d66953934b52bf1dca2c49c5a0b64cf",
"assets/assets/images/safe-filled-v2.webp": "b363d92ca6a9fb930a1b0085918dfe6b",
"assets/assets/images/authpass-logo-fit-512w.webp": "1be2a6113e3710ecc981f1f083004da0",
"assets/assets/images/safe-empty.webp": "634514bcdcf32f8867539bc360861947",
"assets/assets/images/safe-empty-v2.webp": "f6b70e9bf07eb46f169d5f7573fd263d",
"assets/assets/images/logo_icon.png": "35479aa0e7346455edd778b808b77493",
"assets/assets/images/logo_with_text.png": "5eebe4e497f49e52a2e232701b4700af",
"assets/assets/fonts/AuthPassIcons.ttf": "ee991331d8bbef688c813c617faba097",
"assets/assets/fonts/Inter-Medium.otf": "8c46da0df447785681cc1dc57c1a9da9",
"assets/assets/fonts/Inter-Light.otf": "a3a9cc1541c9da02424062b5855a60ec",
"assets/assets/fonts/Inter-Bold.otf": "753bd86618b0faefb54da21403a261bb",
"assets/assets/fonts/jetbrains/JetBrainsMono-Regular.ttf": "e1caef645de334fee2f25834b0d03c28",
"assets/assets/fonts/jetbrains/JetBrainsMono-Bold.ttf": "d8af470e44be6c1d2d07dee84db355f6",
"assets/assets/fonts/Inter-Regular.otf": "9a9eeddb3eb9ce4f64e378a8a7b9c042",
"assets/NOTICES": "c25d48d9f3fdb1b14e08bef76bc5d2a1",
"assets/FontManifest.json": "99d8ea2f0fa233677aa50559f5efa9a0",
"js/README.md": "20e28da2a4aaa5b4956d794075e1d6a6",
"js/argon2-bundled.min.js": "6c006c4658c1954a2e78b68130f97ea7",
"index.html": "7c5986952ab564aa73d5ab535cd6108d",
"/": "7c5986952ab564aa73d5ab535cd6108d",
"manifest.json": "a55e3e721de6d5444c9dc74af6ebb2c1",
"favicon.png": "0f6bc457452337dff399ad2f7da1786a",
"flutter.js": "0816e65a103ba8ba51b174eeeeb2cb67",
"main.dart.js": "39b562aad203cced06021a44cf3da1a4",
"canvaskit/profiling/canvaskit.wasm": "95e736ab31147d1b2c7b25f11d4c32cd",
"canvaskit/profiling/canvaskit.js": "ae2949af4efc61d28a4a80fffa1db900",
"canvaskit/canvaskit.wasm": "4b83d89d9fecbea8ca46f2f760c5a9ba",
"canvaskit/canvaskit.js": "c2b4e5f3d7a3d82aed024e7249a78487"
};

// The application shell files that are downloaded before a service worker can
// start.
const CORE = [
  "main.dart.js",
"index.html",
"assets/NOTICES",
"assets/AssetManifest.json",
"assets/FontManifest.json"];
// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});

// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});

// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache.
        return response || fetch(event.request).then((response) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
    })
  );
});

self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});

// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}

// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
