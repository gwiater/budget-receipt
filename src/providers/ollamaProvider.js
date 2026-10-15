import { CATEGORY_DEFINITIONS, categoryNames, categoryPrompt, normalizeCategory } from '../categories.js';

/**
 * Lokalny model przez Ollamę (https://ollama.com) — bez klucza API i bez opłat, np.
 * `qwen2.5vl:3b` (rozpoznaje obrazy i tekst na nich). Działa także na samym CPU, ale
 * wolniej (kilkadziesiąt sekund na zdjęcie). PDF nie jest obsługiwany (Ollama przyjmuje
 * tylko obrazy) — dla PDF-ów użyj Anthropic albo Gemini.
 *
 * Zmienne: OLLAMA_URL (domyślnie http://ollama:11434), OLLAMA_MODEL (domyślnie qwen2.5vl:3b).
 */
/** Schemat odpowiedzi z listą kategorii (enum) — lista może przyjść z budżetu. */
const receiptSchema = (categories) => ({
  type: 'object',
  properties: {
    store: { type: ['string', 'null'] },
    date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unitPrice: { type: ['number', 'null'] },
          totalPrice: { type: 'number' },
          category: { type: 'string', enum: categoryNames(categories) },
        },
        required: ['name', 'totalPrice', 'category'],
      },
    },
    total: { type: ['number', 'null'] },
  },
  required: ['items'],
});

export async function extractReceipt({ images, text, note, categories = CATEGORY_DEFINITIONS, timer }) {
  if ((!images || images.length === 0) && !text) {
    throw new Error('Podaj co najmniej jeden obraz paragonu (images) lub tekst (text).');
  }
  if ((images || []).some((image) => image.mediaType === 'application/pdf')) {
    throw new Error('Lokalny model (Ollama) nie czyta PDF-ów — wyślij zdjęcie albo użyj Anthropic/Gemini.');
  }

  const multiImageHint =
    images && images.length > 1
      ? ` Załączone ${images.length} zdjęcia to fragmenty jednego, długiego paragonu, w kolejności — potraktuj je jako jeden dokument i nie licz pozycji dwa razy.`
      : '';
  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  const prompt = [
    text
      ? `Poniżej treść paragonu (tekst):\n\n${text}\n\nOdczytaj z niego wszystkie pozycje.`
      : 'Odczytaj wszystkie pozycje z załączonego zdjęcia paragonu (polski paragon fiskalny).',
    multiImageHint,
    '\nDla każdej pozycji podaj nazwę (bez ilości i ceny), wartość pozycji (totalPrice, liczba w zł, po rabatach) i kategorię.',
    `\n${categoryPrompt(categories)}\n`,
    '\nNazwa sklepu (store) to nazwa sieci/sklepu widoczna na paragonie (np. Biedronka, Lidl), nie nazwa firmy-właściciela.',
    'Podaj też nazwę sklepu (store), datę paragonu w formacie YYYY-MM-DD (date) i sumę do zapłaty (total), jeśli są widoczne.',
    'Nie wymyślaj pozycji, których nie ma na paragonie. Odpowiedz wyłącznie JSON-em zgodnym ze schematem.',
    trimmedNote ? `\nDodatkowa informacja od użytkownika (uwzględnij ją przy odczycie i przypisywaniu kategorii): ${trimmedNote}` : '',
  ].join(' ');

  const baseUrl = (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
  // stream: true — na CPU długi paragon liczy się ponad 5 minut, a fetch z Node przerywa
  // żądanie, gdy przez 5 minut nie przyjdą nagłówki odpowiedzi. Przy strumieniu nagłówki
  // i kolejne fragmenty przychodzą na bieżąco.
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'qwen2.5vl:3b',
      stream: true,
      format: receiptSchema(categories),
      options: { temperature: 0 },
      messages: [
        {
          role: 'user',
          content: prompt,
          images: (images || []).map((image) => image.data),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Ollama: ${body.error || `błąd ${response.status}`}`);
  }

  // Odpowiedź to NDJSON: {"message":{"content":"..."},"done":false} ... {"done":true}.
  let content = '';
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const part = JSON.parse(line);
      if (part.error) throw new Error(`Ollama: ${part.error}`);
      content += part.message?.content || '';
    }
  }

  timer?.add(`ollama ${process.env.OLLAMA_MODEL || 'qwen2.5vl:3b'}`, performance.now() - startedAt);

  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error('Model nie zwrócił danych paragonu w oczekiwanym formacie.');
  }

  // Mały model czasem zwraca kategorię spoza listy — takie pozycje trafiają do "Inne".
  result.items = (result.items || [])
    .filter((item) => item && typeof item.totalPrice === 'number')
    .map((item) => ({ ...item, category: normalizeCategory(item.category, categories) }));

  return result;
}
