import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES } from '../categories.js';

const EXTRACT_TOOL = {
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
              enum: CATEGORIES,
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
};

/**
 * Wywołuje Claude (Anthropic) w celu rozpoznania pozycji paragonu i przypisania
 * im kategorii wydatku. Przyjmuje jeden lub więcej obrazów/PDF-ów paragonu
 * (base64, np. kilka zdjęć długiego paragonu w kolejności) i/lub czysty tekst.
 */
export async function extractReceipt({ images, text, note }) {
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
      + noteHint(note),
  });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_receipt' },
    messages: [{ role: 'user', content }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Model nie zwrócił danych paragonu w oczekiwanym formacie.');
  }

  return toolUse.input;
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
