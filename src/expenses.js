import { CATEGORY_DEFINITIONS } from './categories.js';

/**
 * Wydatki z tekstu („Dodaj 35,45 zł na spożywcze, 20 zł na dziecko na basen”) —
 * POST /api/expenses/text. Budżet przysyła tekst (wpisany albo podyktowany) i swoje
 * kategorie z id; model zwraca listę wydatków {categoryId, amount, description}, z której
 * budżet buduje formularz do zatwierdzenia (jak przy paragonie).
 */

export const MAX_TEXT_LENGTH = 2000;
const MAX_CATEGORIES = 200;
const MAX_EXAMPLES = 25;
const MAX_NAME_LENGTH = 100;
const MAX_EXAMPLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 255;
const MAX_TAGS = 200;
const MAX_TAG_LENGTH = 50;

export const EXPENSES_RESPONSE_FORMAT =
  '{"items": [{"categoryId": id kategorii z listy (liczba) lub null, "amount": kwota w zł (liczba), "description": "krótki opis", '
  + '"tagIds": [id etykiet z listy], "newTags": ["nazwa etykiety spoza listy"]}]}';

/**
 * Kategorie z budżetu: [{id, name, examples?}] (wymagane — bez id nie ma czego zwrócić).
 * Przykłady/opis z src/categories.js dla tej samej nazwy zostają, przysłane dochodzą po nich.
 *
 * @throws Error z statusCode 400 przy złym formacie
 */
export function resolveExpenseCategories(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CATEGORIES) {
    throw badRequest(`Pole "categories" musi być niepustą tablicą [{"id": 1, "name": "..."}] (najwyżej ${MAX_CATEGORIES}).`);
  }

  const builtIn = new Map(CATEGORY_DEFINITIONS.map((c) => [c.name.toLowerCase(), c]));
  const seen = new Set();
  const definitions = [];
  for (const entry of list) {
    const id = Number(entry?.id);
    const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!Number.isInteger(id) || !name || seen.has(id)) {
      continue;
    }
    seen.add(id);

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
      id,
      name,
      ...(examples.length > 0 ? { examples } : {}),
      ...(known?.hint ? { hint: known.hint } : {}),
    });
  }
  if (definitions.length === 0) {
    throw badRequest('Pole "categories" nie zawiera żadnej kategorii z id i nazwą.');
  }

  return definitions;
}

/**
 * Etykiety rodziny z budżetu: [{id, name}] (opcjonalne — bez nich model nie przypisuje
 * istniejących etykiet, ale nazwy podane przez użytkownika i tak wraca w `newTags`).
 *
 * @throws Error z statusCode 400 przy złym formacie
 */
export function resolveExpenseTags(list) {
  if (list === undefined || list === null) {
    return [];
  }
  if (!Array.isArray(list) || list.length > MAX_TAGS) {
    throw badRequest(`Pole "tags" musi być tablicą [{"id": 1, "name": "..."}] (najwyżej ${MAX_TAGS}).`);
  }

  const seen = new Set();
  return list.flatMap((entry) => {
    const id = Number(entry?.id);
    const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, MAX_TAG_LENGTH) : '';
    if (!Number.isInteger(id) || !name || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ id, name }];
  });
}

export function readExpenseText(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    throw badRequest('Brak pola "text" z opisem wydatków.');
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw badRequest(`Pole "text" może mieć najwyżej ${MAX_TEXT_LENGTH} znaków.`);
  }
  return trimmed;
}

export function buildExpensesPrompt({ text, categories, tags = [] }) {
  const lines = categories.map((c) => {
    const detail = c.examples ? `przykłady: ${c.examples.join('; ')}` : c.hint;
    return `- id ${c.id}: ${c.name}${detail ? ` (${detail})` : ''}`;
  });

  return [
    'Użytkownik aplikacji budżetowej wpisał albo podyktował wydatki do dodania:',
    `"""\n${text}\n"""`,
    [
      'Wypisz każdy wydatek osobno. Zasady:',
      '- amount: kwota w zł jako liczba (np. „35,45 zł” → 35.45, „20 złotych” → 20, „dwadzieścia pięć złotych pięćdziesiąt groszy” → 25.5, „15 zł 30 gr” → 15.3).',
      '- categoryId: id jednej kategorii z listy poniżej — tej, którą wskazał użytkownik, a gdy jej nie nazwał, najlepiej pasującej do opisu. Gdy nic nie pasuje, null.',
      '- description: krótki opis wydatku po polsku z wypowiedzi użytkownika (np. „basen”, „zakupy w Lidlu”), bez kwoty i bez nazwy kategorii; gdy poza kategorią nic nie podano — pusty tekst.',
      '- tagIds / newTags: etykiety tylko wtedy, gdy użytkownik wprost je poda (np. „etykieta dziecko”, „z etykietą wakacje”, „otaguj paliwo”). '
        + 'Etykieta to coś innego niż kategoria — „na dziecko” to kategoria, „etykieta dziecko” to etykieta. '
        + 'Etykieta z listy poniżej → jej id w tagIds (dopasuj też odmianę, np. „etykietą dziecka” → dziecko); spoza listy → nazwa w newTags (mianownik, małymi literami). '
        + 'Etykieta dotyczy wydatku, przy którym została podana; gdy użytkownik powie, że dotyczy wszystkich — dodaj ją do każdego. Bez etykiet — puste tablice.',
      '- Nie wymyślaj wydatków, których nie ma w tekście. Pomiń słowa typu „dodaj”, „wpisz” i samą frazę z etykietą w opisie.',
    ].join('\n'),
    [
      'Kategorie (w nawiasach przykłady wcześniejszych wydatków w danej kategorii):',
      ...lines,
    ].join('\n'),
    tags.length > 0
      ? ['Etykiety:', ...tags.map((t) => `- id ${t.id}: ${t.name}`)].join('\n')
      : 'Etykiety: brak — każda etykieta podana przez użytkownika idzie do newTags.',
    `Odpowiedz wyłącznie JSON-em w formacie:\n${EXPENSES_RESPONSE_FORMAT}`,
  ].join('\n\n');
}

/**
 * Pozycje bez dodatniej kwoty pomijane, id kategorii spoza listy → null (do wybrania w
 * budżecie), id etykiet spoza listy pomijane, nowa etykieta o nazwie istniejącej → jej id.
 */
export function normalizeExpenses(result, categories, tags = []) {
  const ids = new Set(categories.map((c) => c.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
  const items = Array.isArray(result?.items) ? result.items : [];

  return {
    items: items
      .map((item) => {
        const amount = typeof item?.amount === 'string' ? Number(item.amount.replace(',', '.')) : item?.amount;
        const categoryId = Number(item?.categoryId);
        return {
          categoryId: ids.has(categoryId) ? categoryId : null,
          amount: typeof amount === 'number' && Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) / 100 : null,
          description: typeof item?.description === 'string' ? item.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '',
          ...normalizeItemTags(item, tagIds, tagByName),
        };
      })
      .filter((item) => item.amount !== null && item.amount > 0),
  };
}

function normalizeItemTags(item, tagIds, tagByName) {
  const ids = new Set((Array.isArray(item?.tagIds) ? item.tagIds : []).map(Number).filter((id) => tagIds.has(id)));
  const newTags = new Set();
  for (const raw of Array.isArray(item?.newTags) ? item.newTags : []) {
    const name = typeof raw === 'string' ? raw.trim().replace(/^#/, '').slice(0, MAX_TAG_LENGTH) : '';
    if (!name) continue;
    const existing = tagByName.get(name.toLowerCase());
    if (existing !== undefined) ids.add(existing);
    else newTags.add(name.toLowerCase());
  }
  return { tagIds: [...ids], newTags: [...newTags] };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
