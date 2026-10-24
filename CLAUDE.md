# Przyroda — rodzinna aplikacja do nauki przyrody (PWA)

Zawsze po polsku. Aplikacja webowa na iPhone'a (dodana do ekranu początkowego), siostra Biologii (`~/Projekty/biologoza`)
i Historii (`~/Projekty/historia`) — kod jest wspólny z Historią, różni je tylko `public/js/przedmiot.js`
(nazwa, konto, folder lekcji, ikony), akcent na końcu `styles.css`, nazwy pamięci w `sw.js` i teksty w `index.html`/manifeście.

- **Dla kogo:** tylko Aniela (klasa 4, konto `aniela` na ogarnijmaterial.pl).
- **Adres:** https://przyroda.ogarnijmaterial.pl — Cloudflare Worker ze statycznymi plikami z `public/` (bez skryptu),
  `wrangler.jsonc`. Wersji na github.io nie ma. Repo kodu: publiczne `krolikowskiwojciech-dotcom/przyroda`.
- **Konto (zawsze tryb ogarnijmaterial.pl):** przy starcie `GET https://ogarnijmaterial.pl/api/ja` (credentials) — `aniela` →
  aplikacja od razu jako Aniela; inna osoba → spokojny komunikat „To przedmiot Anieli” (przyciski do https://ogarnijmaterial.pl/
  i `#konta`); 401 → przekierowanie na https://ogarnijmaterial.pl/. Zero tokenów GitHuba.
  Render lokalnie: `?test-ogarnij=aniela|julian|401` (działa tylko na 127.0.0.1/localhost, bez sieci).
- **Dane:** wyniki `profile/aniela.json` i pełne nagrania `nagrania/<id>.mp3` leżą w Cloudflare KV „DANE” Workera
  `~/Projekty/ogarnijmaterial` pod kluczami `plik:przyroda-dane/<ścieżka>` (metadata `{sha, size}`); aplikacja czyta je przez
  `https://ogarnijmaterial.pl/api/gh/repos/krolikowskiwojciech-dotcom/przyroda-dane/contents/<ścieżka>` (`?raw=1` = strumień z Range).
  Repo `przyroda-dane` na GitHubie NIE istnieje i nie jest potrzebne. Worker wpuszcza `przyroda-dane` (stała `REPO` w jego `src/index.js`).
- **Nawigacja:** lewy górny róg zawsze pigułka powrotu: „Przedmioty” na starcie → https://ogarnijmaterial.pl/, „Wróć” w aplikacji;
  po prawej ustawienia i znaczek z inicjałem → https://ogarnijmaterial.pl/#konta. Odtwarzacz: −15 s / +15 s, pamięta miejsce.

## Skąd są lekcje

Lekcje robi skill `lekcja-audio` w `iCloud/Audio - do nauki /lekcje-audio` (profil `dzieci/aniela.md`, notatki
`podreczniki/klasa4_przyroda.md`). Aplikacja niczego tam nie pisze, tylko wczytuje gotowe pliki z
`KLASA 6/KLASA 4/Przyroda/Dział */` (tak, folder Anieli leży w `KLASA 6/KLASA 4/`):

| z lekcje-audio | w aplikacji | gdzie |
|---|---|---|
| `skrypty/<id>_A.json` (pytania, ściąga, definicje) | zestaw z blokami: Pojęcia, Test wyboru, Prawda czy fałsz, Uzupełnij, Pytania z podręcznika + ściąga | `public/zestawy/` (publiczne) |
| `skrypty/<id>_A_pytania.md` (gdy nie ma JSON-a) | sam blok „Pytania z nagrania” | `public/zestawy/` |
| `audio/do-nauki-z-podrecznikiem/<id>_A.mp3` | „Lekcja z podręcznikiem” | **tylko** Cloudflare KV, `plik:przyroda-dane/nagrania/<id>.mp3` |
| `audio/na-strone/<id>_A_www.mp3` (jeśli kiedyś będzie) | „Krótka powtórka” | **tylko** Cloudflare KV, `…/nagrania/<id>-krotkie.mp3` |

Skany stron, ekstrakcje i nagrania (blisko tekstu podręcznika) **nigdy** nie trafiają do publicznego repo ani do `public/`.
Nic nie czytamy z „Ucz się sprytniej” ani z folderu `uczsiesprytniej/`. Nagrania tylko `eleven_v4` (głos `piotr-v4`) —
nie nagrywamy tu niczego; starsze modele zgłoś Wojtkowi.

`public/zestawy/spis.json` — układ podręcznika (działy, lekcje, strony); lista pokazuje działy z niego, lekcje bez zestawu jako
„wkrótce”. Tytuł działu I i tematy lekcji 2–5 są robocze (brak stron tytułowych) — popraw, gdy przyjdą zdjęcia.
Import sam dopisuje do spisu lekcję, której tam nie ma.

## Prośba „wrzuć nową lekcję przyrody” / po nagraniu lekcji przyrody Anieli

1. `git pull`.
2. `node narzedzia/przyroda.mjs importuj` — wczytuje wszystkie lekcje, wysyła nowe nagrania do Cloudflare KV
   (`npx wrangler@4` zalogowany na tym Macu, uruchamiany w `~/Projekty/ogarnijmaterial`), pomija pliki, których sha w KV się zgadza,
   po wysyłce sprawdza listę KV jeszcze raz; potem sprawdza zestawy i przebudowuje `public/zestawy/indeks.json`. **Musi przejść bez błędów.**
   `--na-sucho` = tylko pokaż, czego brakuje w KV; `--bez-nagran` = bez nagrań.
   Zestawy z importu (`"zrodlo": "lekcje-audio"`) generują się przy każdym imporcie od nowa — błąd w pytaniu poprawiaj
   w `lekcje-audio/.../skrypty/<id>.json`. Zachowują się tylko `termin`, `ikona`, `kolor`, `dodano`.
3. Obejrzyj lokalnie: `python3 -m http.server 8761 --bind 127.0.0.1 -d public`, potem
   `http://127.0.0.1:8761/?test-ogarnij=aniela` (telefon 390 px).
4. **Publikacja: commit + `git push` + `npx -y wrangler@4 deploy`** (w tym katalogu). Sam push niczego nie publikuje.
   Nagrania są w KV od razu po imporcie; nowe pytania widać po deployu. Powiedz Wojtkowi, jakie lekcje doszły.

Kartkówka ze zdjęcia: jak w Biologii (`~/Projekty/biologoza/CLAUDE.md`), plik `public/zestawy/<rrrr-mm-dd>-aniela-<temat>.json`
według `ZESTAWY.md`, `node narzedzia/przyroda.mjs katalog`, render, commit + push + deploy. Zdjęcie nie trafia do repo.
Wyniki Anieli: `node narzedzia/przyroda.mjs wyniki` (czyta z KV).

## Zasady wyglądu

Jak w Biologii: Libre Baskerville (nagłówki) + Jost, **zero kursywy**, **bez emoji w interfejsie** (ikony SVG `ik()` z `js/dom.js`,
kreska 2.1), karty 3D z `--brzeg`, mniejsze rogi, żadnych `confirm()`/`alert()` — tylko `okno()`. **Żadnych maskotek ani słodkich
grafik dla maluchów** (Aniela ma 11 lat — styl dojrzały, podręcznikowy). Kolor przewodni: brzoskwinia `#F9D7AF` (`--akcent`,
tło ikony aplikacji `public/ikony/ikona-*.png` — lupa z liśćmi, ChatGPT). Teksty do Anieli w rodzaju żeńskim („Umiałaś?”).
Zmiany wizualne sprawdzaj renderem na 127.0.0.1 przed publikacją.

## Kod

- `public/index.html`, `public/styles.css`, `public/sw.js` (szybki start: pliki aplikacji z pamięci, odświeżanie w tle;
  lekcje z sieci z limitem 1,5 s; pełne nagrania w osobnej pamięci `przyroda-nagrania`, której SW nie czyści).
- `public/js/przedmiot.js` (ustawienia przedmiotu), `app.js` (ekrany), `gra.js` (przebieg ćwiczeń), `sprawdz.js` (ocena odpowiedzi —
  wspólna z narzędziem), `store.js` (konto, zapis wyników, nagrania przez ogarnijmaterial.pl), `dom.js` (pomocniki, ikony, okienka),
  `dzwieki.js` (dźwięki jak w Biologii, `~/Projekty/biologoza/DZWIEKI.md`).
- `narzedzia/przyroda.mjs` — `importuj | sprawdz [id] | katalog | wyniki`.
- Po każdej zmianie kodu podbij `CACHE` w `public/sw.js`, potem commit + push + deploy. Nowe lekcje tego nie wymagają.
- Zmiana we wspólnym kodzie (`js/` poza `przedmiot.js`, `styles.css` poza akcentem) — przenieś ją też do `~/Projekty/historia`.
