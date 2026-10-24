// Dźwięki interfejsu — te same pliki co w Biologii (spis i głośności: ~/Projekty/biologoza/DZWIEKI.md).
// Każdy ma głośność i listę plików: pierwszy istniejący gra; bez pliku = cisza.
// Brak pliku albo blokada odtwarzania nie psuje gry.
import { dzwiek } from './store.js';

const PRZYCISKI = 0.35, PYTANIA = 0.5, ODPOWIEDZI = 0.8, WYNIKI = 0.85;
const DZWIEKI = {
  // 1. przyciski
  przycisk: [PRZYCISKI, 'przycisk.mp3', 'klik-klocek.mp3'],
  wybor: [PRZYCISKI, 'wybor.mp3', 'klik-klocek.mp3'],
  cofnij: [PRZYCISKI, 'cofnij.mp3', 'klik-cofniecie.mp3'],
  para: [PRZYCISKI, 'para.mp3', 'wybor.mp3', 'klik-klocek.mp3'],
  przelacznik: [PRZYCISKI, 'przelacznik.mp3', 'przycisk.mp3', 'klik-klocek.mp3'],
  // 2. pytania i okienka
  'start-bloku': [PYTANIA, 'start-bloku.mp3'],
  odslon: [PYTANIA, 'odslon.mp3', 'przycisk.mp3'],
  podpowiedz: [PYTANIA, 'podpowiedz.mp3'],
  okno: [PYTANIA, 'okno.mp3'],
  'nowe-pytanie': [PRZYCISKI, 'nowe-pytanie.mp3'], // gra przy każdym pytaniu — cicho
  // 3. dobre odpowiedzi
  dobrze: [ODPOWIEDZI, 'dobrze.mp3', 'dobra-odpowiedz-podstawowa.mp3'],
  'seria-5': [ODPOWIEDZI, 'seria-5.mp3', 'trzy-dobre-odpowiedzi.mp3'],
  'seria-10': [ODPOWIEDZI, 'seria-10.mp3', 'piec-dobrych-odpowiedzi.mp3'],
  // 4. złe odpowiedzi
  zle: [ODPOWIEDZI, 'zle.mp3', 'zla-odpowiedz.mp3'],
  'jeszcze-nie': [ODPOWIEDZI, 'jeszcze-nie.mp3'],
  'powrot-pytania': [PYTANIA, 'powrot-pytania.mp3'],
  // 5. wyniki
  'blok-gotowy': [WYNIKI, 'blok-gotowy.mp3', 'dobra-odpowiedz-podstawowa.mp3'],
  'blok-idealny': [WYNIKI, 'blok-idealny.mp3', 'trzy-dobre-odpowiedzi.mp3'],
  'lekcja-gotowa': [WYNIKI, 'lekcja-gotowa.mp3', 'dobra-odpowiedz-podstawowa.mp3'],
  'bez-bledow': [WYNIKI, 'bez-bledow.mp3', 'piec-dobrych-odpowiedzi.mp3'],
  wyslano: [WYNIKI, 'wyslano.mp3'],
};
// Wojtek 2026-10-12: „za dużo dźwięków” — te zostają w spisie i w audio/, ale nie grają.
// Żeby któryś przywrócić, wystarczy usunąć go z tej listy.
const WYCISZONE = new Set(['przycisk', 'nowe-pytanie', 'start-bloku', 'okno', 'powrot-pytania']);
const gotowe = {}; // nazwa → Audio z pierwszym działającym plikiem (null = cisza)

function zaladuj(nazwa) {
  if (nazwa in gotowe) return gotowe[nazwa];
  const [glosnosc = 0, ...pliki] = DZWIEKI[nazwa] || [];
  if (!pliki.length) return (gotowe[nazwa] = null);
  let i = 0;
  const a = new Audio('audio/' + pliki[0]);
  a.preload = 'auto';
  a.volume = glosnosc;
  // brak pliku → następny z listy; jeśli właśnie miał zagrać, gra zapasowy od razu
  a.onerror = () => {
    if (++i >= pliki.length) { gotowe[nazwa] = null; return; }
    a.src = 'audio/' + pliki[i];
    a.load();
    if (Date.now() - (a.chce || 0) < 1500) a.play().catch(() => {});
  };
  return (gotowe[nazwa] = a);
}

export function graj(nazwa) {
  if (!dzwiek() || WYCISZONE.has(nazwa)) return;
  const a = zaladuj(nazwa);
  if (!a) return;
  a.chce = Date.now();
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* nic */ }
}

// przy pierwszym dotknięciu wczytujemy wszystkie, żeby nic nie czekało i zapasy były już ustalone
export function przygotujDzwieki() {
  for (const n of Object.keys(DZWIEKI)) if (!WYCISZONE.has(n)) zaladuj(n);
}
