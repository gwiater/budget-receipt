import Anthropic from '@anthropic-ai/sdk';
import { CATEGORY_DEFINITIONS, categoryNames, categoryPrompt } from '../categories.js';
import { measure } from '../timing.js';
import { buildExpensesPrompt, normalizeExpenses } from '../expenses.js';

/** Narzędzie z listą kategorii (enum) — lista może przyjść z budżetu, więc budowane per odczyt. */
const extractTool = (categories) => ({
  name: 'extract_receipt',
  description:
    'Zwraca listę pozycji odczytanych z paragonu wraz z kategorią wydatku przypisaną do każdej z nich.',
  input_schema: {
    type: 'object',
    properties: {
      store: {
        type: 'string',
        description: 'Nazwa sklepu/punktu sprzedaży, jeśli jest widoczna na paragonie.',
      },
      date: {
        type: 'string',
        description: 'Data paragonu w formacie YYYY-MM-DD, jeśli jest widoczna.',
      },
      items: {
        type: 'array',
        description: 'Pojedyncze pozycje z paragonu.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nazwa produktu/pozycji.' },
            quantity: { type: 'number', description: 'Ilość, jeśli podana.' },
            unitPrice: { type: 'number', description: 'Cena jednostkowa, jeśli podana.' },
            totalPrice: { type: 'number', description: 'Wartość pozycji (ilość * cena).' },
            category: {
              type: 'string',
              enum: categoryNames(categories),
              description: 'Kategoria wydatku najlepiej odpowiadająca tej pozycji.',
            },
          },
          required: ['name', 'totalPrice', 'category'],
        },
      },
      total: {
        type: 'number',
        description: 'Suma całego paragonu wydrukowana na dole, jeśli widoczna.',
      },
    },
    required: ['items'],
  },
});

/**
 * Wywołuje Claude (Anthropic) w celu rozpoznania pozycji paragonu i przypisania
 * im kategorii wydatku. Przyjmuje jeden lub więcej obrazów/PDF-ów paragonu
 * (base64, np. kilka zdjęć długiego paragonu w kolejności) i/lub czysty tekst.
 */
export async function extractReceipt({ images, text, note, categories = CATEGORY_DEFINITIONS, timer }) {
  if ((!images || images.length === 0) && !text) {
    throw new Error('Podaj co najmniej jeden obraz paragonu (images) lub tekst (text).');
  }

  const client = new Anthropic();
  const content = [];

  for (const image of images || []) {
    content.push({
      type: image.mediaType === 'application/pdf' ? 'document' : 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    });
  }

  const multiImageHint =
    images && images.length > 1
      ? ` Powyższe ${images.length} zdjęcia to fragmenty jednego, długiego paragonu, podane w kolejności — potraktuj je jako jeden ciągły dokument i nie licz pozycji dwa razy, jeśli fragmenty się nakładają.`
      : '';

  content.push({
    type: 'text',
    text: (text
      ? `Poniżej treść paragonu (tekst):\n\n${text}\n\nRozpoznaj wszystkie pozycje i przypisz każdej z nich kategorię wydatku z dostępnej listy.${multiImageHint}`
      : `Rozpoznaj wszystkie pozycje widoczne na tym paragonie i przypisz każdej z nich kategorię wydatku z dostępnej listy.${multiImageHint}`)
      + `\n\n${categoryPrompt(categories)}`
      + noteHint(note),
  });

  const response = await measure(timer, `anthropic ${process.env.ANTHROPIC_MODEL || 'claude-opus-5'}`, () => client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    max_tokens: 4096,
    tools: [extractTool(categories)],
    tool_choice: { type: 'tool', name: 'extract_receipt' },
    messages: [{ role: 'user', content }],
  }));

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Model nie zwrócił danych paragonu w oczekiwanym formacie.');
  }

  return toolUse.input;
}

/** Wydatki z tekstu (POST /api/expenses/text, patrz src/expenses.js) — wymuszone narzędzie z id kategorii. */
export async function extractExpenses({ text, categories, timer }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
  const tool = {
    name: 'add_expenses',
    description: 'Zwraca wydatki wymienione przez użytkownika: kategoria (id), kwota w zł i krótki opis.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              categoryId: { type: ['integer', 'null'], enum: [...categories.map((c) => c.id), null] },
              amount: { type: 'number' },
              description: { type: 'string' },
            },
            required: ['categoryId', 'amount', 'description'],
          },
        },
      },
      required: ['items'],
    },
  };

  const response = await measure(timer, `anthropic ${model}`, () => new Anthropic().messages.create({
    model,
    max_tokens: 2048,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: buildExpensesPrompt({ text, categories }) }],
  }));

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Model nie zwrócił wydatków w oczekiwanym formacie.');
  }

  return normalizeExpenses(toolUse.input, categories);
}

/**
 * Opcjonalna uwaga użytkownika dołączana do promptu (np. „to zakupy na urodziny”,
 * „płatność kartą firmową”) — wskazówka przy odczycie i kategoryzacji.
 */
function noteHint(note) {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return trimmed
    ? `\n\nDodatkowa informacja od użytkownika (uwzględnij ją przy odczycie i przypisywaniu kategorii): ${trimmed}`
    : '';
}
