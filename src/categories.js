/**
 * Kategorie wydatków z aplikacji budżetowej (github.com/gwiater/budget) — te same nazwy,
 * więc budżet przypisuje odczytane pozycje do swoich kategorii po nazwie, bez mapowania.
 *
 * `examples` — przykłady z komentarzy wydatków, które w budżecie trafiły do danej
 * kategorii w bieżącym miesiącu rozliczeniowym (od 08.09.2026, stan na 25.09.2026; bez imion, kwot i numerów;
 * wydatki z usuniętych podkategorii, np. „Auto - Paliwo”, doliczone do kategorii-rodzica).
 * `hint` — krótki opis dla kategorii, które w tym miesiącu nie miały wydatków z komentarzem.
 *
 * Budżet wysyła przy każdym odczycie swoją aktualną listę (pole `categories`, patrz
 * resolveCategories) — ta lista to przykłady/opisy dla znanych nazw i zapas, gdy pola brak.
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

const MAX_CATEGORIES = 100;
const MAX_EXAMPLES = 25;
const MAX_NAME_LENGTH = 100;
const MAX_EXAMPLE_LENGTH = 120;

/**
 * Kategorie do odczytu: lista przysłana przez budżet (pole `categories` w POST /api/receipts,
 * [{name, examples?}] — aktualne kategorie rodziny i nazwy pozycji z zatwierdzonych
 * paragonów) połączona z listą wyżej. Nazwy i kolejność — z budżetu; przykłady/opis z listy
 * wyżej zostają dla kategorii o tej samej nazwie, przykłady z budżetu dochodzą po nich.
 * Bez listy z budżetu — CATEGORY_DEFINITIONS.
 *
 * @throws Error z statusCode 400 przy złym formacie
 */
export function resolveCategories(custom) {
  if (custom === undefined || custom === null || custom === '') {
    return CATEGORY_DEFINITIONS;
  }

  let list = custom;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      throw badRequest('Pole "categories" musi być JSON-em: [{"name": "...", "examples": ["..."]}].');
    }
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CATEGORIES) {
    throw badRequest(`Pole "categories" musi być niepustą tablicą (najwyżej ${MAX_CATEGORIES} kategorii).`);
  }

  const builtIn = new Map(CATEGORY_DEFINITIONS.map((c) => [c.name.toLowerCase(), c]));
  const seen = new Set();
  const definitions = [];
  for (const entry of list) {
    const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!name || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());

    const known = builtIn.get(name.toLowerCase());
    const examples = [...(known?.examples || [])];
    const lower = new Set(examples.map((e) => e.toLowerCase()));
    for (const example of Array.isArray(entry.examples) ? entry.examples : []) {
      const text = typeof example === 'string' ? example.trim().slice(0, MAX_EXAMPLE_LENGTH) : '';
      if (text && !lower.has(text.toLowerCase()) && examples.length < MAX_EXAMPLES) {
        lower.add(text.toLowerCase());
        examples.push(text);
      }
    }

    definitions.push({
      name,
      ...(examples.length > 0 ? { examples } : {}),
      ...(known?.hint ? { hint: known.hint } : {}),
    });
  }
  if (definitions.length === 0) {
    throw badRequest('Pole "categories" nie zawiera żadnej nazwy kategorii.');
  }

  return definitions;
}

export function categoryNames(definitions = CATEGORY_DEFINITIONS) {
  return definitions.map((c) => c.name);
}

/** Kategoria spoza listy → „Inne” (jeśli jest na liście), inaczej null — budżet zostawi ją do wybrania. */
export function normalizeCategory(category, definitions = CATEGORY_DEFINITIONS) {
  const names = categoryNames(definitions);
  if (names.includes(category)) {
    return category;
  }

  return names.includes('Inne') ? 'Inne' : null;
}

/**
 * Lista kategorii z przykładami do promptu — model wybiera jedną z nich dla każdej pozycji.
 */
export function categoryPrompt(definitions = CATEGORY_DEFINITIONS) {
  const lines = definitions.map((c) => {
    const detail = c.examples ? `przykłady: ${c.examples.join('; ')}` : c.hint;
    return `- ${c.name}${detail ? ` (${detail})` : ''}`;
  });

  return [
    'Dla każdej pozycji wybierz dokładnie jedną kategorię z listy poniżej (użyj nazwy dokładnie tak, jak jest zapisana).',
    'W nawiasach przykłady z wcześniejszych wydatków w danej kategorii — kieruj się nimi, bo tak domownicy kategoryzują zakupy.',
    categoryNames(definitions).includes('Inne') ? 'Jeśli nic nie pasuje, użyj kategorii „Inne”.' : '',
    ...lines,
  ].filter(Boolean).join('\n');
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
