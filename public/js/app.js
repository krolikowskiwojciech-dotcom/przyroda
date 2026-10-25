// Ekrany aplikacji przedmiotu (wspólne dla Przyrody i Historii — różni je tylko js/przedmiot.js):
// lista lekcji (działami), lekcja (nagrania, ćwiczenia, ściąga), ćwiczenie, ustawienia.
// Adresy: #/ (start), #/z/<id> (lekcja), #/z/<id>/sciaga, #/ustawienia.
// Osobę wybiera strona główna https://ogarnijmaterial.pl (PIN); tu tylko sprawdzamy, kto jest zalogowany (S.kto()).

import { h, okno, odm, ik, kolor, IKONY_PRZEDMIOTU, pasekGory, znaczekOsoby, ilustracja, obrazDzialu, obrazLekcji } from './dom.js';
import { uruchom } from './gra.js';
import * as S from './store.js';
import { graj, przygotujDzwieki } from './dzwieki.js';
import { PRZEDMIOT } from './przedmiot.js';

const app = document.getElementById('app');
let indeks = null;
let spis = null; // układ podręcznika: działy i lekcje (zestawy/spis.json)
const zestawyCache = {};
let biezacaGra = null;
let odtwarzacz = null; // odtwarzacz, do którego należy teraz wspólny glosnik (jedno nagranie naraz)

async function wczytajIndeks() {
  const r = await fetch('zestawy/indeks.json', { cache: 'no-cache' });
  indeks = await r.json();
  return indeks;
}
async function wczytajZestaw(id) {
  if (!zestawyCache[id]) {
    const r = await fetch(`zestawy/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Nie ma takiej lekcji.');
    zestawyCache[id] = await r.json();
  }
  return zestawyCache[id];
}

const profilInfo = () => S.PROFIL;
const dataPL = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
const dniDo = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(new Date().toDateString() + ' 12:00')) / 864e5);
const ikonaZestawu = (z, i) => z.ikona || IKONY_PRZEDMIOTU[i % IKONY_PRZEDMIOTU.length];
const kolorZestawu = (z, i) => (z.kolor ? 'kolor-' + z.kolor : kolor(i));
const babel = (nazwa, klasa = 'kp-emoji') => h('span', { class: klasa + ' babel-bio', 'aria-hidden': 'true' }, ik(nazwa));
const etykietaTerminu = (dni, iso) => (dni === 0 ? 'kartkówka dziś!' : dni === 1 ? 'kartkówka jutro' : `kartkówka ${dataPL(iso)}`);

// „Przedmioty” po lewej, ustawienia i znaczek osoby po prawej, pod spodem nazwa przedmiotu
function naglowek() {
  const p = profilInfo();
  return [
    pasekGory({ tekst: 'Przedmioty', href: S.STRONA_GLOWNA },
      h('a', { class: 'ikona-btn', href: '#/ustawienia', 'aria-label': 'Ustawienia' }, ik('zebatka')),
      znaczekOsoby(p.imie, S.ZMIEN_OSOBE)),
    h('div', { class: 'przedmiot-etykieta' }, h('b', { class: 'serif' }, PRZEDMIOT.nazwa), h('small', { class: 'maly' }, `${p.imie} · klasa ${p.klasa}`)),
  ];
}

// ---------- lista lekcji: działy z podręcznika (zestawy/spis.json), w nich lekcje po kolei ----------
const KOLORY_DZIALOW = ['kolor-brzoskwinia', 'kolor-mietowy', 'kolor-lila', 'kolor-zolty', 'kolor-niebieski', 'kolor-rozowy'];
const rozwiniete = new Map(); // nr działu → rozwinięty? (na czas otwartej aplikacji)
let zakladka = 'lekcje'; // zakładka listy: lekcje (działy z podręcznika) | cwiczenia (zestawy spoza działów) — jak w Angielskim

function ekranListy() {
  const p = profilInfo();
  const moje = indeks.zestawy.filter((z) => z.dla.includes(p.id));
  const pilne = moje.filter((z) => z.termin && dniDo(z.termin) >= 0).sort((a, b) => a.termin.localeCompare(b.termin));
  const wSpisie = new Set();
  const dzialy = (spis?.dzialy || []).map((d, i) => {
    const pozycje = d.lekcje.map((l) => {
      const z = moje.find((x) => x.dzial === d.nr && (l.typ ? x.typ === l.typ : !x.typ && x.lekcja === l.nr));
      if (z) wSpisie.add(z.id);
      return { ...l, z };
    });
    return { ...d, pozycje, kolor: KOLORY_DZIALOW[i % KOLORY_DZIALOW.length], gotowe: pozycje.filter((x) => x.z).length };
  });
  const inne = moje.filter((z) => !wSpisie.has(z.id) && !pilne.includes(z));

  let nr = 0;
  const karta = (z) => {
    const i = nr++;
    const { ostatnia, ile } = S.wynikiZestawu(p.id, z.id);
    const dni = z.termin ? dniDo(z.termin) : null;
    return h('a', { class: `karta-pakietu ${kolorZestawu(z, i)}`, href: '#/z/' + encodeURIComponent(z.id) },
      h('div', { class: 'kp-gora' }, babel(ikonaZestawu(z, i)),
        h('div', { class: 'kp-txt' },
          z.termin && dni >= 0 ? h('span', { class: 'termin' + (dni <= 1 ? ' pilne' : '') }, etykietaTerminu(dni, z.termin)) : null,
          h('div', { class: 'kp-tytul serif' }, z.tytul))),
      h('div', { class: 'kp-dol' },
        h('span', { class: 'kp-ikony' }, h('span', { class: 'kp-ikona' }, ik('ptaszek'), `${z.zadan} ${odm(z.zadan, 'pytanie', 'pytania', 'pytań')}`)),
        ostatnia ? h('span', { class: 'poz-status zna' }, `ostatnio ${ostatnia.dobrze}/${ostatnia.ile}` + (ile > 1 ? ` · ${ile}×` : ''))
          : postepBlokow(p.id, z)));
  };

  let dzialTeraz = null; // wiersz lekcji potrzebuje numeru działu do ścieżki ilustracji
  const wiersz = (l) => {
    const z = l.z;
    const nrEl = h('span', { class: 'lek-miniatura' }, ilustracja(obrazLekcji(dzialTeraz, l.nr, l.typ), 'lek-obraz'),
      l.typ ? h('span', { class: 'lek-nr ikona' }, ik(l.typ === 'test' ? 'ptaszek' : 'sciaga')) : h('span', { class: 'lek-nr serif' }, l.nr));
    if (!z) {
      return h('div', { class: 'lek-wiersz wkrotce' }, nrEl,
        h('span', { class: 'lek-txt' }, h('b', {}, l.temat), l.strony ? h('small', {}, `s. ${l.strony}`) : null),
        h('span', { class: 'lek-wkrotce' }, 'wkrótce'));
    }
    const { ostatnia } = S.wynikiZestawu(p.id, z.id);
    return h('a', { class: 'lek-wiersz', href: '#/z/' + encodeURIComponent(z.id) }, nrEl,
      h('span', { class: 'lek-txt' }, h('b', {}, z.tytul),
        h('small', { class: 'lek-meta' }, (z.strony || l.strony) ? h('span', {}, `s. ${z.strony || l.strony}`) : null,
          z.nagrania ? h('span', { class: 'kp-ikona' }, ik('sluchawki'), z.nagrania) : null,
          h('span', { class: 'kp-ikona' }, ik('ptaszek'), z.zadan),
          z.sciaga ? h('span', { class: 'kp-ikona' }, ik('sciaga')) : null)),
      ostatnia ? h('span', { class: 'poz-status zna' }, `${ostatnia.dobrze}/${ostatnia.ile}`) : postepBlokow(p.id, z) || h('span', { class: 'lek-strzalka' }, ik('dalej')));
  };

  const blokDzialu = (d) => {
    dzialTeraz = d.nr;
    if (!rozwiniete.has(d.nr)) rozwiniete.set(d.nr, d.gotowe > 0);
    const sek = h('section', { class: `dzial ${d.kolor}` + (rozwiniete.get(d.nr) ? ' otwarty' : '') });
    const gora = h('button', { class: 'dzial-gora', type: 'button', 'aria-expanded': String(rozwiniete.get(d.nr)),
      onclick: () => { const o = !rozwiniete.get(d.nr); rozwiniete.set(d.nr, o); sek.classList.toggle('otwarty', o); gora.setAttribute('aria-expanded', String(o)); } },
      h('span', { class: 'dzial-obraz' }, ilustracja(obrazDzialu(d.nr)), h('span', { class: 'dzial-nr serif' }, d.nr)),
      h('span', { class: 'dzial-txt' },
        h('small', {}, `Dział ${d.nr}`),
        h('b', { class: 'serif' }, d.tytul || `Dział ${d.nr}`),
        h('span', { class: 'dzial-meta' }, d.gotowe ? `gotowe ${d.gotowe} z ${d.pozycje.length}` : 'lekcje wkrótce')),
      h('span', { class: 'dzial-strzalka', 'aria-hidden': 'true' }, ik('dalej')));
    sek.append(gora, h('div', { class: 'dzial-lekcje' }, d.pozycje.map(wiersz)));
    return sek;
  };

  const pusto = !dzialy.length && !moje.length;
  app.replaceChildren(
    h('main', { class: 'ekran' },
      naglowek(),
      pusto ? h('section', { class: 'komunikat pusto' },
        h('span', { class: 'kp-emoji babel-bio komunikat-znak', 'aria-hidden': 'true' }, ik(PRZEDMIOT.ikony[0])),
        h('div', { class: 'kat-etykieta' }, `${PRZEDMIOT.nazwa} · klasa ${p.klasa}`),
        h('h1', { class: 'serif' }, 'Jeszcze nie ma lekcji'),
        h('p', {}, `Lekcje ${PRZEDMIOT.dopelniacz} pojawią się, gdy dodamy pierwszy rozdział. Będą tu nagrania do słuchania z książką, ćwiczenia i ściągi.`))
        : h('div', { class: 'tytul-wiersz' }, h('h1', { class: 'tytul serif' }, 'Czego dziś się ', h('em', {}, 'uczymy'), '?')),
      pilne.length ? [h('div', { class: 'sekcja' }, 'Przed kartkówką'), h('div', { class: 'lista-pakietow' }, pilne.map(karta))] : null,
      dzialy.length ? zakladki(dzialy.map(blokDzialu), inne.map(karta))
        : inne.length ? [h('div', { class: 'sekcja' }, 'Lekcje'), h('div', { class: 'lista-pakietow' }, inne.map(karta))] : null));
}

// zakładki „Lekcje / Ćwiczenia” pod tytułem (wzór: zakładki Angielskiego); wybór pamiętany do zamknięcia aplikacji
function zakladki(lekcje, cwiczenia) {
  const tresc = h('div', { class: 'zakladka-tresc' });
  const pokaz = () => tresc.replaceChildren(zakladka === 'lekcje' ? h('div', { class: 'dzialy' }, lekcje)
    : cwiczenia.length ? h('div', { class: 'lista-pakietow' }, cwiczenia)
      : h('p', { class: 'zakladka-pusto maly' }, 'Tu pojawią się ćwiczenia spoza lekcji, na przykład przed kartkówką.'));
  const przyciski = [['lekcje', 'Lekcje'], ['cwiczenia', 'Ćwiczenia']].map(([id, t]) => h('button', {
    class: 'zakladka' + (zakladka === id ? ' akt' : ''), type: 'button',
    onclick: (e) => { zakladka = id; przyciski.forEach((b) => b.classList.remove('akt')); e.currentTarget.classList.add('akt'); pokaz(); },
  }, t, id === 'cwiczenia' && cwiczenia.length ? h('span', { class: 'zakladka-licznik' }, cwiczenia.length) : null));
  pokaz();
  return [h('div', { class: 'zakladki', role: 'tablist' }, przyciski), tresc];
}

// postęp lekcji bez pełnej próby: „2 z 4 bloków” (null, gdy nic nie zaczęte)
function postepBlokow(osoba, z) {
  const zrobione = S.wynikiBlokow(osoba, z.id).size;
  return zrobione ? h('span', { class: 'poz-status uczy' }, `${Math.min(zrobione, z.bloki)} z ${z.bloki} ${odm(z.bloki, 'bloku', 'bloków', 'bloków')}`) : null;
}

// ---------- lekcja ----------
async function ekranZestawu(id) {
  const z = await wczytajZestaw(id);
  const p = profilInfo();
  const nr = Math.max(0, kolejnoscKart().findIndex((x) => x.id === z.id));
  const { ostatnia, ile } = S.wynikiZestawu(p.id, z.id);
  const wynikiBlokow = S.wynikiBlokow(p.id, z.id);
  const graj1 = (bloki, extra = {}) => startGry(z, bloki, extra);
  const dni = z.termin ? dniDo(z.termin) : null;
  const zadan = z.bloki.reduce((n, b) => n + (b.ile || b.zadania?.length || 0), 0);
  app.replaceChildren(
    h('main', { class: 'ekran' },
      pasekGory({ tekst: 'Wróć', href: '#/' }),
      h('section', { class: `naglowek-dzialu ${kolorZestawu(z, nr)}` },
        obrazLekcji(z.dzial, z.lekcja, z.typ) ? ilustracja(obrazLekcji(z.dzial, z.lekcja, z.typ), 'nagl-obraz') : babel(ikonaZestawu(z, nr), 'kp-emoji nagl-znak'),
        h('span', { class: 'kat-etykieta' }, z.termin && dni >= 0 ? etykietaTerminu(dni, z.termin)
          : [z.dzial ? `Dział ${z.dzial}` : 'Zestaw', z.typ === 'podsumowanie' ? ' · podsumowanie' : z.typ === 'test' ? ' · test' : z.lekcja ? ` · lekcja ${z.lekcja}` : '', z.strony ? ` · s. ${z.strony}` : ''].join('')),
        h('h1', { class: 'serif' }, z.tytul),
        z.opis ? h('p', {}, z.opis) : null,
        h('div', { class: 'np-staty' },
          h('span', {}, h('b', {}, z.bloki.length), ' ', odm(z.bloki.length, 'blok', 'bloki', 'bloków')),
          h('span', {}, h('b', {}, zadan), ' ', odm(zadan, 'pytanie', 'pytania', 'pytań')),
          ostatnia ? h('span', {}, 'ostatnio ', h('b', {}, `${ostatnia.dobrze}/${ostatnia.ile}`)) : null,
          ile > 1 ? h('span', {}, h('b', {}, ile), ' prób') : null)),
      // kartkówka ze zdjęcia nie ma nagrania — sekcję „Posłuchaj” pokazujemy tylko przy lekcjach
      z.nagrania?.length || z.zrodlo === 'lekcje-audio' ? h('div', { class: 'sekcja' }, 'Posłuchaj') : null,
      z.nagrania?.length ? h('div', { class: 'nagrania' }, z.nagrania.map((n) => odtwarzaczNagrania(z, n)))
        : z.zrodlo === 'lekcje-audio' ? h('p', { class: 'nagr-brak maly' }, 'Nagranie tej lekcji jeszcze się przygotowuje. Ćwiczenia są już gotowe.') : null,
      h('div', { class: 'sekcja' }, 'Poćwicz'),
      h('button', { class: 'cta', type: 'button', onclick: () => graj1(z.bloki) },
        h('span', { class: 'cta-txt' }, h('b', {}, 'Zaczynam całą lekcję'), h('small', {}, 'blok po bloku, z wyjaśnieniami')),
        h('span', { class: 'cta-strzalka' }, ik('dalej'))),
      h('ul', { class: 'lista-pozycji' }, z.bloki.map((b, i) => {
        const n = b.ile || b.zadania?.length;
        // zrobiony blok: ostatni wynik (zielony, gdy cały bez błędu); niedokończony — ile pytań było
        const w = wynikiBlokow.get(b.id);
        const status = !w ? h('span', { class: 'poz-status' }, 'ćwicz')
          : w.ile >= n && w.dobrze === w.ile ? h('span', { class: 'poz-status opan' }, ik('ptaszek'), ` ${w.dobrze}/${w.ile}`)
            : h('span', { class: 'poz-status' + (w.ile >= n ? ' uczy' : '') }, w.ile >= n ? `${w.dobrze}/${w.ile}` : `zaczęte ${w.ile}/${n}`);
        return h('li', { class: 'pozycja klik' + (w ? ' zrobione' : ''), onclick: () => graj1([b], { tylkoBlok: b.id }) },
          h('span', { class: `blok-nr serif ${kolor(i)}` }, i + 1),
          h('span', { class: 'poz-txt' }, h('b', {}, b.tytul), h('small', { class: 'maly' }, `${n} ${odm(n, 'pytanie', 'pytania', 'pytań')}`)),
          status);
      })),
      z.sciaga?.length ? h('a', { class: 'karta-sciagi', href: `#/z/${encodeURIComponent(z.id)}/sciaga` },
        ik('sciaga'), h('span', { class: 'poz-txt' }, h('b', {}, 'Ściąga z lekcji'), h('small', { class: 'maly' }, `${z.sciaga.length} punktów${z.definicje ? ` · ${Object.keys(z.definicje).length} pojęć` : ''}`)), ik('dalej')) : null));
}

function kolejnoscKart() {
  const p = profilInfo();
  return indeks.zestawy.filter((x) => x.dla.includes(p.id));
}

// ---------- odtwarzacz ----------
// Jeden wspólny element dla wszystkich nagrań lekcji. iPhone pozwala zacząć odtwarzanie tylko w reakcji
// na dotknięcie, a pełne nagranie najpierw się pobiera (kilka sekund) — więc przy dotknięciu ten sam element
// od razu gra ułamek sekundy ciszy (odblokowanie, jak w Lingozie), a po pobraniu dostaje właściwy plik.
// Pełne nagranie, którego jeszcze nie ma na telefonie, gra strumieniem (S.adresStrumienia):
// start po sekundzie, a pobieranie do pamięci telefonu idzie dalej w tle.
const glosnik = new Audio();
glosnik.preload = 'metadata';
glosnik.setAttribute('playsinline', '');
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* starsze iOS */ } // gra też przy wyciszonym iPhonie
function wavCiszy() {
  const n = 800; const b = new Uint8Array(44 + n); const v = new DataView(b.buffer);
  const t = (o, x) => [...x].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  t(0, 'RIFF'); v.setUint32(4, 36 + n, true); t(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); t(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
const CISZA = wavCiszy();
function odblokujGlosnik() {
  glosnik.src = CISZA;
  glosnik.play().then(() => { if (glosnik.src === CISZA) glosnik.pause(); }).catch(() => {});
}

const czasTxt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');
const kluczMiejsca = (z, n) => `${PRZEDMIOT.klucz}.miejsce.${z.id}.${n.plik || n.prywatne}`;

function zatrzymajOdtwarzacz() {
  if (!odtwarzacz) return;
  odtwarzacz.zapisz?.(); // zanim odepniemy słuchacze — wyjście z ekranu też pamięta miejsce
  glosnik.pause();
  odtwarzacz.sluchacze?.abort();
  if (odtwarzacz.url) URL.revokeObjectURL(odtwarzacz.url);
  odtwarzacz.przestan?.();
  odtwarzacz = null;
}

function odtwarzaczNagrania(z, n) {
  const btn = h('button', { class: 'graj-btn', type: 'button', 'aria-label': 'Odtwórz' }, ik('graj'));
  const cofnij = h('button', { class: 'cofnij-btn', type: 'button', 'aria-label': 'Cofnij 15 sekund', disabled: true }, ik('cofnij15'));
  const naprzod = h('button', { class: 'cofnij-btn', type: 'button', 'aria-label': 'Do przodu 15 sekund', disabled: true }, ik('naprzod15'));
  const suwak = h('input', { class: 'suwak', type: 'range', min: 0, max: 1000, value: 0, disabled: true, 'aria-label': 'Miejsce w nagraniu' });
  const czas = h('small', { class: 'nagr-czas' }, n.minuty ? `ok. ${n.minuty} min` : '');
  const stan = h('small', { class: 'nagr-stan', role: 'status' });
  const klucz = kluczMiejsca(z, n);
  const ja = {}; // ten odtwarzacz; glosnik należy do niego, gdy odtwarzacz === ja
  const moj = () => odtwarzacz === ja;

  const ustawIkone = () => btn.replaceChildren(ik(moj() && !glosnik.paused ? 'pauza' : 'graj'));
  const odswiez = () => {
    if (!moj()) return;
    suwak.value = glosnik.duration ? Math.round((glosnik.currentTime / glosnik.duration) * 1000) : 0;
    czas.textContent = `${czasTxt(glosnik.currentTime)} / ${czasTxt(glosnik.duration)}`;
  };
  ja.przestan = () => { suwak.disabled = true; cofnij.disabled = true; naprzod.disabled = true; btn.replaceChildren(ik('graj')); };

  function przejmij() {
    zatrzymajOdtwarzacz();
    odtwarzacz = ja;
    ja.sluchacze = new AbortController();
    ja.url = null;
  }
  function podepnij(src, strumien = false) {
    const opcje = { signal: ja.sluchacze.signal };
    // gdy strumień się urwie (np. sesja albo sieć), raz bierzemy adres od nowa i gramy od tego samego miejsca
    if (strumien) {
      glosnik.addEventListener('error', async () => {
        if (!moj() || ja.ponowiono) { blad(new Error('Nagranie się przerwało. Stuknij ▶, żeby spróbować jeszcze raz.')); return; }
        ja.ponowiono = true;
        const t = glosnik.currentTime || Number(S.LS.get(klucz, 0));
        const nowy = await S.adresStrumienia(n.prywatne);
        if (!nowy || !moj()) { blad(new Error('Nagranie się przerwało. Stuknij ▶, żeby spróbować jeszcze raz.')); return; }
        glosnik.addEventListener('loadedmetadata', () => { glosnik.currentTime = t; }, { once: true, signal: ja.sluchacze.signal });
        glosnik.src = nowy;
        glosnik.play().catch(blad);
      }, opcje);
      glosnik.addEventListener('playing', () => { ja.ponowiono = false; }, opcje);
    }
    const zapisane = Number(S.LS.get(klucz, 0));
    glosnik.addEventListener('loadedmetadata', () => { if (zapisane > 5 && zapisane < glosnik.duration - 5) glosnik.currentTime = zapisane; odswiez(); }, opcje);
    glosnik.addEventListener('timeupdate', () => { odswiez(); if (Math.round(glosnik.currentTime) % 5 === 0) S.LS.set(klucz, glosnik.currentTime); }, opcje);
    glosnik.addEventListener('play', ustawIkone, opcje);
    glosnik.addEventListener('pause', () => { ustawIkone(); ja.zapisz(); }, opcje);
    glosnik.addEventListener('ended', () => { S.LS.set(klucz, 0); ustawIkone(); }, opcje);
    glosnik.src = src;
    suwak.disabled = false; cofnij.disabled = false; naprzod.disabled = false;
  }
  ja.zapisz = () => { if (moj() && glosnik.src !== CISZA && glosnik.currentTime > 1) S.LS.set(klucz, glosnik.currentTime); };
  const blad = (e) => {
    stan.textContent = e?.name === 'NotAllowedError' ? 'Telefon zablokował dźwięk. Stuknij jeszcze raz.' : (e?.message || 'Nie udało się odtworzyć nagrania.');
    ustawIkone();
  };
  const graGotowe = () => glosnik.play().catch((e) => {
    // po dłuższym czekaniu iPhone potrafi już nie uznać tego za reakcję na dotknięcie — wtedy nagranie czeka gotowe
    if (e?.name !== 'NotAllowedError') throw e;
    stan.textContent = 'Nagranie gotowe — stuknij ▶, żeby słuchać.';
    ustawIkone();
  });
  btn.onclick = async () => {
    if (moj() && glosnik.src !== CISZA && !glosnik.error) { if (glosnik.paused) glosnik.play().catch(blad); else glosnik.pause(); return; }
    przejmij();
    if (!n.prywatne) { podepnij(n.plik); glosnik.play().catch(blad); return; } // bez czekania — wciąż w dotknięciu
    odblokujGlosnik(); // jeszcze w dotknięciu, zanim zacznie się pobieranie
    btn.disabled = true;
    try {
      // ogarnijmaterial.pl: nagrania jeszcze nie ma na telefonie → strumień, bez czekania na całe pobranie
      if (!(await S.maNagranie(n.prywatne, n.wersja))) {
        stan.textContent = 'Łączę z nagraniem…';
        const adres = await S.adresStrumienia(n.prywatne);
        if (!moj()) return;
        if (adres) {
          ja.ponowiono = false;
          stan.textContent = '';
          podepnij(adres, true);
          await graGotowe();
          return;
        }
      }
      stan.textContent = 'Pobieram nagranie…';
      const blob = await S.nagraniePrywatne(n.prywatne, n.wersja);
      if (!moj()) return; // w międzyczasie włączono inne nagranie
      ja.url = URL.createObjectURL(blob);
      stan.textContent = '';
      podepnij(ja.url);
      await graGotowe();
    } catch (e) { blad(e); } finally { btn.disabled = false; }
  };
  // pełne nagranie: pobieranie do pamięci telefonu rusza w tle od razu po wejściu w lekcję, z procentami
  if (n.prywatne && S.maDostep()) {
    const kl = S.kluczPostepu(n.prywatne, n.wersja);
    const naPostep = (e) => {
      if (e.detail.klucz !== kl || !stan.isConnected) return;
      const { ile, mb } = e.detail;
      if (!(moj() && glosnik.src !== CISZA)) stan.textContent = ile === 1 ? 'Nagranie gotowe.'
        : ile != null ? `Pobieram nagranie… ${Math.round(ile * 100)}%` : `Pobieram nagranie… ${mb.toFixed(1).replace('.', ',')} MB`;
    };
    window.addEventListener('przedmiot-postep', naPostep);
    S.maNagranie(n.prywatne, n.wersja).then((jest) => {
      if (jest) { window.removeEventListener('przedmiot-postep', naPostep); return; }
      S.nagraniePrywatne(n.prywatne, n.wersja).then(() => { if (stan.isConnected && !moj()) stan.textContent = 'Nagranie gotowe — zapisane na tym urządzeniu.'; })
        .catch((e) => { if (stan.isConnected && !moj()) stan.textContent = e.message; })
        .finally(() => setTimeout(() => window.removeEventListener('przedmiot-postep', naPostep), 60000));
    });
  }
  cofnij.onclick = () => { if (moj()) glosnik.currentTime = Math.max(0, glosnik.currentTime - 15); };
  naprzod.onclick = () => { if (moj()) glosnik.currentTime = Math.min((glosnik.duration || Infinity) - 1, glosnik.currentTime + 15); };
  suwak.oninput = () => { if (moj() && glosnik.duration) glosnik.currentTime = (suwak.value / 1000) * glosnik.duration; };
  if (n.prywatne) S.maNagranie(n.prywatne, n.wersja).then((jest) => { if (jest) stan.textContent = 'zapisane na tym urządzeniu'; });

  return h('div', { class: 'nagranie' },
    h('div', { class: 'nagr-gora' }, btn,
      h('div', { class: 'poz-txt' }, h('b', {}, n.tytul, n.prywatne ? h('span', { class: 'klodka', title: 'tylko dla rodziny' }, ik('klodka')) : null),
        n.opis ? h('small', { class: 'maly' }, n.opis) : null)),
    h('div', { class: 'nagr-dol' }, cofnij, naprzod, suwak, czas),
    stan);
}

// ---------- ściąga ----------
async function ekranSciagi(id) {
  const z = await wczytajZestaw(id);
  const nr = Math.max(0, kolejnoscKart().findIndex((x) => x.id === z.id));
  const obrazyPo = {};
  for (const o of z.obrazy || []) (obrazyPo[o.po ?? z.sciaga.length] ||= []).push(o);
  const obraz = (o) => h('figure', { class: 'sciaga-obraz' }, h('img', { src: o.plik, alt: o.podpis || '', loading: 'lazy' }), o.podpis ? h('figcaption', {}, o.podpis) : null);
  app.replaceChildren(
    h('main', { class: 'ekran' },
      pasekGory({ tekst: 'Wróć', href: '#/z/' + encodeURIComponent(z.id) }),
      h('section', { class: `naglowek-dzialu niski ${kolorZestawu(z, nr)}` },
        h('span', { class: 'kat-etykieta' }, 'Ściąga'),
        h('h1', { class: 'serif' }, z.tytul)),
      (obrazyPo[0] || []).map(obraz), // rysunek ściągi („po”: 0) — przed pierwszym punktem
      h('ol', { class: 'sciaga' }, z.sciaga.map((t, i) => [h('li', {}, t), (obrazyPo[i + 1] || []).map(obraz)])),
      (obrazyPo[z.sciaga.length + 1] || []).map(obraz),
      z.definicje ? [h('div', { class: 'sekcja' }, 'Pojęcia'),
        h('dl', { class: 'pojecia' }, Object.entries(z.definicje).map(([k, v]) => [h('dt', { class: 'serif' }, k), h('dd', {}, v)]))] : null));
}

function startGry(zestaw, bloki, extra = {}) {
  if (biezacyKlucz) { zapamietajMiejsce(); pominZapis = true; biezacyKlucz = null; }
  biezacaGra?.zakoncz();
  zatrzymajOdtwarzacz();
  const p = profilInfo();
  const pole = h('div');
  app.replaceChildren(pole);
  biezacaGra = uruchom(pole, {
    zestaw, bloki, profil: p, ...extra,
    naKoniec: (proba) => { S.dodajProbe(p.id, proba); synchro(); },
    jeszczeRaz: () => startGry(zestaw, bloki, { tylkoBlok: extra.tylkoBlok }),
    powtorz: (zadania) => startGry(zestaw, zestaw.bloki.filter((b) => zadania[b.id]), { zadania, powtorka: true }),
    wyjdz: () => { biezacaGra?.zakoncz(); biezacaGra = null; location.hash = '#/z/' + encodeURIComponent(zestaw.id); render(); },
  });
}

// ---------- ustawienia ----------
function ekranUstawien() {
  const p = profilInfo();
  const stan = h('p', { class: 'maly', role: 'status' });
  const doSprawdzenia = indeks.zestawy.find((z) => z.prywatne)?.prywatne || null;
  app.replaceChildren(
    h('main', { class: 'ekran' },
      pasekGory({ tekst: 'Wróć', href: '#/' }),
      h('div', { class: 'profil-gora' },
        h('span', { class: 'profil-duzy-avatar serif' }, p.znak),
        h('h1', { class: 'serif' }, p.imie)),
      h('section', { class: 'ust' },
        h('div', { class: 'sekcja' }, 'Ten telefon'),
        h('div', { class: 'wiersz' }, h('span', {}, `Uczy się: ${p.imie}, klasa ${p.klasa}`), h('a', { class: 'chip', href: S.ZMIEN_OSOBE }, 'Zmień osobę')),
        h('div', { class: 'wiersz' }, h('span', {}, 'Dźwięki'),
          h('button', { class: 'chip' + (S.dzwiek() ? ' akt' : ''), type: 'button', 'aria-pressed': String(S.dzwiek()), onclick: () => { S.ustawDzwiek(!S.dzwiek()); graj('przelacznik'); render(); } },
            S.dzwiek() ? 'włączone' : 'wyłączone'))),
      h('section', { class: 'ust' },
        h('div', { class: 'sekcja' }, 'Wyniki i pełne nagrania'),
        h('p', { class: 'maly' }, `Zalogowano jako ${p.imie} na ogarnijmaterial.pl. Wyniki same zapisują się na serwerze rodziny, a pełne nagrania stamtąd grają.`),
        h('div', { class: 'przyciski' },
          h('button', { class: 'btn glowny', type: 'button', onclick: async () => {
            stan.textContent = 'Łączę…';
            try { await S.synchronizuj(p.id); stan.textContent = 'Połączone. Wyniki są zapisane.'; } catch (e) { stan.textContent = e.message; }
          } }, 'Synchronizuj teraz'),
          h('a', { class: 'btn jasny', href: S.ZMIEN_OSOBE }, 'Zmień osobę')),
        stan),
      h('section', { class: 'ust' },
        h('div', { class: 'sekcja' }, 'Pełne nagrania nie grają?'),
        h('p', { class: 'maly' }, 'Sprawdzenie krok po kroku: logowanie, plik, odtwarzanie od razu, szybkość łącza i dźwięk.'),
        h('button', { class: 'btn glowny', type: 'button', onclick: async (e) => {
          const przycisk = e.currentTarget, lista = przycisk.nextElementSibling;
          przycisk.disabled = true; przycisk.textContent = 'Sprawdzam… (pobieranie może potrwać do minuty)';
          lista.replaceChildren();
          const wypisz = (rodzaj, tekst) => lista.append(h('li', { class: 'diag-' + rodzaj }, ik(rodzaj === 'ok' ? 'ptaszek' : 'zamknij'), h('span', {}, tekst)));
          try {
            await S.sprawdzNagrania(doSprawdzenia, wypisz);
            // odtwarzanie: krótka cisza na wspólnym odtwarzaczu (w tym samym dotknięciu)
            try { glosnik.src = CISZA; await glosnik.play(); glosnik.pause(); wypisz('ok', 'Odtwarzanie dźwięku: działa'); }
            catch (err) { wypisz('zle', `Odtwarzanie dźwięku: zablokowane (${err.name}). Sprawdź, czy strona nie jest wyciszona.`); }
          } finally { przycisk.disabled = false; przycisk.textContent = 'Sprawdź nagrania'; }
        } }, 'Sprawdź nagrania'),
        h('ul', { class: 'diag', 'aria-live': 'polite' }))));
}

async function synchro() {
  if (dostep !== true || !S.maDostep()) return;
  try { await S.synchronizuj(profilInfo().id); } catch (e) { console.warn('Synchronizacja:', e.message); }
}

// ---------- kto jest zalogowany na ogarnijmaterial.pl ----------
// właścicielka przedmiotu → aplikacja; inna osoba albo brak sieci → spokojny komunikat; nikt (401) → strona główna
let dostep = null; // true = działa; { ekran } = komunikat zamiast aplikacji
const odmiana = (id) => (['aniela', 'magda'].includes(id) ? 'zalogowana' : 'zalogowany');
function ekranInnejOsoby(id) {
  const imie = S.OSOBY[id] || id;
  const w = S.PROFIL;
  app.replaceChildren(
    h('main', { class: 'ekran' },
      pasekGory({ tekst: 'Przedmioty', href: S.STRONA_GLOWNA }, znaczekOsoby(imie, S.ZMIEN_OSOBE)),
      h('section', { class: 'komunikat' },
        h('span', { class: 'kp-emoji babel-bio komunikat-znak', 'aria-hidden': 'true' }, ik(PRZEDMIOT.ikony[0])),
        h('div', { class: 'kat-etykieta' }, `${PRZEDMIOT.nazwa} · klasa ${w.klasa}`),
        h('h1', { class: 'serif' }, `To przedmiot ${w.dopelniacz}`),
        h('p', {}, `Na tym urządzeniu jest teraz ${odmiana(id)} ${imie}. ${PRZEDMIOT.nazwa} jest przygotowana tylko dla ${w.dopelniacz} — jej lekcje, nagrania i wyniki.`),
        h('div', { class: 'przyciski kolumna' },
          h('a', { class: 'btn glowny', href: S.STRONA_GLOWNA }, 'Wróć do przedmiotów'),
          h('a', { class: 'btn jasny', href: S.ZMIEN_OSOBE }, 'Zmień osobę')))));
}
function ekranBezSieci() {
  app.replaceChildren(
    h('main', { class: 'ekran' },
      pasekGory({ tekst: 'Przedmioty', href: S.STRONA_GLOWNA }),
      h('section', { class: 'komunikat' },
        h('h1', { class: 'serif' }, 'Brak połączenia'),
        h('p', {}, 'Nie udało się sprawdzić, kto jest zalogowany na ogarnijmaterial.pl. Sprawdź internet i spróbuj jeszcze raz.'),
        h('div', { class: 'przyciski kolumna' },
          h('button', { class: 'btn glowny', type: 'button', onclick: () => { dostep = null; start(); } }, 'Spróbuj jeszcze raz')))));
}

// Zapamiętane miejsce na każdym ekranie: po wyjściu z lekcji („Wróć”, koniec) lista wraca do tej samej karty,
// a nie na górę (Wojtek 2026-10-25 — zasada we wszystkich lekcjach). Zapis w chwili wyjścia z ekranu albo startu lekcji.
const miejsca = new Map();
let biezacyKlucz = null;
let pominZapis = false;
function zapamietajMiejsce() { if (biezacyKlucz) miejsca.set(biezacyKlucz, window.scrollY); }
function przywrocMiejsce() {
  biezacyKlucz = location.hash || '#/';
  const y = miejsca.get(biezacyKlucz) || 0;
  window.scrollTo(0, y);
  if (y) { setTimeout(() => window.scrollTo(0, y), 60); setTimeout(() => window.scrollTo(0, y), 300); }
}

async function render() {
  if (pominZapis) pominZapis = false; else zapamietajMiejsce();
  await renderEkran();
  if (!(location.hash || '').startsWith('#/gra')) przywrocMiejsce();
}

async function renderEkran() {
  try {
    if (dostep !== true) return dostep?.ekran?.();
    if (!indeks) await wczytajIndeks();
    if (!spis) spis = await fetch('zestawy/spis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { dzialy: [] })).catch(() => ({ dzialy: [] }));
    const hash = location.hash || '#/';
    if (biezacaGra && !hash.startsWith('#/gra')) { biezacaGra.zakoncz(); biezacaGra = null; }
    const sc = hash.match(/^#\/z\/(.+)\/sciaga$/);
    if (sc) { zatrzymajOdtwarzacz(); window.scrollTo(0, 0); return await ekranSciagi(decodeURIComponent(sc[1])); }
    const m = hash.match(/^#\/z\/(.+)$/);
    if (m) { zatrzymajOdtwarzacz(); return await ekranZestawu(decodeURIComponent(m[1])); }
    zatrzymajOdtwarzacz();
    if (hash === '#/ustawienia') return ekranUstawien();
    if (hash.startsWith('#/gra')) return;
    return ekranListy();
  } catch (e) {
    app.replaceChildren(h('main', { class: 'ekran' }, pasekGory({ tekst: 'Wróć', href: '#/' }), h('h1', { class: 'serif' }, 'Coś nie zadziałało'), h('p', {}, e.message)));
  }
}

// ogólny dźwięk przycisku: nawigacja, karty, zwykłe przyciski; odpowiedzi i „Sprawdź” mają własne dźwięki,
// a przyciski z data-cichy grają swój dźwięk same
const GLOSNE = 'a[href], .cta, .pozycja.klik, .btn:not(.sprawdz), .chip, .pigulka-wstecz';
document.addEventListener('click', (e) => {
  const el = e.target.closest(GLOSNE);
  if (el && !el.disabled && !el.closest('[data-cichy]') && !el.matches('.chip[aria-pressed]')) graj('przycisk');
}, true);
document.addEventListener('pointerdown', przygotujDzwieki, { once: true });

window.addEventListener('hashchange', render);

async function start() {
  const k = await S.kto();
  if (k.stan === 'brak') { location.replace(S.STRONA_GLOWNA); return; } // nikt nie wybrał osoby → strona główna
  if (k.id === PRZEDMIOT.konto) dostep = true;
  else if (k.id) dostep = { ekran: () => ekranInnejOsoby(k.id) };
  else dostep = { ekran: ekranBezSieci };
  await render();
  synchro();
}
start();

if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
