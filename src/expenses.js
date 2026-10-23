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

export const EXPENSES_RESPONSE_FORMAT =
  '{"items": [{"categoryId": id kategorii z listy (liczba) lub null, "amount": kwota w zł (liczba), "description": "krótki opis"}]}';

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

export function buildExpensesPrompt({ text, categories }) {
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
      '- Nie wymyślaj wydatków, których nie ma w tekście. Pomiń słowa typu „dodaj”, „wpisz”.',
    ].join('\n'),
    [
      'Kategorie (w nawiasach przykłady wcześniejszych wydatków w danej kategorii):',
      ...lines,
    ].join('\n'),
    `Odpowiedz wyłącznie JSON-em w formacie:\n${EXPENSES_RESPONSE_FORMAT}`,
  ].join('\n\n');
}

/** Pozycje bez dodatniej kwoty pomijane, id spoza listy → null (do wybrania w budżecie). */
export function normalizeExpenses(result, categories) {
  const ids = new Set(categories.map((c) => c.id));
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
        };
      })
      .filter((item) => item.amount !== null && item.amount > 0),
  };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
