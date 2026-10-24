import { graj } from './dzwieki.js';
import { PRZEDMIOT } from './przedmiot.js';

// Drobne pomocniki DOM, ikony (interfejs i przedmiotowe do bąbli na kartach) i własne okienka zamiast alert/confirm.

export function h(tag, attrs = {}, ...dzieci) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const d of dzieci.flat(Infinity)) if (d != null && d !== false) el.append(d instanceof Node ? d : String(d));
  return el;
}

// kolory kart jak w Lingozie (pastelowe, z ciemniejszym „brzegiem” 3D)
export const KOLORY = ['kolor-mietowy', 'kolor-lila', 'kolor-zolty', 'kolor-brzoskwinia', 'kolor-niebieski', 'kolor-rozowy'];
export const kolor = (i) => KOLORY[((i % KOLORY.length) + KOLORY.length) % KOLORY.length];

// ikony — ten sam rysunek co w Lingozie (jedna kreska 2.1, zaokrąglone końce)
const S = (w) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${w}</svg>`;
const IKONY = {
  wstecz: S('<path d="M15 5l-7 7 7 7"/>'),
  strzalkaLewo: S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  zamknij: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  zebatka: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  ptaszek: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  dalej: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  wyslij: S('<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>'),
  powtorz: S('<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>'),
  sluchawki: S('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="2"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="2"/>'),
  graj: S('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pauza: S('<path d="M9 5.5v13M15 5.5v13"/>'),
  ksiazka: S('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
  sciaga: S('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 12h6M10 16h6"/>'),
  klodka: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'),
  cofnij15: S('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
  naprzod15: S('<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/>'),
  // przyroda i historia — do bąbli na kartach lekcji (pole „ikona” w zestawie; lista dla przedmiotu w js/przedmiot.js)
  lupa: S('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>'),
  lisc: S('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19 14 10"/>'),
  kompas: S('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  mikroskop: S('<path d="M9 4.5l4 2-3 6-4-2z"/><path d="M11.5 9.5a5 5 0 0 1 3.5 8.5"/><path d="M5 20.5h14M8 17.5h6"/>'),
  kropla: S('<path d="M12 3.5c3.5 4.5 6 7.8 6 10.8a6 6 0 0 1-12 0c0-3 2.5-6.3 6-10.8z"/>'),
  slonce: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  chmura: S('<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z"/>'),
  termometr: S('<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
  kolba: S('<path d="M9.5 3h5M10.5 3v6L5 19a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 19l-5.5-10V3"/><path d="M7.5 15h9"/>'),
  oko: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  gora: S('<path d="M3 19.5l6.5-11 4 6.5 2.5-3.5 5 8z"/>'),
  ptak: S('<path d="M4 15c4 0 6-2 7-6 1-3 4-4 6-3l3 1-3 1c0 6-4 10-10 10H4z"/><path d="M9 14l3-1"/>'),
  kolumna: S('<path d="M3.5 7.5 12 3.5l8.5 4z"/><path d="M5 10.5h14M5 18.5h14M3.5 21h17"/><path d="M7.5 10.5v8M12 10.5v8M16.5 10.5v8"/>'),
  zwoj: S('<path d="M7 4h11.5a2 2 0 0 1 0 4H17"/><path d="M7 4a2 2 0 0 0-2 2v12.5a2 2 0 0 1-2 2h12a2 2 0 0 0 2-2V8"/><path d="M9.5 10h4.5M9.5 13.5h4.5"/>'),
  korona: S('<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>'),
  zamek: S('<path d="M4 21V8.5h3V11h2.5V8.5h5V11H17V8.5h3V21z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>'),
  klepsydra: S('<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>'),
  mapa: S('<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  pioro: S('<path d="M20 4C12 4 6.5 9.5 6 17l-2 3.5"/><path d="M20 4c0 7.5-5 12.5-13.5 13"/><path d="M10 13.5h4.5"/>'),
  tarcza: S('<path d="M12 3.5 19.5 6v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6z"/>'),
  statek: S('<path d="M3 15.5h18l-2.5 4.5H5.5z"/><path d="M12 3.5v12M12 4.5l6 8h-6M12 6.5l-5 6h5"/>'),
  amfora: S('<path d="M9.5 3.5h5M10 3.5v3c-3.5 1.5-4.5 4.5-4 8 .4 3 2.5 5.5 6 6 3.5-.5 5.6-3 6-6 .5-3.5-.5-6.5-4-8v-3"/><path d="M7.7 8.5c-2 0-3 1.5-2.2 3.5M16.3 8.5c2 0 3 1.5 2.2 3.5"/>'),
};
export const ik = (nazwa, klasa = '') => h('span', { class: `ik ik-${nazwa} ${klasa}`, html: IKONY[nazwa] || IKONY.ksiazka });
export const IKONY_PRZEDMIOTU = PRZEDMIOT.ikony;

// ilustracje (gdy kiedyś dojdą, w stylu atlasu/podręcznika — nie dla maluchów); na razie aplikacja ich nie używa
export const ilustracja = (src, klasa = '') => (src ? h('img', { class: 'ilustr ' + klasa, src, alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => e.target.remove() }) : null);

// górny pasek każdego ekranu: po lewej zawsze wyraźna pigułka powrotu (strzałka + słowo), po prawej opcjonalne przyciski.
// wstecz: { tekst, href } albo { tekst, onclick }
export function pasekGory(wstecz, ...prawo) {
  const pig = wstecz.href
    ? h('a', { class: 'pigulka-wstecz', href: wstecz.href }, ik('strzalkaLewo'), h('span', {}, wstecz.tekst))
    : h('button', { class: 'pigulka-wstecz', type: 'button', onclick: wstecz.onclick }, ik('strzalkaLewo'), h('span', {}, wstecz.tekst));
  return h('nav', { class: 'pasek-gora' }, pig, prawo.length ? h('span', { class: 'pasek-prawo' }, prawo) : null);
}
// okrągły znaczek z inicjałem osoby (ogarnijmaterial.pl) → wybór osoby
export const znaczekOsoby = (imie, href) => h('a', { class: 'znaczek-osoby serif', href, 'aria-label': 'Zmień osobę' }, (imie || '?').slice(0, 1).toUpperCase());

// własne okienko (wysuwane od dołu): okno({ tytul, tresc, przyciski: [{ tekst, wartosc, klasa }] }) → Promise<wartosc>
export function okno({ tytul, tresc, przyciski = [{ tekst: 'Jasne', wartosc: true, klasa: 'glowny' }] }) {
  return new Promise((ok) => {
    const tlo = h('div', { class: 'okno-tlo', onclick: () => zamknij(null) });
    const pudlo = h('div', { class: 'okno', role: 'dialog', 'aria-modal': 'true', 'aria-label': tytul },
      h('div', { class: 'okno-tytul serif' }, tytul),
      typeof tresc === 'string' ? h('p', { class: 'okno-tekst' }, tresc) : tresc,
      h('div', { class: 'okno-przyciski' }, przyciski.map((p) => h('button', { class: 'btn ' + (p.klasa || 'jasny'), type: 'button', onclick: () => zamknij(p.wartosc) }, p.tekst))));
    const klaw = (e) => { if (e.key === 'Escape') zamknij(null); };
    function zamknij(w) {
      tlo.classList.remove('wid'); pudlo.classList.remove('wid');
      document.removeEventListener('keydown', klaw);
      setTimeout(() => { tlo.remove(); pudlo.remove(); }, 250);
      ok(w);
    }
    document.body.append(tlo, pudlo);
    graj('okno');
    document.addEventListener('keydown', klaw);
    requestAnimationFrame(() => { tlo.classList.add('wid'); pudlo.classList.add('wid'); });
    pudlo.querySelector('.okno-przyciski button:last-child')?.focus({ preventScroll: true });
  });
}

export const odm = (n, a, b, c) => {
  const j = n % 10, d = n % 100;
  return n === 1 ? a : j >= 2 && j <= 4 && (d < 12 || d > 14) ? b : c;
};

// losowanie
export const los = {
  int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  wybierz: (t) => t[Math.floor(Math.random() * t.length)],
  tasuj: (t) => { const a = [...t]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
};
