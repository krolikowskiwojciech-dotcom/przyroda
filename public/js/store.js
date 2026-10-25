// Stan w przeglądarce i synchronizacja prób przez ogarnijmaterial.pl (bez GitHuba i bez żadnych tokenów).
// Osoba loguje się PIN-em na https://ogarnijmaterial.pl (ciasteczko sesji na całą domenę), a aplikacja rozmawia
// z pośrednikiem https://ogarnijmaterial.pl/api/gh/… — w kształcie API GitHuba, ale dane leżą w Cloudflare KV
// (klucze plik:<przedmiot>-dane/<ścieżka>). Profil = profile/<id>.json = { id, proby: [...], u }. Próby się tylko dopisują,
// więc scalanie dwóch kopii to suma bez powtórzeń (po id próby).
// Na 127.0.0.1/localhost tryb da się udawać parametrem ?test-ogarnij=aniela|julian|401 (bez sieci, do renderów).

import { PRZEDMIOT } from './przedmiot.js';

const K = PRZEDMIOT.klucz + '.';
export const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* tryb prywatny */ } },
};

export const REPO_DANYCH = `krolikowskiwojciech-dotcom/${PRZEDMIOT.id}-dane`;
export const STRONA_GLOWNA = 'https://ogarnijmaterial.pl/';
export const ZMIEN_OSOBE = 'https://ogarnijmaterial.pl/#konta';
const LOKALNIE = ['127.0.0.1', 'localhost'].includes(location.hostname);
const TEST = LOKALNIE ? new URLSearchParams(location.search).get('test-ogarnij') : null; // tylko do renderów na 127.0.0.1
const API = 'https://ogarnijmaterial.pl/api/gh';
export const OSOBY = { julian: 'Julek', aniela: 'Aniela', wojtek: 'Wojtek', magda: 'Magda' };
export const PROFIL = PRZEDMIOT.profil;

// kto jest zalogowany na ogarnijmaterial.pl: { stan: 'ok', id } | { stan: 'brak' } (401) | { stan: 'offline', id? }
export async function kto() {
  if (TEST) return TEST === '401' ? { stan: 'brak' } : { stan: 'ok', id: TEST };
  try {
    const r = await fetch('https://ogarnijmaterial.pl/api/ja', { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) { LS.del(K + 'ja'); return { stan: 'brak' }; }
    if (!r.ok) throw new Error('błąd ' + r.status);
    const { id } = await r.json();
    LS.set(K + 'ja', id);
    return { stan: 'ok', id };
  } catch {
    return { stan: 'offline', id: LS.get(K + 'ja') }; // bez sieci: ostatnia znana osoba
  }
}

export const dzwiek = () => LS.get(K + 'dzwiek', true);
export const ustawDzwiek = (v) => LS.set(K + 'dzwiek', v);
// czy wolno rozmawiać z danymi: wystarcza zalogowanie (sprawdzone przy starcie); w trybie testowym — nie
export const maDostep = () => !TEST;

export const proby = (id) => LS.get(K + 'proby.' + id, []);
const zapiszProby = (id, lista) => LS.set(K + 'proby.' + id, lista.slice(-500));
export function dodajProbe(id, proba) { zapiszProby(id, [...proby(id), proba]); }

// ostatnia próba danego zestawu (całego, nie pojedynczego bloku)
export function wynikiZestawu(id, zestaw) {
  const lista = proby(id).filter((p) => p.zestaw === zestaw && !p.tylkoBlok);
  return { ostatnia: lista[lista.length - 1] || null, ile: lista.length };
}

// ostatni wynik każdego bloku z dowolnej próby (cała lekcja albo sam blok; bez powtórek pomyłek): Map id bloku → { dobrze, ile }
export function wynikiBlokow(id, zestaw) {
  const m = new Map();
  for (const p of proby(id)) if (p.zestaw === zestaw && !p.powtorka) for (const b of p.bloki || []) m.set(b.id, b);
  return m;
}

function scal(a = [], b = []) {
  const m = new Map();
  for (const p of [...a, ...b]) m.set(p.id, p);
  return [...m.values()].sort((x, y) => x.d - y.d);
}

const enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function gh(path, opts = {}) {
  if (TEST) throw new Error('Tryb testowy: bez połączenia z danymi.');
  const r = await fetch(API + path, { cache: 'no-store', credentials: 'include', ...opts, headers: { Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
  if (r.status === 401) throw new Error('Nikt nie jest zalogowany na ogarnijmaterial.pl. Wejdź tam i wybierz osobę.');
  return r;
}
const sciezkaPliku = (sciezka) => `/repos/${REPO_DANYCH}/contents/${sciezka.split('/').map(encodeURIComponent).join('/')}`;

// pobiera plik profilu, scala z lokalnymi próbami i odsyła, jeśli coś doszło
export async function synchronizuj(id) {
  if (!maDostep() || !id) return { stan: 'wylaczona' };
  const plik = sciezkaPliku(`profile/${id}.json`);
  for (let proba = 0; proba < 3; proba++) {
    const r = await gh(plik);
    if (!r.ok && r.status !== 404) throw new Error(r.status === 403 ? `Serwer ogarnijmaterial.pl nie przyjmuje jeszcze danych przedmiotu ${PRZEDMIOT.nazwa}.` : `Serwer: błąd ${r.status}`);
    const j = r.ok ? await r.json() : null;
    const zdalne = j ? JSON.parse(dec(j.content || '') || 'null') : null;
    const razem = scal(zdalne?.proby, proby(id));
    zapiszProby(id, razem);
    if (zdalne && zdalne.proby.length === razem.length) return { stan: 'ok' };
    const body = { message: `${PRZEDMIOT.nazwa}: wyniki ${id}`, content: enc(JSON.stringify({ id, proby: razem, u: Date.now() }) + '\n') };
    if (j?.sha) body.sha = j.sha;
    const w = await gh(plik, { method: 'PUT', body: JSON.stringify(body) });
    if (w.status === 409 || w.status === 422) continue;
    if (!w.ok) throw new Error(`Serwer: błąd ${w.status} przy zapisie`);
    return { stan: 'ok' };
  }
  throw new Error('Nie udało się zapisać wyników (konflikt). Spróbuj za chwilę.');
}

// pełne nagrania (blisko tekstu podręcznika) leżą tylko na serwerze — pobieramy je przez pośrednika
// i trzymamy w pamięci podręcznej telefonu, żeby drugi raz grały bez sieci
const CACHE_NAGRAN = `${PRZEDMIOT.id}-nagrania`;
// klucz zawiera wersję pliku: po ponownym nagraniu telefon pobiera nowy plik, a stary usuwa
const kluczNagrania = (sciezka, wersja) => `https://prywatne.${PRZEDMIOT.id}/${sciezka}${wersja ? '?v=' + wersja : ''}`;
// jedno pobieranie na plik naraz; postęp idzie zdarzeniem „przedmiot-postep” { klucz, ile: 0–1, mb }
const wTrakcie = new Map();
export const kluczPostepu = kluczNagrania;
export function nagraniePrywatne(sciezka, wersja) {
  const klucz = kluczNagrania(sciezka, wersja);
  if (!wTrakcie.has(klucz)) {
    const p = pobierzNagranie(sciezka, wersja, klucz).finally(() => wTrakcie.delete(klucz));
    wTrakcie.set(klucz, p);
  }
  return wTrakcie.get(klucz);
}
async function pobierzNagranie(sciezka, wersja, klucz) {
  try {
    const c = await caches.open(CACHE_NAGRAN);
    const jest = await c.match(klucz);
    if (jest) return jest.blob();
    for (const r of await c.keys()) if (r.url.split('?')[0] === klucz.split('?')[0]) await c.delete(r); // starsze wersje
  } catch { /* brak Cache Storage */ }
  if (!maDostep()) throw new Error('Pełne nagranie jest prywatne — potrzebne zalogowanie na ogarnijmaterial.pl.');
  const r = await gh(sciezkaPliku(sciezka) + '?raw=1', { headers: { Accept: 'application/vnd.github.raw' } });
  if (r.status === 404 || r.status === 403) throw new Error('Nie widzę tego nagrania na serwerze.');
  if (!r.ok) throw new Error(`Serwer: błąd ${r.status} przy pobieraniu nagrania`);
  const razem = Number(r.headers.get('content-length')) || 0;
  const kawalki = [];
  let mam = 0;
  const czytnik = r.body?.getReader?.();
  if (czytnik) {
    for (;;) {
      const { done, value } = await czytnik.read();
      if (done) break;
      kawalki.push(value); mam += value.length;
      window.dispatchEvent(new CustomEvent('przedmiot-postep', { detail: { klucz, ile: razem ? Math.min(1, mam / razem) : null, mb: mam / 1048576 } }));
    }
  } else kawalki.push(new Uint8Array(await r.arrayBuffer()));
  const blob = new Blob(kawalki, { type: 'audio/mpeg' });
  try { await (await caches.open(CACHE_NAGRAN)).put(klucz, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })); } catch { /* pełna pamięć */ }
  window.dispatchEvent(new CustomEvent('przedmiot-postep', { detail: { klucz, ile: 1, mb: blob.size / 1048576 } }));
  return blob;
}
export async function maNagranie(sciezka, wersja) {
  try { return !!(await (await caches.open(CACHE_NAGRAN)).match(kluczNagrania(sciezka, wersja))); } catch { return false; }
}

// strumień: serwer podaje przy pliku download_url = https://ogarnijmaterial.pl/api/gh/…/contents/<ścieżka>?raw=1 —
// surowe audio/mpeg z obsługą Range (206), a ciasteczko sesji leci samo w <audio src>. <audio> zaczyna grać po pierwszych
// sekundach zamiast czekać na całe nagranie. Gdy adres jest inny albo go brak — null (wtedy pobieramy w całości).
export async function adresStrumienia(sciezka) {
  if (!maDostep()) return null;
  try {
    const r = await gh(sciezkaPliku(sciezka));
    if (!r.ok) return null;
    const url = (await r.json()).download_url;
    return typeof url === 'string' && url.startsWith(STRONA_GLOWNA) ? url : null;
  } catch { return null; }
}

// diagnostyka „Sprawdź nagrania” (Ustawienia): każdy krok osobno, z czytelnym wynikiem
export async function sprawdzNagrania(sciezka, wypisz) {
  const k = await kto();
  if (k.stan !== 'ok') {
    wypisz('zle', k.stan === 'brak' ? 'Logowanie: nikt nie jest zalogowany na ogarnijmaterial.pl — wejdź tam i wybierz osobę.' : 'Logowanie: brak połączenia z ogarnijmaterial.pl.');
    return;
  }
  const moje = k.id === PRZEDMIOT.konto;
  wypisz(moje ? 'ok' : 'zle', `Zalogowano jako ${OSOBY[k.id] || k.id} (ogarnijmaterial.pl)` + (moje ? '' : ` — to nie jest konto ${PROFIL.dopelniacz}.`));
  if (!moje) return;
  if (!sciezka) { wypisz('uwaga', 'Ten przedmiot nie ma jeszcze żadnego pełnego nagrania do sprawdzenia.'); return; }
  try {
    const sc = sciezkaPliku(sciezka);
    const meta = await gh(sc);
    if (!meta.ok) { wypisz('zle', `Plik nagrania: nie widać go (błąd ${meta.status}).`); return; }
    const { size: rozmiar, download_url: adres } = await meta.json();
    wypisz('ok', `Plik nagrania: jest (${(rozmiar / 1048576).toFixed(1)} MB)`);
    if (typeof adres !== 'string' || !adres.startsWith(STRONA_GLOWNA)) wypisz('uwaga', 'Odtwarzanie od razu (strumień): niedostępne — nagranie pobierze się w całości przed odtworzeniem.');
    else {
      const t0 = performance.now();
      const st = await fetch(adres, { headers: { Range: 'bytes=0-131071' }, credentials: 'include', cache: 'no-store' }).catch(() => null);
      const kawalek = st?.status === 206;
      if (st?.ok) await st.arrayBuffer();
      const s = ((performance.now() - t0) / 1000).toFixed(1);
      wypisz(kawalek ? 'ok' : st?.ok ? 'uwaga' : 'zle', kawalek ? `Odtwarzanie od razu (strumień): działa — pierwszy kawałek po ${s} s`
        : st?.ok ? `Odtwarzanie od razu (strumień): serwer oddaje cały plik zamiast kawałka (${st.status}) — iPhone może nie przewijać.`
          : `Odtwarzanie od razu (strumień): nie wyszło (${st ? 'błąd ' + st.status : 'brak połączenia'}) — nagranie pobierze się w całości przed odtworzeniem.`);
    }
    const t0 = performance.now();
    const pr = await gh(sc + '?raw=1', { headers: { Accept: 'application/vnd.github.raw' } });
    if (!pr.ok) { wypisz('zle', `Pobieranie: błąd ${pr.status}.`); return; }
    const bajty = (await pr.arrayBuffer()).byteLength;
    const s = (performance.now() - t0) / 1000;
    wypisz(bajty < rozmiar * 0.98 ? 'zle' : s > 90 ? 'uwaga' : 'ok', bajty < rozmiar * 0.98
      ? `Pobieranie: przerwane (${(bajty / 1048576).toFixed(1)} z ${(rozmiar / 1048576).toFixed(1)} MB).`
      : `Pobieranie na telefon (do słuchania bez sieci): całe nagranie w ${Math.round(s)} s`);
  } catch (e) {
    wypisz('zle', `Połączenie z ogarnijmaterial.pl nie wyszło: ${e.message}`);
    return;
  }
  try {
    const c = await caches.open(CACHE_NAGRAN);
    wypisz('ok', `Pamięć na nagrania: działa (zapisanych: ${(await c.keys()).length})`);
  } catch (e) { wypisz('uwaga', `Pamięć na nagrania niedostępna (${e.message}) — nagranie zagra, ale za każdym razem pobierze się od nowa.`); }
}
