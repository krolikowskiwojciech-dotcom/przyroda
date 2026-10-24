// Ustawienia tego przedmiotu — jedyny plik w js/, który różni się między aplikacjami Przyroda i Historia
// (reszta kodu jest wspólna). Czyta go też narzędzie narzedzia/*.mjs.
export const PRZEDMIOT = {
  id: 'przyroda',                 // repo GitHub, subdomena (przyroda.ogarnijmaterial.pl), dane: przyroda-dane w Cloudflare KV
  nazwa: 'Przyroda',              // nazwa widoczna w aplikacji
  dopelniacz: 'przyrody',         // „Lekcje przyrody pojawią się…”
  klucz: 'pz',                    // przedrostek kluczy w pamięci telefonu (localStorage)
  folder: 'KLASA 6/KLASA 4/Przyroda', // lekcje w lekcje-audio (iCloud)
  konto: 'aniela',                // konto na ogarnijmaterial.pl, które widzi ten przedmiot
  profil: { id: 'aniela', imie: 'Aniela', dopelniacz: 'Anieli', klasa: 4, znak: 'A', ona: true },
  // ikony do bąbli na kartach lekcji (pole „ikona” w zestawie) — rysunki w js/dom.js
  ikony: ['lupa', 'lisc', 'kompas', 'mikroskop', 'kropla', 'slonce', 'chmura', 'termometr', 'kolba', 'oko', 'gora', 'ptak'],
  // ikona dobierana przy imporcie z tytułu lekcji (pierwsze dopasowanie)
  ikonaTematu: [[/mikroskop/i, 'mikroskop'], [/kompas|kierun|orientac/i, 'kompas'], [/doświadcz|substancj/i, 'kolba'],
    [/zmysł|obserw/i, 'oko'], [/lup/i, 'lupa'], [/pogod|temperat|termometr/i, 'termometr'], [/wod|rzek|jezior/i, 'kropla'],
    [/słońc|światł/i, 'slonce'], [/chmur|opad|powietrz/i, 'chmura'], [/teren|krajobraz|gór|wypuk/i, 'gora'],
    [/zwierz|ptak/i, 'ptak'], [/rośli|przyrod|organizm/i, 'lisc']],
};
