// Szybki start i offline.
// - Pliki aplikacji (strona, skrypty, style, kroje, ikony, dźwięki): od razu z pamięci, a w tle pobieramy nowsze
//   (stale-while-revalidate) — zmiana w kodzie pokazuje się przy następnym otwarciu. Nowy CACHE pobiera całość od nowa.
// - Lekcje (zestawy/*.json): najpierw z sieci, żeby nowe pytania były od razu, ale najwyżej 1,5 s czekania — potem z pamięci.
// - Pełne nagrania idą z ogarnijmaterial.pl (inna domena — SW ich nie dotyka); na telefonie trzyma je osobna pamięć
//   „przyroda-nagrania” (js/store.js), której ten plik nie czyści.
const CACHE = 'przyroda-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/dom.js', 'js/gra.js', 'js/sprawdz.js',
  'js/store.js', 'js/dzwieki.js', 'js/przedmiot.js', 'zestawy/indeks.json', 'zestawy/spis.json', 'ikony/ikona-192.png', 'fonts/Jost.ttf', 'fonts/LibreBaskerville.ttf',
  'audio/przycisk.mp3', 'audio/wybor.mp3', 'audio/cofnij.mp3',
  'audio/dobra-odpowiedz-podstawowa.mp3', 'audio/zla-odpowiedz.mp3'];
const ZACHOWAJ = [CACHE, 'przyroda-nagrania'];
const CZEKAJ_NA_LEKCJE_MS = 1500;

self.addEventListener('install', (e) => {
  // cache: 'reload' — z serwera, nie z pamięci HTTP przeglądarki (inaczej nowy CACHE mógłby dostać stare pliki)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => !ZACHOWAJ.includes(x)).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});

function zSieci(req) {
  return fetch(req.url, { cache: 'no-cache' }).then((res) => {
    if (res.ok && res.type === 'basic') { const kopia = res.clone(); caches.open(CACHE).then((c) => c.put(req, kopia)); }
    return res;
  });
}
const zPamieci = (req) => caches.match(req, { ignoreSearch: true });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ogarnijmaterial.pl/api (dane i strumień nagrań) — bez SW

  // lekcje: sieć z limitem czasu, potem pamięć (sieć i tak się dokończy i odświeży pamięć)
  if (url.pathname.includes('/zestawy/')) {
    const siec = zSieci(req);
    e.waitUntil(siec.catch(() => {}));
    e.respondWith(new Promise((ok) => {
      let gotowe = false;
      const oddaj = (r) => { if (!gotowe && r) { gotowe = true; ok(r); } };
      siec.then(oddaj).catch(() => zPamieci(req).then((r) => oddaj(r || Response.error())));
      setTimeout(() => zPamieci(req).then(oddaj), CZEKAJ_NA_LEKCJE_MS);
    }));
    return;
  }

  // pliki aplikacji: od razu z pamięci, odświeżenie w tle
  const swieze = zSieci(req);
  e.waitUntil(swieze.catch(() => {}));
  e.respondWith(zPamieci(req).then((r) => r || swieze.catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
