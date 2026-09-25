/**
 * Kategorie wydatków z aplikacji budżetowej (github.com/gwiater/budget) — te same nazwy,
 * więc budżet przypisuje odczytane pozycje do swoich kategorii po nazwie, bez mapowania.
 *
 * `examples` — przykłady z komentarzy wydatków, które w budżecie trafiły do danej
 * kategorii w bieżącym miesiącu rozliczeniowym (od 08.09.2026, stan na 25.09.2026; bez imion, kwot i numerów;
 * wydatki z usuniętych podkategorii, np. „Auto - Paliwo”, doliczone do kategorii-rodzica).
 * `hint` — krótki opis dla kategorii, które w tym miesiącu nie miały wydatków z komentarzem.
 *
 * Po zmianie kategorii w budżecie zaktualizuj tę listę (nazwy muszą się zgadzać).
 */
export const CATEGORY_DEFINITIONS = [
  {
    name: 'Spożywcze',
    examples: ['zakupy spożywcze (Auchan, Lidl, delikatesy)', 'mleko, śmietana, śmietanka, mascarpone, sery, masło', 'chleb, bułki, słodkie bułki', 'kiełbasa, kiełbaski, kabanosy, schab, mięso mielone', 'makaron, przecier, mąka orkiszowa', 'pomidory, jogurty pitne', 'pierogi, pizza', 'ciastka, żelki, czekolada, lody, soki', 'przekąski na wycieczkę'],
  },
  {
    name: 'Dziecko',
    examples: ['zakupy na urodziny dziecka: chrupki, balony, miseczki, świeczki, drewniane widelce, cukierki, tort', 'przybory przedszkolne i szkolne, strój sportowy do szkoły', 'bidony', 'buty sportowe dla dziecka', 'zabawki (domek Toca Boca), włóczki do szydełkowania', 'przekąski i kieszonkowe na wycieczkę szkolną', 'składka klasowa, rada rodziców, Librus, przedszkole, obiady w szkole', 'zajęcia dodatkowe: akrobatyka, angielski, akademia piłkarska, logopeda'],
  },
  {
    name: 'Rozrywka',
    examples: ['frytki, hot dog, lody na mieście', 'obiad w restauracji', 'taxi, Bolt', 'przejażdżki, atrakcje', 'abonament TVN'],
  },
  {
    name: 'Prezenty',
    examples: ['wina, wódka na prezent', 'kremy na prezent', 'karta prezentowa', 'ciasto do przedszkola', 'darowizna (SOS Wioski Dziecięce)'],
  },
  {
    name: 'Prezenty dla nas',
    hint: 'rzeczy kupione w prezencie dla siebie nawzajem (dla domowników)',
  },
  {
    name: 'Użytkowe',
    hint: 'drobne artykuły użytkowe, np. gąbki, rękawiczki lateksowe',
  },
  {
    name: 'Kosmetyki',
    hint: 'kosmetyki i higiena osobista, np. pasta do zębów, nić dentystyczna, ostrza do golarki, gumki do włosów',
  },
  {
    name: 'Dom - utrzymanie, środki czystości itp.',
    examples: ['płyn do mycia, płyn do prania tapicerki', 'papier toaletowy, ręczniki papierowe', 'worki na śmieci'],
  },
  {
    name: 'Wyposażenie, ogród',
    examples: ['pościel', 'kieliszki, pojemnik na herbatę', 'wieszaki', 'kołki (Fischer) do furtki'],
  },
  {
    name: 'RTV i AGD',
    examples: ['zestaw naprawczy do ekspresu do kawy'],
  },
  {
    name: 'Leczenie',
    examples: ['zestaw do nebulizacji', 'wkładki ortopedyczne do butów', 'osteopata'],
  },
  {
    name: 'Alkohole',
    hint: 'piwo, wino, wódka i inne alkohole kupione dla siebie',
  },
  {
    name: 'Odzież',
    examples: ['ubrania z Reserved', 'rajstopy'],
  },
  {
    name: 'Samochód',
    examples: ['paliwo: diesel, LPG'],
  },
  {
    name: 'Sport / hobby',
    examples: ['zajęcia hip hop', 'prenumerata gazety'],
  },
  {
    name: 'Zwierzaki',
    examples: ['weterynarz', 'karma i akcesoria dla zwierząt'],
  },
  {
    name: 'Komunikacja',
    examples: ['parking'],
  },
  {
    name: 'Rachunki',
    examples: ['gaz (PGNiG), prąd (PGE), woda', 'telefon (Play)', 'rata fotowoltaiki', 'podatek od nieruchomości'],
  },
  {
    name: 'Usługi',
    examples: ['subskrypcja Claude Code'],
  },
  {
    name: 'Kredyt - budowa domu',
    examples: ['rata kredytu z ubezpieczeniem, nadpłata'],
  },
  {
    name: 'Inne',
    examples: ['podatek dochodowy, VAT', 'ZUS', 'dopłata do karty podarunkowej'],
  },
];

export const CATEGORIES = CATEGORY_DEFINITIONS.map((c) => c.name);

/**
 * Lista kategorii z przykładami do promptu — model wybiera jedną z nich dla każdej pozycji.
 */
export function categoryPrompt() {
  const lines = CATEGORY_DEFINITIONS.map((c) => {
    const detail = c.examples ? `przykłady: ${c.examples.join('; ')}` : c.hint;
    return `- ${c.name}${detail ? ` (${detail})` : ''}`;
  });

  return [
    'Dla każdej pozycji wybierz dokładnie jedną kategorię z listy poniżej (użyj nazwy dokładnie tak, jak jest zapisana).',
    'W nawiasach przykłady z wcześniejszych wydatków w danej kategorii — kieruj się nimi, bo tak domownicy kategoryzują zakupy.',
    'Jeśli nic nie pasuje, użyj kategorii „Inne”.',
    ...lines,
  ].join('\n');
}
