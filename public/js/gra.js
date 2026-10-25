// Przebieg zestawu: bloki ćwiczeń jeden po drugim, zła odpowiedź zatrzymuje grę i uczy (poprawna odpowiedź duża w karcie,
// trzeba ją przepisać, żeby przejść dalej), błędne zadanie wraca w tym samym bloku, na końcu podsumowanie i „Wyślij wynik”.
// Wygląd jak lekcja w Lingozie: pełny ekran w kolorze bloku, pasek postępu u góry, stopka z przyciskiem na dole.
//
// Rodzaje zadań: wybor, pf (prawda/fałsz), wpisz (luka „___” albo samo pytanie), kolejnosc, pary,
// otwarte (pytanie z podręcznika: najpierw odpowiedz w myślach, potem odsłoń i oceń się sam).

import { h, okno, odm, ik, kolor, los, pasekGory } from './dom.js';
import { PRZEDMIOT } from './przedmiot.js';
import { ocen, wCzesci, opcjeWyboru, pokaz, poprawna, dobraOdpowiedz, wzorPrzepisania, przepisanePoprawnie } from './sprawdz.js';
import { graj } from './dzwieki.js';

const BLOKADA_MS = 1200; // po błędzie przyciski chwilę śpią, żeby rozpędzony palec nie przeskoczył wyjaśnienia
const KOLORY_PAR = ['#C9C5F7', '#C5EFDC', '#F4EE90', '#F9D7AF', '#C0E4F5', '#F6C7EE', '#E5E0D4'];

// zadania jednego bloku na rundę: stałe z zestawu, potasowane, bez powtórek
export function zadaniaBloku(blok) {
  const stale = los.tasuj(blok.zadania || []).map(wCzesci);
  return stale.slice(0, blok.ile || stale.length);
}

const tekstZadania = (z, cz) => [z.q, cz.e].filter(Boolean).join(' ');
// luka „___” w zdaniu → wyróżnione puste miejsce (albo wpisana odpowiedź)
const zLuka = (t, wstaw) => {
  const cz = String(t).split('___');
  return cz.flatMap((x, i) => (i ? [h('span', { class: 'luka' + (wstaw ? ' pelna' : '') }, wstaw || ' '), x] : [x]));
};
const gwiazdki = (dobrze, ile) => (ile === 0 || dobrze === 0 ? 0 : dobrze === ile ? 3 : dobrze / ile >= 0.8 ? 2 : 1);
// gwiazdki w wynikach: kolorowe, rysowane SVG (bez emoji w interfejsie)
const GW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const pokazGwiazdki = (n, klasa = '') => h('span', { class: 'gwiazdki ' + klasa, 'aria-label': `${n} z 3 gwiazdek` },
  [1, 2, 3].map((i) => h('span', { class: i <= n ? 'gw' : 'gw gw-puste', html: GW })));
// przybliżona skala szkolna (procent dobrych odpowiedzi → ocena); szkoły mają podobne, nie identyczne progi
const SKALA = [[95, 6, 'celujący'], [85, 5, 'bardzo dobry'], [70, 4, 'dobry'], [50, 3, 'dostateczny'], [30, 2, 'dopuszczający'], [0, 1, 'niedostateczny']];
export const ocenaSzkolna = (dob, ile) => { const pr = ile ? (dob / ile) * 100 : 0; const [, o, n] = SKALA.find(([prog]) => pr >= prog); return { o, n, pr: Math.round(pr) }; };
const POCHWALY = ['Dobrze!', 'Super!', 'Brawo!', 'Tak jest!', 'Świetnie!', 'Pięknie!'];

/**
 * uruchom(kontener, { zestaw, bloki, profil, zadania?, tylkoBlok?, powtorka?, naKoniec(proba), powtorz(), jeszczeRaz(), wyjdz() })
 * bloki — lista bloków do przejścia; zadania — gotowe zadania (powtórka pomyłek) { idBloku: [zadania] }
 */
export function uruchom(el, opcje) {
  const { zestaw, profil } = opcje;
  const start = Date.now();
  const bloki = opcje.bloki.map((b) => ({
    blok: b,
    nr: zestaw.bloki.indexOf(b),
    kolejka: (opcje.zadania?.[b.id] || zadaniaBloku(b)).map((z) => ({ z, powtorka: false })),
    wyniki: [], // { dobrze, tekst, a, odp } — tylko pierwsze podejście do każdej części
  })).filter((b) => b.kolejka.length);

  let nrBloku = 0, poz = 0, czesc = 0, seria = 0, zablokowane = false, timer = null, klawisze = null;
  let stan = null; // stan bieżącego zadania (ułożona kolejność, pary, wybrany element…)
  document.body.classList.add('w-lekcji');

  const B = () => bloki[nrBloku];
  const pozycja = () => B().kolejka[poz];
  const czescTeraz = () => pozycja().z.czesci[czesc];
  const wszystkich = () => bloki.reduce((n, b) => n + b.kolejka.filter((x) => !x.powtorka).reduce((m, x) => m + x.z.czesci.length, 0), 0);
  const postep = () => {
    const razem = bloki.reduce((n, b) => n + b.kolejka.length, 0);
    const zrob = bloki.slice(0, nrBloku).reduce((n, b) => n + b.kolejka.length, 0) + poz;
    return Math.round((zrob / Math.max(1, razem)) * 100);
  };

  function ustawKlawisze(f) {
    if (klawisze) document.removeEventListener('keydown', klawisze);
    klawisze = f && ((e) => { if (!document.querySelector('.okno-tlo')) f(e); });
    if (klawisze) document.addEventListener('keydown', klawisze);
  }
  const sprzataj = () => { clearTimeout(timer); ustawKlawisze(null); };

  // wspólny szkielet ekranu lekcji
  function ekran({ tytul, tresc, stopka, klasaStopki = '', bezGory = false }) {
    el.className = `lekcja w-kolorze ${kolor(B()?.nr ?? 0)}`;
    el.replaceChildren(...[
      // „Wróć” zawsze w lewym górnym rogu: w trakcie ćwiczenia z potwierdzeniem (odpowiedzi zapisują się jako przerwane),
      // na podsumowaniu od razu do lekcji (wynik już zapisany)
      bezGory ? h('div', { class: 'lekcja-gora' }, pasekGory({ tekst: 'Wróć', onclick: () => opcje.wyjdz() }))
        : h('div', { class: 'lekcja-gora' },
          pasekGory({ tekst: 'Wróć', onclick: wroc }),
          h('div', { class: 'postep' }, h('div', { class: 'postep-wew', style: `width:${postep()}%` })),
          h('span', { class: 'licznik' }, `${nrBloku + 1}/${bloki.length}`)),
      tytul ? h('div', { class: 'lekcja-tytul serif' }, tytul) : null,
      h('div', { class: 'cw-pole' }, tresc),
      stopka ? h('div', { class: 'stopka ' + klasaStopki }, stopka) : null].filter(Boolean));
    el.querySelector('.cw-pole').scrollTop = 0;
  }
  const stopkaEl = () => el.querySelector('.stopka') || el.appendChild(h('div', { class: 'stopka' }));

  // wyjście z ćwiczenia przyciskiem „Wróć”: bez odpowiedzi nic nie przepada, inaczej pytamy
  // (miejsce w ćwiczeniu przepada, odpowiedzi zapisują się jako przerwana próba)
  async function wroc() {
    const odpowiedzi = bloki.reduce((n, b) => n + b.wyniki.length, 0);
    if (!odpowiedzi) { sprzataj(); return opcje.wyjdz(); }
    const w = await okno({ tytul: 'Wyjść z ćwiczenia?', tresc: `Odpowiedzi do tej pory (${odpowiedzi}) zapiszą się jako przerwane ćwiczenie, a następnym razem zaczniesz od początku.`,
      przyciski: [{ tekst: 'Ćwiczę dalej', wartosc: false, klasa: 'jasny' }, { tekst: 'Wyjdź', wartosc: true, klasa: 'czerwony' }] });
    if (!w) return;
    sprzataj();
    opcje.naKoniec(zbudujProbe(true));
    opcje.wyjdz();
  }

  // ---------- wstęp do bloku ----------
  function wstepBloku() {
    sprzataj();
    graj('start-bloku');
    const b = B().blok;
    const ile = B().kolejka.length;
    ekran({
      tresc: h('div', { class: 'gram-lekcja' },
        h('div', { class: 'kat-etykieta' }, `Blok ${nrBloku + 1} z ${bloki.length} · ${ile} ${odm(ile, 'pytanie', 'pytania', 'pytań')}`),
        h('h1', { class: 'wstep-tytul serif' }, b.tytul),
        b.polecenie ? h('p', { class: 'wstep-polecenie' }, b.polecenie) : null,
        b.jak ? h('div', { class: 'gram-krok' },
          h('div', { class: 'gram-klucz serif' }, 'Przypomnij sobie'),
          b.jak.intro ? h('p', { class: 'gram-tekst' }, b.jak.intro) : null,
          (b.jak.zasady || []).map(([t, opis]) => h('p', { class: 'gram-tekst' }, h('b', {}, t), ' — ', opis))) : null),
      stopka: h('button', { class: 'btn glowny szeroki', type: 'button', id: 'start-bloku', onclick: () => pokazZadanie() }, 'Zaczynam', ik('dalej')),
    });
    ustawKlawisze((e) => { if (e.key === 'Enter') { e.preventDefault(); pokazZadanie(); } });
    el.querySelector('#start-bloku').focus({ preventScroll: true });
  }

  // ---------- zadanie ----------
  const wcisnij = (e) => { const b = e.currentTarget; b.classList.add('wcisniety'); setTimeout(() => b.classList.remove('wcisniety'), 120); };
  const info = () => el.querySelector('.info');
  const podpowiedz = (t) => { const i = info(); i.textContent = t; i.className = 'info podpowiedz'; graj('podpowiedz'); };

  function pokazZadanie() {
    sprzataj();
    zablokowane = false;
    const { z, powtorka } = pozycja();
    const cz = czescTeraz();
    const b = B().blok;
    if (powtorka) graj('powrot-pytania'); else if (poz || czesc) graj('nowe-pytanie');
    const ile = B().kolejka.length;
    stan = {};
    const polecenie = powtorka ? 'Jeszcze raz to zadanie' : (cz.polecenie || b.polecenie || POLECENIA[cz.kind] || '');
    // karta jak wierzchnia z talii: nagłówek (blok, polecenie, licznik), kolorowy panel z pytaniem, miejsce na odpowiedź
    const dlugie = (cz.e || '').length + (z.q || '').length > 140;
    const karta = h('section', { class: 'zadanie-karta' },
      h('div', { class: 'karta-gora' },
        h('span', { class: 'karta-ikona', 'aria-hidden': 'true' }, ik(zestaw.ikona || PRZEDMIOT.ikony[0])),
        h('span', { class: 'karta-naglowek' }, h('b', { class: 'serif' }, b.tytul), h('small', {}, polecenie)),
        h('span', { class: 'karta-nr' }, `${Math.min(poz + 1, ile)}/${ile}`)),
      h('div', { class: 'pytanie-panel' + (dlugie ? ' dlugie' : '') },
        z.obraz ? h('img', { class: 'zadanie-obraz', src: z.obraz, alt: '' }) : null,
        z.q ? h('p', { class: 'tresc' }, zLuka(z.q)) : null,
        z.czesci.length > 1 ? h('p', { class: 'pytanie serif' }, h('b', {}, `${String.fromCharCode(97 + czesc)}) `), cz.e ? zLuka(cz.e) : null)
          : cz.e ? h('p', { class: 'pytanie serif' }, zLuka(cz.e)) : null),
      h('div', { class: 'odp-miejsce' }),
      h('p', { class: 'info', 'aria-live': 'polite' }));
    const widok = WIDOKI[cz.kind](cz, karta);
    ekran({
      tresc: [h('div', { class: 'karta-talia' }, karta), widok.tresc],
      stopka: widok.stopka,
    });
    widok.potem?.();
  }

  const POLECENIA = { wybor: 'Wybierz odpowiedź', pf: 'Prawda czy fałsz?', wpisz: 'Wpisz brakujące pojęcie', kolejnosc: 'Ułóż we właściwej kolejności', pary: 'Połącz w pary', otwarte: 'Odpowiedz w myślach' };

  const WIDOKI = {
    // wybór jednej odpowiedzi; pf = dwa przyciski obok siebie
    wybor(cz) {
      const opcje = cz.kind === 'pf' ? opcjeWyboru(cz) : los.tasuj(opcjeWyboru(cz));
      const pf = cz.kind === 'pf';
      ustawKlawisze((e) => {
        const n = Number(e.key) || 'abcd'.indexOf(e.key.toLowerCase()) + 1;
        if (n >= 1 && n <= opcje.length) sprawdz(opcje[n - 1]);
      });
      // odpowiedzi tuż pod kartą: przyciski 3D z literą (A, B, C) albo z ikoną przy prawdzie i fałszu
      return { tresc: h('div', { class: 'opcje' + (pf ? ' obok' : '') },
        opcje.map((c, i) => h('button', { class: 'opcja', type: 'button', 'data-wartosc': c, onpointerdown: wcisnij, onclick: () => sprawdz(c) },
          h('span', { class: 'litera' + (pf ? ' ikona' : ' serif') }, pf ? ik(c === 'Prawda' ? 'ptaszek' : 'zamknij') : 'ABCD'[i]),
          h('span', { class: 'opcja-txt' }, c),
          h('span', { class: 'opcja-znak', 'aria-hidden': 'true' })))) };
    },
    pf(cz, karta) { return WIDOKI.wybor(cz, karta); },

    // pojęcie z klawiatury telefonu (bez autokorekty — ona „poprawia” nazwy i pojęcia)
    // gdy zdanie ma lukę „___”, wpisuje się prosto w nią (na karcie), a nie w okienku pod spodem
    wpisz(cz, karta) {
      const luka = karta?.querySelector('.pytanie-panel .luka');
      const pole = h('input', { class: luka ? 'wpis-luka' : 'wpis', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Twoja odpowiedź', placeholder: luka ? '' : 'wpisz tutaj…',
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); sprawdz(); } },
        oninput: () => { const i = info(); if (i.classList.contains('podpowiedz')) { i.textContent = ''; i.className = 'info'; } } });
      if (luka) { pole.style.width = `${Math.max(5, Math.min(20, String(cz.a || '').length + 2))}ch`; luka.replaceWith(pole); }
      stan.pole = pole;
      return {
        stopka: [luka ? null : pole, h('button', { class: 'btn sprawdz szeroki', type: 'button', onpointerdown: wcisnij, onclick: () => sprawdz() }, 'Sprawdź')],
        potem: () => setTimeout(() => pole.focus(), 60),
      };
    },

    // dotykaj elementów po kolei; dotknięcie ułożonego zdejmuje go z powrotem
    kolejnosc(cz, karta) {
      stan.ulozone = [];
      const pula = los.tasuj(cz.elementy);
      if (pula.every((x, i) => x === cz.elementy[i])) pula.reverse();
      const miejsce = karta.querySelector('.odp-miejsce');
      const kafle = h('div', { class: 'kafle' });
      const odswiez = () => {
        miejsce.replaceChildren(h('ol', { class: 'ulozone' }, cz.elementy.map((_, i) => {
          const x = stan.ulozone[i];
          return h('li', { class: 'slot' + (x ? ' pelny' : ''), onclick: () => { if (x && (!zablokowane || stan.poprawa)) { stan.ulozone.splice(i, 1); graj('cofnij'); odswiez(); } } }, x || '');
        })));
        kafle.replaceChildren(...pula.map((x) => h('button', { class: 'kafel-odp', type: 'button', disabled: stan.ulozone.includes(x),
          onpointerdown: wcisnij, onclick: () => { if ((!zablokowane || stan.poprawa) && !stan.ulozone.includes(x)) { stan.ulozone.push(x); graj('wybor'); odswiez(); } } }, x)));
        stan.poZmianie?.();
      };
      odswiez();
      stan.odswiez = odswiez;
      return { tresc: kafle, stopka: h('button', { class: 'btn sprawdz szeroki', type: 'button', onpointerdown: wcisnij, onclick: () => sprawdz() }, 'Sprawdź') };
    },

    // dotknij lewy, potem prawy; para dostaje wspólny kolor; dotknięcie sparowanego rozłącza
    pary(cz) {
      stan.pary = {}; stan.wybrany = null;
      const lewe = los.tasuj(cz.pary.map(([l]) => l)), prawe = los.tasuj(cz.pary.map(([, p]) => p));
      const kol = h('div', { class: 'pary' });
      const kolorPary = (l) => KOLORY_PAR[lewe.indexOf(l) % KOLORY_PAR.length];
      const odswiez = () => {
        const lewyDla = (p) => Object.keys(stan.pary).find((l) => stan.pary[l] === p);
        kol.replaceChildren(
          h('div', { class: 'pary-kol' }, lewe.map((l) => h('button', { class: 'para-el lewy' + (stan.wybrany === l ? ' wybrany' : ''), type: 'button',
            style: stan.pary[l] ? `background:${kolorPary(l)}` : '',
            onclick: () => { if (zablokowane && !stan.poprawa) return; graj(stan.pary[l] ? 'cofnij' : 'wybor'); if (stan.pary[l]) delete stan.pary[l]; stan.wybrany = l; odswiez(); } }, l))),
          h('div', { class: 'pary-kol' }, prawe.map((p) => { const l = lewyDla(p); return h('button', { class: 'para-el prawy', type: 'button',
            style: l ? `background:${kolorPary(l)}` : '',
            onclick: () => {
              if (zablokowane && !stan.poprawa) return;
              if (l) { delete stan.pary[l]; graj('cofnij'); }
              else if (stan.wybrany) { stan.pary[stan.wybrany] = p; stan.wybrany = lewe.find((x) => !stan.pary[x]) || null; graj('para'); }
              else { podpowiedz('Najpierw dotknij pojęcie po lewej.'); return; }
              odswiez();
            } }, p); })));
        stan.poZmianie?.();
      };
      stan.lewe = lewe;
      stan.wybrany = lewe[0];
      odswiez();
      stan.odswiez = odswiez;
      return { tresc: kol, stopka: h('button', { class: 'btn sprawdz szeroki', type: 'button', onpointerdown: wcisnij, onclick: () => sprawdz() }, 'Sprawdź') };
    },

    // pytanie otwarte: odpowiedz w myślach (albo na głos), odsłoń wzór i uczciwie oceń
    otwarte(cz, karta) {
      const odslon = () => {
        if (stan.odsloniete) return;
        stan.odsloniete = true;
        graj('odslon');
        karta.querySelector('.odp-miejsce').replaceChildren(h('div', { class: 'wzor' },
          h('div', { class: 'kat-etykieta' }, 'Wzorcowa odpowiedź'),
          h('p', {}, cz.a),
          cz.blad ? h('p', { class: 'wzor-blad' }, h('b', {}, 'Uważaj: '), cz.blad) : null,
          cz.zrodlo ? h('p', { class: 'zrodlo' }, ik('ksiazka'), cz.zrodlo) : null));
        const stopka = el.querySelector('.stopka');
        stopka.replaceChildren(h('div', { class: 'stopka-tytul neutral' }, profil?.ona ? 'Umiałaś tak odpowiedzieć?' : 'Umiałeś tak odpowiedzieć?'),
          h('div', { class: 'przyciski' },
            h('button', { class: 'btn jasny', type: 'button', 'data-cichy': true, onclick: () => sprawdz(false) }, 'Jeszcze nie'),
            h('button', { class: 'btn zielony', type: 'button', 'data-cichy': true, onclick: () => sprawdz(true) }, ik('ptaszek'), profil?.ona ? 'Umiałam' : 'Umiałem')));
        ustawKlawisze(null);
        requestAnimationFrame(() => karta.querySelector('.wzor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      };
      ustawKlawisze((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); odslon(); } });
      return { stopka: h('button', { class: 'btn glowny szeroki', type: 'button', 'data-cichy': true, onclick: odslon }, 'Pokaż odpowiedź') };
    },
  };

  function odpowiedzDziecka(cz, wybor) {
    switch (cz.kind) {
      case 'wybor': case 'pf': return wybor;
      case 'wpisz': return stan.pole.value;
      case 'kolejnosc': return stan.ulozone.slice();
      case 'pary': return { ...stan.pary };
      default: return null;
    }
  }

  function sprawdz(wybor) {
    if (zablokowane) return;
    const cz = czescTeraz();
    const odp = odpowiedzDziecka(cz, wybor);
    if (cz.kind === 'wpisz' && !odp.trim()) return podpowiedz('Najpierw wpisz odpowiedź.');
    if (cz.kind === 'kolejnosc' && odp.length < cz.elementy.length) return podpowiedz('Ułóż wszystkie elementy.');
    if (cz.kind === 'pary' && Object.keys(odp).length < cz.pary.length) return podpowiedz('Połącz wszystkie pary.');
    zablokowane = true;
    const { ok, uwaga } = cz.kind === 'otwarte' ? { ok: wybor } : ocen(cz, odp);
    const poz0 = pozycja();
    if (!poz0.powtorka) B().wyniki.push({ dobrze: ok, tekst: tekstZadania(poz0.z, cz), a: poprawna(cz), odp: cz.kind === 'otwarte' ? (ok ? 'umiał' : 'nie umiał') : pokaz(cz, odp) });
    oznacz(cz, odp, ok);
    if (ok) dobrze(uwaga); else zle(cz, odp);
  }

  // kolory po sprawdzeniu: zaznaczona opcja, wpis, pary
  function oznacz(cz, odp, ok) {
    if (cz.kind === 'wybor' || cz.kind === 'pf') {
      el.querySelectorAll('.opcja').forEach((b) => {
        const ta = b.dataset.wartosc === odp, dobra = !ok && b.dataset.wartosc === dobraOdpowiedz(cz);
        if (ta) { b.classList.add(ok ? 'ok' : 'zle'); b.querySelector('.opcja-znak').replaceChildren(ik(ok ? 'ptaszek' : 'zamknij')); }
        if (dobra) { b.classList.add('dobra'); b.querySelector('.opcja-znak').replaceChildren(ik('ptaszek')); }
        if (!ta && !dobra) b.classList.add('wygaszona');
      });
    }
    if (cz.kind === 'wpisz') { stan.pole.disabled = true; stan.pole.classList.add(ok ? 'ok' : 'zle'); const l = el.querySelector('.zadanie-karta .luka'); if (l) { l.textContent = odp.trim(); l.classList.add('pelna'); } }
    if (cz.kind === 'pary') el.querySelectorAll('.para-el.lewy').forEach((b) => b.classList.add(odp[b.textContent] === cz.pary.find(([l]) => l === b.textContent)[1] ? 'ok' : 'zle'));
    if (cz.kind === 'kolejnosc') el.querySelectorAll('.slot').forEach((s, i) => s.classList.add(odp[i] === cz.elementy[i] ? 'ok' : 'zle'));
  }

  function dobrze(uwaga) {
    seria++;
    graj(seria % 10 === 0 ? 'seria-10' : seria % 5 === 0 ? 'seria-5' : 'dobrze');
    el.querySelector('.zadanie-karta').classList.add('ok');
    const stopka = stopkaEl();
    stopka.className = 'stopka ok';
    // replaceChildren zamienia null na tekst „null” — puste elementy odfiltrowujemy
    stopka.replaceChildren(...[h('div', { class: 'stopka-tytul' }, ik('ptaszek'), ' ', los.wybierz(POCHWALY),
      seria >= 3 ? h('span', { class: 'seria' }, `seria ${seria}`) : null),
    uwaga ? h('p', { class: 'uwaga-ok' }, uwaga) : null].filter(Boolean));
    timer = setTimeout(nastepne, uwaga ? 2200 : 800);
  }

  // zła odpowiedź (Wojtek 2026-10-25, „wersja C”): wszystko w karcie zadania — przekreślona odpowiedź dziecka, pod nią duża
  // poprawna z ptaszkiem, wyjaśnienie w jasnożółtym polu i pole „Przepisz poprawnie:”; na dole tylko szeroki „Dalej”,
  // zablokowany, dopóki poprawna odpowiedź nie zostanie przepisana (pary i kolejność: ułożone jeszcze raz, poprawnie)
  function zle(cz, odp) {
    seria = 0;
    graj(cz.kind === 'otwarte' ? 'jeszcze-nie' : 'zle');
    const { z } = pozycja();
    // zadanie wraca w tym bloku za 2–4 pozycje (albo na końcu)
    const kolejka = B().kolejka;
    kolejka.splice(Math.min(kolejka.length, poz + 1 + los.int(2, 4)), 0, { z, powtorka: true });

    const karta = el.querySelector('.zadanie-karta');
    karta.classList.add('zle');
    info().replaceChildren();
    const otwarte = cz.kind === 'otwarte';
    const uklad = cz.kind === 'pary' || cz.kind === 'kolejnosc';
    const wzor = wzorPrzepisania(cz);
    // przyciski odpowiedzi znikają — zła i dobra odpowiedź są teraz w karcie
    if (cz.kind === 'wybor' || cz.kind === 'pf') el.querySelector('.cw-pole > .opcje')?.remove();
    if (otwarte) karta.querySelector('.odp-miejsce').replaceChildren();

    let czas = false, gotowe = false;
    const mozna = () => czas && gotowe;
    const dalejBtn = h('button', { class: 'btn szeroki dalej-zle', type: 'button', disabled: true, onclick: () => { if (mozna()) nastepne(); } });
    const odswiezDalej = () => {
      dalejBtn.disabled = !mozna();
      dalejBtn.classList.toggle('gotowy', mozna());
      dalejBtn.replaceChildren(...(mozna() ? ['Dalej', ik('dalej')]
        : gotowe ? ['Przeczytaj…'] : [uklad ? 'Ułóż poprawnie, żeby przejść dalej' : 'Przepisz, żeby przejść dalej']));
    };

    let pole = null;
    const uwaga = h('p', { class: 'przepisz-uwaga', 'aria-live': 'polite' });
    if (wzor) {
      pole = h('input', { class: 'przepisz-pole', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
        'aria-label': 'Przepisz poprawnie',
        oninput: () => {
          const bylo = gotowe;
          gotowe = przepisanePoprawnie(wzor, pole.value);
          pole.classList.toggle('ok', gotowe);
          if (gotowe) uwaga.textContent = '';
          if (gotowe && !bylo) graj('para');
          odswiezDalej();
        } });
    } else {
      // pary i kolejność: elementy wracają na miejsce, dziecko układa jeszcze raz, patrząc na poprawną odpowiedź
      stan.poprawa = true;
      if (cz.kind === 'kolejnosc') stan.ulozone = [];
      else { stan.pary = {}; stan.wybrany = stan.lewe[0]; }
      stan.poZmianie = () => {
        const bylo = gotowe;
        gotowe = ocen(cz, odpowiedzDziecka(cz)).ok;
        if (gotowe && !bylo) graj('para');
        odswiezDalej();
      };
    }

    const tekstDuzy = wzor ? wzor.pelna : '';
    const wyjasnienie = [
      ...(cz.exp || []).map((l) => h('p', {}, l)),
      cz.blad ? h('p', {}, h('b', {}, 'Uważaj: '), cz.blad) : null,
      cz.zrodlo ? h('p', { class: 'zrodlo' }, ik('ksiazka'), 'Zajrzyj do książki: ', cz.zrodlo) : null].filter(Boolean);
    karta.append(h('div', { class: 'wynik-zle' },
      otwarte ? h('p', { class: 'twoja' }, profil?.ona ? 'Jeszcze nie umiałaś — zapamiętaj:' : 'Jeszcze nie umiałeś — zapamiętaj:')
        : h('p', { class: 'twoja' }, 'Twoja odpowiedź: ', h('s', {}, pokaz(cz, odp) || '—')),
      h('div', { class: 'poprawna-duza' + (tekstDuzy.length > 40 || uklad ? ' dluga' : '') },
        h('span', { class: 'poprawna-znak' }, ik('ptaszek')),
        uklad ? h(cz.kind === 'pary' ? 'ul' : 'ol', { class: 'lista-par' }, cz.kind === 'pary'
          ? cz.pary.map(([l, p]) => h('li', {}, h('b', {}, l), ' — ', p)) : cz.elementy.map((x) => h('li', {}, x)))
          : h('span', { class: 'poprawna-txt' }, tekstDuzy)),
      wyjasnienie.length ? h('div', { class: 'wyjasnienie' }, wyjasnienie) : null,
      pole ? h('label', { class: 'przepisz' },
        h('span', { class: 'przepisz-etykieta' }, wzor.tekst !== wzor.pelna ? ['Przepisz hasło: ', h('b', {}, wzor.tekst)] : 'Przepisz poprawnie:'), pole, uwaga)
        : h('p', { class: 'przepisz-etykieta' }, cz.kind === 'pary' ? 'Połącz pary jeszcze raz, poprawnie.' : 'Ułóż jeszcze raz, poprawnie.'),
      h('p', { class: 'wraca' }, ik('powtorz'), ' To zadanie wróci jeszcze raz w tym bloku.')));
    stan.odswiez?.();

    const stopka = stopkaEl();
    stopka.className = 'stopka zle';
    stopka.replaceChildren(dalejBtn);
    odswiezDalej();
    // Enter przechodzi dalej dopiero po przepisaniu (spacja nie — w polu pisze się spacje)
    ustawKlawisze((e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      if (mozna()) nastepne();
      else if (pole && !gotowe && pole.value.trim()) uwaga.textContent = 'Jeszcze nie. Przepisz dokładnie, z polskimi literami.';
    });
    requestAnimationFrame(() => {
      // pole na dole widoku, nad nim jak najwięcej poprawnej odpowiedzi i wyjaśnienia
      (pole || karta.querySelector('.wynik-zle'))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      pole?.focus({ preventScroll: true });
    });
    timer = setTimeout(() => { czas = true; odswiezDalej(); }, otwarte ? 400 : BLOKADA_MS);
  }

  function nastepne() {
    sprzataj();
    if (czesc + 1 < pozycja().z.czesci.length) { czesc++; return pokazZadanie(); }
    czesc = 0;
    poz++;
    if (poz < B().kolejka.length) return pokazZadanie();
    koniecBloku();
  }

  // ---------- koniec bloku ----------
  function koniecBloku() {
    sprzataj();
    const w = B().wyniki, dob = w.filter((x) => x.dobrze).length;
    if (nrBloku + 1 >= bloki.length) return podsumowanie(false);
    const g = gwiazdki(dob, w.length);
    graj(g === 3 ? 'blok-idealny' : 'blok-gotowy');
    const nast = bloki[nrBloku + 1].blok;
    const dalejF = () => { nrBloku++; poz = 0; czesc = 0; wstepBloku(); };
    ekran({
      tresc: h('div', { class: 'podsum' },
        h('div', { class: 'kat-etykieta' }, `Blok ${nrBloku + 1} z ${bloki.length} gotowy`),
        h('h2', { class: 'serif' }, B().blok.tytul),
        pokazGwiazdki(g, 'duze'),
        h('div', { class: 'wynik-duzy serif' }, `${dob}/${w.length}`),
        h('p', { class: 'maly' }, 'dobrze za pierwszym razem')),
      stopka: h('button', { class: 'btn glowny szeroki', type: 'button', id: 'dalej', onclick: dalejF }, `Dalej: ${nast.tytul}`, ik('dalej')),
    });
    ustawKlawisze((e) => { if (e.key === 'Enter') { e.preventDefault(); dalejF(); } });
    el.querySelector('#dalej').focus({ preventScroll: true });
  }

  // ---------- podsumowanie ----------
  function zbudujProbe(przerwane) {
    const wszystkie = bloki.flatMap((b) => b.wyniki);
    const dob = wszystkie.filter((x) => x.dobrze).length;
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      zestaw: zestaw.id, tytul: zestaw.tytul + (opcje.tylkoBlok ? ` — ${bloki[0].blok.tytul}` : ''), d: start, czas: Math.round((Date.now() - start) / 1000),
      ile: wszystkie.length, dobrze: dob, przerwane: przerwane || undefined,
      tylkoBlok: opcje.tylkoBlok || undefined, powtorka: opcje.powtorka || undefined,
      bloki: bloki.filter((b) => b.wyniki.length).map((b) => ({ id: b.blok.id, tytul: b.blok.tytul, ile: b.wyniki.length, dobrze: b.wyniki.filter((x) => x.dobrze).length })),
      bledy: wszystkie.filter((x) => !x.dobrze).map(({ tekst, a, odp }) => ({ d: tekst, a, odp })),
    };
  }

  function podsumowanie(przerwane) {
    sprzataj();
    const wszystkie = bloki.flatMap((b) => b.wyniki);
    const dob = wszystkie.filter((x) => x.dobrze).length;
    const proba = zbudujProbe(przerwane);
    if (proba.ile) opcje.naKoniec(proba);
    const g = gwiazdki(dob, proba.ile);
    if (!przerwane) graj(g === 3 ? 'bez-bledow' : 'lekcja-gotowa');
    const minuty = Math.max(1, Math.round(proba.czas / 60));
    const ocena = zestaw.ocena && proba.ile ? ocenaSzkolna(dob, proba.ile) : null;
    if (ocena) proba.ocena = ocena.o;
    const tekstSMS = tekstWyniku(proba, profil, minuty);
    const status = h('p', { class: 'status', role: 'status' });
    const bledneKlucze = new Set(wszystkie.filter((x) => !x.dobrze).map((x) => x.tekst));
    const doPowtorki = {};
    for (const b of bloki) {
      const zadania = b.kolejka.filter((x) => !x.powtorka && x.z.czesci.some((cz) => bledneKlucze.has(tekstZadania(x.z, cz)))).map((x) => x.z);
      if (zadania.length) doPowtorki[b.blok.id] = zadania;
    }
    nrBloku = Math.min(nrBloku, bloki.length - 1);
    ekran({
      bezGory: true,
      tresc: h('div', { class: 'podsum' },
        h('div', { class: 'kat-etykieta' }, przerwane ? 'Przerwane' : 'Zestaw ukończony'),
        h('h2', { class: 'serif' }, zestaw.tytul),
        pokazGwiazdki(g, 'duze gwiazdki-wynik'),
        ocena ? h('div', { class: 'ocena-szkolna' }, h('span', { class: 'ocena-cyfra serif' }, ocena.o), h('span', { class: 'ocena-opis' }, h('b', {}, ocena.n), h('small', {}, `${ocena.pr}% dobrze · przybliżona skala szkolna`))) : null,
        h('div', { class: 'podsum-kafle' },
          h('div', { class: 'kafel bialy' }, h('b', {}, `${dob}/${proba.ile}`), h('small', {}, 'dobrze za 1. razem')),
          h('div', { class: 'kafel rozowy' }, h('b', {}, proba.ile - dob), h('small', {}, odm(proba.ile - dob, 'błąd', 'błędy', 'błędów'))),
          h('div', { class: 'kafel zolty' }, h('b', {}, `${minuty}`), h('small', {}, 'min'))),
        przerwane ? h('p', { class: 'maly' }, `Zrobione ${proba.ile} z ${wszystkich()} pytań.`) : null,
        status,
        h('div', { class: 'sekcja' }, 'Bloki'),
        h('ul', { class: 'lista-pozycji' }, proba.bloki.map((b) => h('li', { class: 'pozycja' },
          h('span', { class: 'poz-txt' }, h('b', {}, b.tytul)), pokazGwiazdki(gwiazdki(b.dobrze, b.ile), 'gwiazdki-wynik'),
          h('span', { class: 'poz-status ' + (b.dobrze === b.ile ? 'opan' : 'uczy') }, `${b.dobrze}/${b.ile}`)))),
        proba.bledy.length
          ? [h('div', { class: 'sekcja' }, 'Do powtórki'),
            h('ul', { class: 'lista-pozycji bledy' }, proba.bledy.map((x) => h('li', { class: 'pozycja' },
              h('span', { class: 'poz-txt' }, h('b', {}, x.d.replace(/___/g, '…')),
                h('small', {}, 'było: ', h('s', {}, x.odp), ' · dobrze: ', h('span', { class: 'dobra' }, x.a))))))]
          : h('p', { class: 'bez-bledow' }, 'Bez błędów — tak trzymaj!'),
        h('div', { class: 'przyciski kolumna' },
          Object.keys(doPowtorki).length ? h('button', { class: 'btn glowny', type: 'button', onclick: () => opcje.powtorz(doPowtorki) }, ik('powtorz'), 'Powtórz pomyłki') : null,
          h('button', { class: 'btn jasny', type: 'button', onclick: () => opcje.jeszczeRaz() }, 'Jeszcze raz (inne pytania)'),
          h('button', { class: 'btn jasny', type: 'button', onclick: () => opcje.wyjdz() }, 'Wróć do lekcji'))),
      stopka: h('button', { class: 'btn zielony szeroki', type: 'button', 'data-cichy': true, onclick: (e) => wyslij(tekstSMS, e.currentTarget, status) }, ik('wyslij'), 'Wyślij wynik'),
    });
  }

  wstepBloku();
  return { zakoncz: () => { sprzataj(); document.body.classList.remove('w-lekcji'); } };
}

export function tekstWyniku(p, profilInfo, minuty) {
  const procent = p.ile ? Math.round((p.dobrze / p.ile) * 100) : 0;
  const linie = [
    `${PRZEDMIOT.nazwa} · ${profilInfo?.imie || ''}`,
    `${p.tytul}${p.przerwane ? ' (przerwane)' : ''}${p.powtorka ? ' (powtórka pomyłek)' : ''}`,
    `Dobrze za pierwszym razem: ${p.dobrze} z ${p.ile} (${procent}%) · błędów: ${p.ile - p.dobrze}`,
    ...(p.ocena ? [`Ocena (przybliżona skala szkolna): ${p.ocena}`] : []),
    ...p.bloki.map((b) => `• ${b.tytul}: ${b.dobrze}/${b.ile}`),
    p.bledy.length ? 'Do powtórki: ' + p.bledy.slice(0, 8).map((x) => `${x.d.replace(/___/g, '…')} (było: ${x.odp}; dobrze: ${x.a})`).join(' | ') : 'Bez błędów!',
    `Czas: ${minuty} min`,
  ];
  return linie.join('\n');
}

// systemowe okienko udostępniania (SMS, Mail, WhatsApp…); bez niego schowek, a na końcu pole do skopiowania
async function wyslij(tekst, btn, status) {
  btn.disabled = true;
  status.replaceChildren();
  try {
    if (navigator.share) {
      try { await navigator.share({ title: `${PRZEDMIOT.nazwa} — wynik`, text: tekst }); graj('wyslano'); status.textContent = 'Wysłane? Super!'; return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(tekst); graj('wyslano'); status.textContent = 'Skopiowano — wklej w wiadomości do taty.'; return; } catch { /* dalej */ }
    }
    const pole = h('textarea', { class: 'kopiuj', readonly: true }, tekst);
    status.replaceChildren('Zaznacz i skopiuj:', pole);
    pole.select();
  } finally { btn.disabled = false; }
}
