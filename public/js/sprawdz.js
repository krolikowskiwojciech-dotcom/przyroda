// Ocena odpowiedzi. Wspólne dla aplikacji i narzędzia (narzędzie sprawdza, czy podana odpowiedź przechodzi).
// Rodzaje zadań (pole „kind”): wybor, pf (prawda/fałsz), wpisz (pojęcie z klawiatury), kolejnosc, pary.

const BEZ_OGONKOW = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
export const normuj = (t) => String(t ?? '').toLowerCase().normalize('NFC')
  .replace(/[–—‑-]+/g, '-').replace(/\s*-\s*/g, '-').replace(/[.,;:!?"„”']+$/g, '').replace(/\s+/g, ' ').trim();
const bezOgonkow = (t) => normuj(t).replace(/[ąćęłńóśźż]/g, (c) => BEZ_OGONKOW[c]);

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

export const PF = ['Prawda', 'Fałsz'];
export const opcjeWyboru = (cz) => (cz.kind === 'pf' ? PF : cz.choices);
export const dobraOdpowiedz = (cz) => (cz.kind === 'pf' ? (cz.a ? 'Prawda' : 'Fałsz') : cz.a);

// { ok: bool, uwaga?: tekst } — uwaga, gdy odpowiedź przechodzi, ale z drobną poprawką pisowni
export function ocen(cz, odp) {
  switch (cz.kind) {
    case 'wybor':
    case 'pf':
      return { ok: odp === dobraOdpowiedz(cz) };
    case 'wpisz': {
      const o = normuj(odp);
      if (!o) return { ok: false };
      const dobre = [cz.a, ...(cz.inne || [])];
      if (dobre.some((x) => normuj(x) === o)) return { ok: true };
      if (dobre.some((x) => bezOgonkow(x) === bezOgonkow(o))) return { ok: true, uwaga: `Uważaj na polskie litery: ${cz.a}` };
      // literówka: 1 znak przy krótkich słowach, 2 przy długich — wiedza się liczy, pisownię pokazujemy
      const tol = o.length >= 10 ? 2 : o.length >= 5 ? 1 : 0;
      if (tol && dobre.some((x) => levenshtein(bezOgonkow(x), bezOgonkow(o)) <= tol)) return { ok: true, uwaga: `Mała literówka. Poprawnie: ${cz.a}` };
      return { ok: false };
    }
    case 'kolejnosc':
      // odp = lista elementów w kolejności ułożonej przez dziecko
      return { ok: Array.isArray(odp) && odp.length === cz.elementy.length && odp.every((x, i) => x === cz.elementy[i]) };
    case 'pary': {
      // odp = { lewy: prawy }
      const zle = cz.pary.filter(([l, p]) => odp?.[l] !== p).length;
      return { ok: zle === 0, zle };
    }
    default:
      return { ok: false };
  }
}

// zadanie z zestawu → jednolity kształt { q?, obraz?, czesci: [...] }
export function wCzesci(z) {
  if (z.czesci) return z;
  const { q, obraz, klucz, ...cz } = z;
  return { q, obraz, klucz, czesci: [cz] };
}

// tekst odpowiedzi do podsumowania i SMS-a
export function pokaz(cz, odp) {
  if (cz.kind === 'kolejnosc') return (odp || []).join(' → ');
  if (cz.kind === 'pary') return cz.pary.map(([l]) => `${l} – ${odp?.[l] ?? '?'}`).join('; ');
  return String(odp ?? '');
}
export function poprawna(cz) {
  if (cz.kind === 'kolejnosc') return cz.elementy.join(' → ');
  if (cz.kind === 'pary') return cz.pary.map(([l, p]) => `${l} – ${p}`).join('; ');
  return dobraOdpowiedz(cz);
}
