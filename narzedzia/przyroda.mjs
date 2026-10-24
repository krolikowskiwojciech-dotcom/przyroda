#!/usr/bin/env node
// Narzędzie przedmiotu (wspólne dla Przyrody i Historii — ustawienia w public/js/przedmiot.js).
//   node narzedzia/<przedmiot>.mjs importuj [--na-sucho] [--bez-nagran]
//                                  — lekcje z lekcje-audio (iCloud, folder z przedmiot.js) → public/zestawy/;
//                                    nagrania → Cloudflare KV ogarnijmaterial.pl (wrangler, bez GitHuba)
//        --na-sucho    nagrań nie wysyła, tylko pokazuje, które są w KV, a których brakuje / są inne
//        --bez-nagran  w ogóle nie sprawdza nagrań
//   node narzedzia/<przedmiot>.mjs sprawdz [id]   — kontrola zestawów (blokuje publikację)
//   node narzedzia/<przedmiot>.mjs katalog        — sprawdza wszystko i przebudowuje public/zestawy/indeks.json
//   node narzedzia/<przedmiot>.mjs wyniki         — ostatnie próby z Cloudflare KV (plik:<przedmiot>-dane/profile/<id>.json)
//
// Z lekcje-audio import bierze pytania, ściągę i definicje (skrypty/<id>.json — własne słowa), a gdy JSON-a jeszcze nie ma,
// same pytania z nagrania (skrypty/<id>_pytania.md). Nagrania („do nauki z podręcznikiem” i ewentualne krótkie _www)
// są blisko tekstu książki albo nigdzie niepublikowane, więc trafiają WYŁĄCZNIE do prywatnego magazynu: Cloudflare KV „DANE”
// Workera ogarnijmaterial.pl, klucz plik:<przedmiot>-dane/nagrania/<plik>.mp3 (aplikacja czyta je przez
// https://ogarnijmaterial.pl/api/gh/…, bez tokenów). Publiczne repo i strona nie mają żadnego nagrania ani skanu.
// Niczego nie czyta z „Ucz się sprytniej” ani z folderu uczsiesprytniej/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ocen, wCzesci, normuj, opcjeWyboru, dobraOdpowiedz } from '../public/js/sprawdz.js';
import { PRZEDMIOT } from '../public/js/przedmiot.js';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(KORZEN, 'public');
const ZESTAWY = path.join(PUBLIC, 'zestawy');
const ICLOUD = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/Audio - do nauki ');
const LEKCJE = path.join(ICLOUD, 'lekcje-audio', PRZEDMIOT.folder);
const PROFILE = [PRZEDMIOT.profil];
const ZNAK = PRZEDMIOT.profil.znak; // pliki lekcji kończą się na _<znak> (Aniela: _A)
const KOLORY = ['brzoskwinia', 'mietowy', 'lila', 'zolty', 'niebieski', 'rozowy', 'krem'];
const IKONY = PRZEDMIOT.ikony;
const RODZAJE = ['wybor', 'pf', 'wpisz', 'kolejnosc', 'pary', 'otwarte'];
const PLIK_SPISU = path.join(ZESTAWY, 'spis.json');
let SPIS = fs.existsSync(PLIK_SPISU) ? JSON.parse(fs.readFileSync(PLIK_SPISU, 'utf8')) : { dzialy: [] };

// ---------- kontrola zestawu ----------
function sprawdzCzesc(cz, gdzie, bledy) {
  const b = (t) => bledy.push(`${gdzie}: ${t}`);
  if (!RODZAJE.includes(cz.kind)) return b(`nieznany rodzaj „${cz.kind}”`);
  if (!cz.e && cz.kind !== 'pary' && cz.kind !== 'kolejnosc') b('brak treści pytania (e)');
  switch (cz.kind) {
    case 'wybor': {
      const o = opcjeWyboru(cz) || [];
      if (o.length < 2) b('za mało odpowiedzi do wyboru');
      if (new Set(o.map(normuj)).size !== o.length) b('powtórzone odpowiedzi do wyboru');
      if (!o.includes(cz.a)) b(`poprawnej odpowiedzi „${cz.a}” nie ma wśród opcji`);
      break;
    }
    case 'pf': if (typeof cz.a !== 'boolean') b('pf: „a” musi być true albo false'); break;
    case 'wpisz':
      if (!String(cz.a || '').trim()) b('wpisz: brak odpowiedzi');
      if ((cz.e.match(/___/g) || []).length > 1) b('wpisz: więcej niż jedna luka „___”');
      break;
    case 'kolejnosc':
      if (!(cz.elementy?.length >= 3)) b('kolejnosc: potrzeba co najmniej 3 elementów');
      else if (new Set(cz.elementy).size !== cz.elementy.length) b('kolejnosc: powtórzone elementy');
      break;
    case 'pary':
      if (!(cz.pary?.length >= 2)) b('pary: potrzeba co najmniej 2 par');
      else if (new Set(cz.pary.map(([l]) => l)).size !== cz.pary.length || new Set(cz.pary.map(([, p]) => p)).size !== cz.pary.length) b('pary: powtórzone elementy');
      break;
    case 'otwarte': if (!String(cz.a || '').trim()) b('otwarte: brak wzorcowej odpowiedzi'); break;
  }
  if (cz.kind !== 'otwarte' && !(cz.exp?.length || cz.zrodlo)) b('brak wyjaśnienia (exp) albo źródła — po błędzie nie byłoby czego pokazać');
  // wyrocznia: wzorcowa odpowiedź musi przejść, a każda inna opcja — nie
  if (cz.kind === 'wybor' || cz.kind === 'pf') {
    if (!ocen(cz, dobraOdpowiedz(cz)).ok) b('wzorcowa odpowiedź nie przechodzi oceny');
    for (const o of opcjeWyboru(cz) || []) if (o !== dobraOdpowiedz(cz) && ocen(cz, o).ok) b(`zła opcja „${o}” przechodzi ocenę`);
  }
  if (cz.kind === 'wpisz') {
    for (const x of [cz.a, ...(cz.inne || [])]) if (!ocen(cz, x).ok) b(`forma „${x}” nie przechodzi oceny`);
  }
  if (cz.kind === 'kolejnosc' && cz.elementy?.length >= 3 && (!ocen(cz, cz.elementy).ok || ocen(cz, [...cz.elementy].reverse()).ok)) b('kolejnosc: ocena nie działa');
  if (cz.kind === 'pary' && cz.pary?.length >= 2 && !ocen(cz, Object.fromEntries(cz.pary)).ok) b('pary: ocena nie działa');
}

export function sprawdzZestaw(z) {
  const bledy = [];
  let zadan = 0;
  if (!z.id || !z.tytul) bledy.push('brak id albo tytułu');
  for (const p of [].concat(z.dla || [])) if (!PROFILE.some((x) => x.id === p)) bledy.push(`${z.id}: nieznany profil „${p}”`);
  if (!z.bloki?.length) bledy.push(`${z.id}: brak bloków`);
  if (z.ikona && !IKONY.includes(z.ikona)) bledy.push(`${z.id}: nieznana ikona „${z.ikona}” (są: ${IKONY.join(', ')})`);
  for (const n of z.nagrania || []) {
    if (n.plik && !fs.existsSync(path.join(PUBLIC, n.plik))) bledy.push(`${z.id}: brak pliku nagrania ${n.plik}`);
    if (!n.plik && !n.prywatne) bledy.push(`${z.id}: nagranie bez pliku`);
  }
  for (const o of z.obrazy || []) if (!fs.existsSync(path.join(PUBLIC, o.plik))) bledy.push(`${z.id}: brak obrazka ${o.plik}`);
  // zestaw z działem musi trafić w lekcję ze spisu podręcznika — inaczej nie pojawi się w swoim dziale na liście
  if (z.dzial) {
    const d = SPIS.dzialy.find((x) => x.nr === z.dzial);
    if (!d) bledy.push(`${z.id}: działu „${z.dzial}” nie ma w zestawy/spis.json`);
    else if (!d.lekcje.some((l) => (z.typ ? l.typ === z.typ : !l.typ && l.nr === z.lekcja))) bledy.push(`${z.id}: w dziale ${z.dzial} nie ma ${z.typ ? `pozycji „${z.typ}”` : `lekcji nr ${z.lekcja}`} (zestawy/spis.json)`);
  }
  const idBlokow = new Set();
  for (const b of z.bloki || []) {
    if (idBlokow.has(b.id)) bledy.push(`${z.id}: powtórzone id bloku „${b.id}”`);
    idBlokow.add(b.id);
    if (!b.zadania?.length) bledy.push(`${z.id}/${b.id}: brak zadań`);
    const teksty = new Set();
    (b.zadania || []).forEach((zad, i) => {
      const w = wCzesci(zad);
      if (w.obraz && !fs.existsSync(path.join(PUBLIC, w.obraz))) bledy.push(`${z.id}/${b.id}#${i + 1}: brak obrazka ${w.obraz}`);
      w.czesci.forEach((cz, j) => {
        zadan++;
        sprawdzCzesc(cz, `${z.id}/${b.id}#${i + 1}${w.czesci.length > 1 ? String.fromCharCode(97 + j) : ''}`, bledy);
        const t = normuj([w.q, cz.e].join(' '));
        if (teksty.has(t)) bledy.push(`${z.id}/${b.id}#${i + 1}: powtórzone pytanie`);
        teksty.add(t);
      });
    });
  }
  return { bledy, zadan };
}

function wczytajZestawy() {
  if (!fs.existsSync(ZESTAWY)) return [];
  return fs.readdirSync(ZESTAWY).filter((f) => f.endsWith('.json') && f !== 'indeks.json' && f !== 'spis.json').sort()
    .map((f) => {
      const z = JSON.parse(fs.readFileSync(path.join(ZESTAWY, f), 'utf8'));
      if (z.id + '.json' !== f) throw new Error(`${f}: id „${z.id}” musi być takie jak nazwa pliku`);
      return z;
    });
}

function sprawdzWszystko(tylko) {
  let wszystkieBledy = [];
  const zestawy = wczytajZestawy().filter((z) => !tylko || z.id === tylko);
  for (const z of zestawy) {
    const { bledy, zadan } = sprawdzZestaw(z);
    console.log(`${bledy.length ? '✗' : '✓'} ${z.id}: ${z.bloki.length} bloków, ${zadan} pytań`);
    for (const b of bledy.slice(0, 25)) console.log('   ✗ ' + b);
    wszystkieBledy = wszystkieBledy.concat(bledy);
  }
  if (!zestawy.length) console.log('(jeszcze nie ma żadnej lekcji)');
  return { zestawy, bledy: wszystkieBledy };
}

// ---------- import z lekcje-audio ----------
// deterministyczne „losowanie” (ten sam wynik przy każdym imporcie — bez szumu w gicie)
const ziarno = (t) => crypto.createHash('sha1').update(t).digest().readUInt32BE(0);
function tasujStale(lista, klucz) {
  const a = [...lista];
  let s = ziarno(klucz);
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// w definicji zasłaniamy samo pojęcie (i jego odmiany), żeby pytanie nie podpowiadało odpowiedzi
function zaslon(def, termin) {
  let t = def;
  for (const slowo of termin.split(/[\s-]+/).filter((x) => x.length >= 4)) {
    const rdzen = slowo.slice(0, Math.max(4, slowo.length - 3)).toLowerCase();
    t = t.replace(new RegExp(`(?<![\\p{L}])${rdzen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{L}*`, 'giu'), '…');
  }
  return t;
}
const czasNagrania = (plik) => { try { const m = execFileSync('afinfo', [plik], { encoding: 'utf8' }).match(/estimated duration: ([\d.]+)/); return m ? Math.round(Number(m[1]) / 60) : null; } catch { return null; } };
const shaBloba = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const RZYMSKIE = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// mowa nie potrzebuje 128 kb/s: 64 kb/s mono to połowa rozmiaru, telefon pobiera dwa razy szybciej.
// -bitexact = ten sam plik przy każdym imporcie (bez ponownego wysyłania). Plik pośredni w katalogu tymczasowym systemu.
function lekkie(zrodlo) {
  const kat = path.join(os.tmpdir(), `${PRZEDMIOT.id}-mp3`);
  fs.mkdirSync(kat, { recursive: true });
  const cel = path.join(kat, shaBloba(fs.readFileSync(zrodlo)).slice(0, 16) + '.mp3');
  if (!fs.existsSync(cel)) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', zrodlo, '-ac', '1', '-ar', '44100', '-b:a', '64k',
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', cel]);
  }
  return cel;
}

// ---------- nagrania → Cloudflare KV (ogarnijmaterial.pl) ----------
// Worker ~/Projekty/ogarnijmaterial trzyma dane przedmiotów w KV „DANE” pod kluczem plik:<przedmiot>-dane/<ścieżka>
// (wartość = bajty pliku, metadata { sha: SHA-1 treści, size: bajty }) i oddaje je aplikacji w kształcie API GitHuba.
// Wysyłamy wranglerem zalogowanym na tym Macu; plik, którego sha i rozmiar w KV już się zgadzają, pomijamy.
const OGARNIJ = path.join(os.homedir(), 'Projekty/ogarnijmaterial');
const KV_DANE = '4ce78837c417478ba7bf3d1d8b39444b';
const KV_REPO = `${PRZEDMIOT.id}-dane`;
const KV_LIMIT = 25 * 1024 * 1024; // limit jednej wartości KV
const shaTresci = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function wrangler(args) {
  if (!fs.existsSync(path.join(OGARNIJ, 'wrangler.jsonc'))) throw new Error(`Nie widzę projektu Workera: ${OGARNIJ}`);
  try {
    return execFileSync('npx', ['-y', 'wrangler@4', ...args], { cwd: OGARNIJ, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { throw new Error(`wrangler ${args.slice(0, 3).join(' ')} nie przeszedł (zalogowany? npx wrangler@4 whoami):\n${e.stderr || e.message}`); }
}
let listaKV = null;
function nagraniaWKV({ odswiez } = {}) {
  if (!listaKV || odswiez) {
    const out = wrangler(['kv', 'key', 'list', '--namespace-id', KV_DANE, '--remote', '--prefix', `plik:${KV_REPO}/nagrania/`]);
    listaKV = new Map(JSON.parse(out.slice(out.indexOf('['))).map((k) => [k.name.slice(`plik:${KV_REPO}/`.length), k.metadata || {}]));
  }
  return listaKV;
}
const wyslaneDoKV = [];
function wyslijDoKV(lokalny, sciezka, { naSucho } = {}) {
  const buf = fs.readFileSync(lokalny);
  const meta = { sha: shaTresci(buf), size: buf.length };
  if (meta.size > KV_LIMIT) throw new Error(`${sciezka}: ${(meta.size / 1048576).toFixed(1)} MiB — więcej niż limit wartości KV (25 MiB)`);
  const stary = nagraniaWKV().get(sciezka);
  if (stary?.sha === meta.sha && stary?.size === meta.size) return 'bez zmian';
  if (naSucho) return `${stary ? 'inne niż w KV' : 'brak w KV'} — do wysłania (na sucho, nic nie wysłane)`;
  wrangler(['kv', 'key', 'put', '--namespace-id', KV_DANE, '--remote', `plik:${KV_REPO}/${sciezka}`, '--path', lokalny, '--metadata', JSON.stringify(meta)]);
  wyslaneDoKV.push([sciezka, meta]);
  return stary ? 'zaktualizowane' : 'wysłane';
}
// po wysyłce: lista KV jeszcze raz — każde wysłane nagranie musi mieć w KV dokładnie tę sumę i rozmiar
function sprawdzWyslane() {
  if (!wyslaneDoKV.length) return;
  const kv = nagraniaWKV({ odswiez: true });
  const zle = wyslaneDoKV.filter(([s, m]) => kv.get(s)?.sha !== m.sha || kv.get(s)?.size !== m.size);
  if (zle.length) throw new Error(`Po wysyłce KV nie zgadza się dla: ${zle.map(([s]) => s).join(', ')}`);
  console.log(`\nCloudflare KV: nagrania wysłane i sprawdzone — ${wyslaneDoKV.length}.`);
}

// pytania z nagrania (skrypty/<id>_pytania.md), gdy pełnego JSON-a jeszcze nie ma:
//   1. **Pytanie?** (dopisek)
//      - Odpowiedź: … / - Błąd: … / - Źródło: …
// Litery odpowiedzi z książki („D — …”) odcinamy — aplikacja nie pokazuje opcji A–D; błąd, który bez nich jest niezrozumiały, pomijamy.
function pytaniaZMd(tekst) {
  const wynik = [];
  for (const kawalek of tekst.split(/\n(?=\d+\.\s+\*\*)/)) {
    const m = /^\d+\.\s+\*\*(.+?)\*\*/.exec(kawalek.trim());
    if (!m) continue;
    const pole = (nazwa) => (new RegExp(`^\\s*-\\s*${nazwa}:\\s*(.+)$`, 'mi').exec(kawalek)?.[1] || '').trim();
    const odpowiedz = pole('Odpowiedź').replace(/^[A-D]\s*[—–-]\s*/, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    let blad = pole('Błąd').replace(/^[A-D]\s*[—–-]\s*/, '');
    if (/^[—–-]/.test(blad) || /nie wymyślamy|nie podaje/i.test(blad) || /(^|[\s,;(])[A-D](?=[\s,;)]|$)/.test(blad)) blad = '';
    if (odpowiedz) wynik.push({ pytanie: m[1].trim(), odpowiedz, blad: blad.replace(/\.$/, '') || undefined, zrodlo: pole('Źródło').replace(/\.$/, '') || undefined });
  }
  return wynik;
}

const pozycjaSpisu = (dzial, lekcja, typ) => SPIS.dzialy.find((d) => d.nr === dzial)?.lekcje.find((l) => (typ ? l.typ === typ : !l.typ && l.nr === lekcja));
// nowa lekcja spoza spisu → dopisujemy ją do spisu (dział i pozycję), żeby pokazała się na liście w swoim dziale
function dopiszDoSpisu(z) {
  if (!z.dzial || pozycjaSpisu(z.dzial, z.lekcja, z.typ)) return;
  let d = SPIS.dzialy.find((x) => x.nr === z.dzial);
  if (!d) {
    d = { nr: z.dzial, tytul: z.dzialTytul || '', lekcje: [] };
    SPIS.dzialy.push(d);
    SPIS.dzialy.sort((a, b) => RZYMSKIE.indexOf(a.nr) - RZYMSKIE.indexOf(b.nr));
  }
  d.lekcje.push(z.typ ? { typ: z.typ, temat: z.tytul, strony: z.strony || '' } : { nr: z.lekcja, temat: z.tytul, strony: z.strony || '' });
  const waga = (l) => (l.typ === 'podsumowanie' ? 1000 : l.typ === 'test' ? 1001 : l.nr);
  d.lekcje.sort((a, b) => waga(a) - waga(b));
  fs.writeFileSync(PLIK_SPISU, JSON.stringify(SPIS, null, 2) + '\n');
  console.log(`   spis: dopisano dział ${z.dzial}, ${z.typ || `lekcja ${z.lekcja}`} — „${z.tytul}” (popraw temat i strony w public/zestawy/spis.json, jeśli trzeba)`);
}

function importuj({ bezNagran, naSucho }) {
  if (!fs.existsSync(LEKCJE)) {
    console.log(`Brak folderu lekcji ${PRZEDMIOT.dopelniacz} w lekcje-audio: ${LEKCJE}\nNic do importu — aplikacja pokazuje „Jeszcze nie ma lekcji”.`);
    return;
  }
  fs.mkdirSync(ZESTAWY, { recursive: true });
  const koncowka = new RegExp(`_${ZNAK}\\.json$`);
  const koncowkaMd = new RegExp(`_${ZNAK}_pytania\\.md$`);
  const pliki = fs.readdirSync(LEKCJE).filter((d) => d.startsWith('Dział')).flatMap((d) => {
    const s = path.join(LEKCJE, d, 'skrypty');
    if (!fs.existsSync(s)) return [];
    const wszystkie = fs.readdirSync(s);
    const json = wszystkie.filter((f) => koncowka.test(f)).map((f) => ({ dzialDir: path.join(LEKCJE, d), plik: path.join(s, f), id: f.replace(/\.json$/, '') }));
    // same pytania z nagrania — tylko gdy nie ma JSON-a tej lekcji
    const md = wszystkie.filter((f) => koncowkaMd.test(f) && !wszystkie.includes(f.replace(/_pytania\.md$/, '.json')))
      .map((f) => ({ dzialDir: path.join(LEKCJE, d), plik: path.join(s, f), id: f.replace(/_pytania\.md$/, ''), md: true }));
    return [...json, ...md];
  });
  if (!pliki.length) console.log(`W ${LEKCJE} nie ma jeszcze skryptów lekcji (skrypty/*_${ZNAK}.json albo *_${ZNAK}_pytania.md).`);
  let i = 0;
  for (const { dzialDir, plik, id: idLekcji, md } of pliki.sort((a, b) => a.id.localeCompare(b.id))) {
    const ze = /_dz(\d+)_l(\d+)_(.+)$/.exec(idLekcji.replace(new RegExp(`_${ZNAK}$`), ''));
    const slug = ze?.[3] || '';
    const typ = /podsumowanie/.test(slug) ? 'podsumowanie' : /(^|-)(test|sprawdz)/.test(slug) ? 'test' : null;
    const L = md ? { id: idLekcji, pytania: pytaniaZMd(fs.readFileSync(plik, 'utf8')), dzial: ze ? RZYMSKIE[Number(ze[1])] : null, lekcja_nr: ze ? Number(ze[2]) : null }
      : JSON.parse(fs.readFileSync(plik, 'utf8'));
    const id = idLekcji.replace(new RegExp(`_${ZNAK}$`), '').replace(/_/g, '-');
    const dzial = L.dzial || (ze ? RZYMSKIE[Number(ze[1])] : null);
    const nr = typ ? null : Number(L.lekcja_nr) || (ze ? Number(ze[2]) : null);
    const wSpisie = dzial ? pozycjaSpisu(dzial, nr, typ) : null;
    // tytuł jak w podręczniku (ze spisu), a tytuł z lekcje-audio jako opis — Aniela szuka lekcji po tytule z książki
    const tytul = wSpisie?.temat || L.tytul || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const opis = !md && L.tytul && L.tytul !== tytul ? L.tytul : undefined;
    const sciezkaZestawu = path.join(ZESTAWY, id + '.json');
    const stary = fs.existsSync(sciezkaZestawu) ? JSON.parse(fs.readFileSync(sciezkaZestawu, 'utf8')) : null;
    if (stary && stary.zrodlo !== 'lekcje-audio') { console.log(`! ${id}: zestaw zrobiony ręcznie — pomijam`); continue; }
    if (!L.pytania?.length) { console.log(`! ${id}: brak pytań — pomijam`); continue; }

    const P = (t) => L.pytania.filter((p) => (p.typ || 'otwarte') === t);
    const exp = (p) => [p.odpowiedz, p.blad ? `Częsty błąd: ${p.blad}` : null].filter(Boolean);
    const terminy = Object.keys(L.definicje || {});
    const bloki = [];
    if (terminy.length >= 3) {
      bloki.push({ id: 'pojecia', tytul: 'Pojęcia z lekcji', polecenie: 'Które pojęcie pasuje do opisu?', ile: Math.min(8, terminy.length),
        zadania: terminy.map((t) => {
          // bez opcji, które też byłyby dobre („elementy” przy „elementy ożywione”)
          const zawiera = (a, b) => ` ${normuj(a)} `.includes(` ${normuj(b)} `);
          const inne = tasujStale(terminy.filter((x) => !zawiera(x, t) && !zawiera(t, x)), t).slice(0, 2);
          return { kind: 'wybor', e: zaslon(L.definicje[t], t), a: t, choices: [t, ...inne], exp: inne.map((x) => `${x} to coś innego: ${L.definicje[x]}`) };
        }) });
    }
    if (P('wybor').length) bloki.push({ id: 'wybor', tytul: 'Test wyboru', polecenie: 'Wybierz poprawną odpowiedź.',
      zadania: P('wybor').map((p) => ({ kind: 'wybor', e: p.pytanie, a: p.opcje[p.poprawna], choices: p.opcje, exp: exp(p), zrodlo: p.zrodlo })) });
    if (P('tak-nie').length) bloki.push({ id: 'prawda-falsz', tytul: 'Prawda czy fałsz', polecenie: 'Czy to zdanie jest prawdziwe?',
      zadania: P('tak-nie').map((p) => ({ kind: 'pf', e: p.pytanie, a: !!p.poprawna, exp: exp(p), zrodlo: p.zrodlo })) });
    if (P('uzupelnij').length) bloki.push({ id: 'uzupelnij', tytul: 'Uzupełnij', polecenie: 'Wpisz brakujące pojęcie.',
      zadania: P('uzupelnij').map((p) => ({ kind: 'wpisz', e: p.pytanie, a: p.odpowiedzi[0], inne: p.odpowiedzi.slice(1), exp: exp(p), zrodlo: p.zrodlo })) });
    if (P('otwarte').length) bloki.push({ id: 'pytania', tytul: md ? 'Pytania z nagrania' : 'Pytania z podręcznika', polecenie: 'Odpowiedz w myślach albo na głos, potem sprawdź.',
      zadania: P('otwarte').map((p) => ({ kind: 'otwarte', e: p.pytanie, a: p.odpowiedz, blad: p.blad, zrodlo: p.zrodlo })) });

    // nagrania: wszystkie tylko w Cloudflare KV (prywatne) — pełne „do nauki z podręcznikiem” i ewentualne krótkie _www
    const nagrania = [];
    const zrodla = [
      [path.join(dzialDir, 'audio/do-nauki-z-podrecznikiem', `${L.id}.mp3`), `nagrania/${id}.mp3`, 'Lekcja z podręcznikiem', 'Słuchaj i patrz do książki'],
      [path.join(dzialDir, 'audio/na-strone', `${L.id}_www.mp3`), `nagrania/${id}-krotkie.mp3`, 'Krótka powtórka', 'Najważniejsze z lekcji, bez książki'],
    ];
    for (const [zrodlo, cel, tytulN, opis] of zrodla) {
      if (!fs.existsSync(zrodlo)) continue;
      const lekki = lekkie(zrodlo);
      const wynik = bezNagran ? 'pominięte (--bez-nagran)' : `Cloudflare KV: ${wyslijDoKV(lekki, cel, { naSucho })}`;
      console.log(`   nagranie ${cel} → ${wynik}`);
      nagrania.push({ tytul: tytulN, opis, prywatne: cel, wersja: shaBloba(fs.readFileSync(lekki)).slice(0, 10), minuty: czasNagrania(zrodlo) });
    }

    const zestaw = {
      id, zrodlo: 'lekcje-audio', dla: [PRZEDMIOT.profil.id], tytul, opis,
      dzial, dzialTytul: L.dzial_tytul || null, lekcja: nr, typ: typ || undefined, strony: L.strony || wSpisie?.strony || null,
      dodano: stary?.dodano || L.data || new Date().toISOString().slice(0, 10), termin: stary?.termin || null,
      ikona: stary?.ikona || (PRZEDMIOT.ikonaTematu.find(([re]) => re.test(tytul)) || [, IKONY[i % IKONY.length]])[1],
      kolor: stary?.kolor || KOLORY[i % KOLORY.length],
      ocena: true,
      nagrania: nagrania.length ? nagrania : undefined,
      sciaga: L.sciaga, definicje: L.definicje,
      bloki,
    };
    fs.writeFileSync(sciezkaZestawu, JSON.stringify(zestaw, null, 2) + '\n');
    dopiszDoSpisu(zestaw);
    console.log(`${stary ? '↻' : '+'} ${id}${md ? ' (tylko pytania z nagrania)' : ''}: ${bloki.map((b) => `${b.tytul} ${b.zadania.length}`).join(', ')}; nagrania: ${nagrania.length}`);
    i++;
  }
}

function zbudujIndeks(zestawy) {
  fs.mkdirSync(ZESTAWY, { recursive: true });
  if (!fs.existsSync(PLIK_SPISU)) fs.writeFileSync(PLIK_SPISU, JSON.stringify(SPIS, null, 2) + '\n');
  const indeks = {
    profile: PROFILE,
    zestawy: zestawy.map((z) => ({
      id: z.id, tytul: z.tytul, opis: z.opis || '', dla: [].concat(z.dla), termin: z.termin || null, dodano: z.dodano || null,
      dzial: z.dzial || null, dzialTytul: z.dzialTytul || null, lekcja: z.lekcja || null, typ: z.typ || null, strony: z.strony || null,
      ikona: z.ikona || null, kolor: z.kolor || null, bloki: z.bloki.length,
      zadan: z.bloki.reduce((n, b) => n + (b.ile || b.zadania?.length || 0), 0),
      nagrania: z.nagrania?.length || 0, prywatne: z.nagrania?.find((n) => n.prywatne)?.prywatne || null, sciaga: !!z.sciaga?.length,
    })).sort((a, b) => String(b.dodano).localeCompare(String(a.dodano))),
  };
  fs.writeFileSync(path.join(ZESTAWY, 'indeks.json'), JSON.stringify(indeks, null, 2) + '\n');
  console.log(`\nindeks.json: ${indeks.zestawy.length} zestawów.`);
}

const [, , cmd = 'sprawdz', ...reszta] = process.argv;
const arg = reszta.find((x) => !x.startsWith('--'));
if (cmd === 'importuj') {
  importuj({ bezNagran: reszta.includes('--bez-nagran'), naSucho: reszta.includes('--na-sucho') });
  sprawdzWyslane();
  const { zestawy, bledy } = sprawdzWszystko();
  if (bledy.length) { console.error(`\nBŁĘDY: ${bledy.length}. Nie publikuj, dopóki nie znikną.`); process.exit(1); }
  zbudujIndeks(zestawy);
} else if (cmd === 'sprawdz' || cmd === 'katalog') {
  const { zestawy, bledy } = sprawdzWszystko(cmd === 'sprawdz' ? arg : null);
  if (bledy.length) { console.error(`\nBŁĘDY: ${bledy.length}. Nie publikuj, dopóki nie znikną.`); process.exit(1); }
  if (cmd === 'katalog') zbudujIndeks(zestawy); else console.log('\nWszystko się zgadza.');
} else if (cmd === 'wyniki') {
  for (const p of PROFILE) {
    let dane;
    try { dane = JSON.parse(wrangler(['kv', 'key', 'get', '--namespace-id', KV_DANE, '--remote', `plik:${KV_REPO}/profile/${p.id}.json`]).replace(/^[^{]*/, '')); }
    catch { console.log(`${p.imie}: brak wyników (jeszcze nic nie zapisano)`); continue; }
    console.log(`\n${p.imie} (klasa ${p.klasa}) — prób: ${dane.proby.length}`);
    for (const pr of dane.proby.slice(-15)) {
      const data = new Date(pr.d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
      console.log(`  ${data}  ${pr.tytul}${pr.przerwane ? ' (przerwane)' : ''}: ${pr.dobrze}/${pr.ile} za pierwszym razem, ${Math.round(pr.czas / 60)} min`);
      for (const b of pr.bloki) console.log(`     · ${b.tytul}: ${b.dobrze}/${b.ile}`);
      if (pr.bledy?.length) console.log(`     do powtórki: ${pr.bledy.map((x) => `${x.d} (odp. ${x.odp}; dobrze ${x.a})`).join(' | ')}`);
    }
  }
} else {
  console.log('Użycie: node narzedzia/<przedmiot>.mjs importuj [--na-sucho] [--bez-nagran] | sprawdz [id] | katalog | wyniki');
  process.exit(1);
}
