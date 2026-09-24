import { CATEGORIES } from '../categories.js';

/**
 * Lokalny model przez Ollamę (https://ollama.com) — bez klucza API i bez opłat, np.
 * `qwen2.5vl:3b` (rozpoznaje obrazy i tekst na nich). Działa także na samym CPU, ale
 * wolniej (kilkadziesiąt sekund na zdjęcie). PDF nie jest obsługiwany (Ollama przyjmuje
 * tylko obrazy) — dla PDF-ów użyj Anthropic albo Gemini.
 *
 * Zmienne: OLLAMA_URL (domyślnie http://ollama:11434), OLLAMA_MODEL (domyślnie qwen2.5vl:3b).
 */
const RECEIPT_SCHEMA = {
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
          category: { type: 'string', enum: CATEGORIES },
        },
        required: ['name', 'totalPrice', 'category'],
      },
    },
    total: { type: ['number', 'null'] },
  },
  required: ['items'],
};

/**
 * Mały lokalny model myli kategorie bez podpowiedzi (np. chleb jako „Zdrowie i apteka”) —
 * krótkie opisy, co należy do której kategorii.
 */
const CATEGORY_HINTS = {
  'Żywność i napoje': 'pieczywo, nabiał, mleko, jajka, mięso, wędliny, owoce, warzywa, słodycze, kawa, herbata, napoje bezalkoholowe',
  Alkohol: 'piwo, wino, wódka i inne alkohole',
  'Chemia i higiena': 'środki czystości, płyny do naczyń, proszki, papier toaletowy, kosmetyki, pasta do zębów, szampony',
  'Zdrowie i apteka': 'leki, suplementy, opatrunki, artykuły z apteki',
  'Dom i AGD': 'artykuły domowe, naczynia, drobne AGD, żarówki, dekoracje, karma i akcesoria dla zwierząt',
  'Odzież i obuwie': 'ubrania, buty, bielizna',
  Elektronika: 'elektronika, baterie, kable, akcesoria do telefonów',
  Rozrywka: 'książki, gry, zabawki, bilety',
  Transport: 'paliwo, bilety komunikacji, parkingi, myjnia',
  Gastronomia: 'jedzenie na miejscu lub na wynos w restauracji, kawiarni, barze',
  Inne: 'wszystko, co nie pasuje do pozostałych',
};

export async function extractReceipt({ images, text, note }) {
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
    '\nDla każdej pozycji podaj nazwę (bez ilości i ceny), wartość pozycji (totalPrice, liczba w zł, po rabatach) i jedną kategorię z listy:',
    CATEGORIES.map((c) => `\n- ${c}${CATEGORY_HINTS[c] ? ` (${CATEGORY_HINTS[c]})` : ''}`).join(''),
    '\nNazwa sklepu (store) to nazwa sieci/sklepu widoczna na paragonie (np. Biedronka, Lidl), nie nazwa firmy-właściciela.',
    'Podaj też nazwę sklepu (store), datę paragonu w formacie YYYY-MM-DD (date) i sumę do zapłaty (total), jeśli są widoczne.',
    'Nie wymyślaj pozycji, których nie ma na paragonie. Odpowiedz wyłącznie JSON-em zgodnym ze schematem.',
    trimmedNote ? `\nDodatkowa informacja od użytkownika (uwzględnij ją przy odczycie i przypisywaniu kategorii): ${trimmedNote}` : '',
  ].join(' ');

  const baseUrl = (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'qwen2.5vl:3b',
      stream: false,
      format: RECEIPT_SCHEMA,
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

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Ollama: ${body.error || `błąd ${response.status}`}`);
  }

  let result;
  try {
    result = JSON.parse(body.message?.content || '');
  } catch {
    throw new Error('Model nie zwrócił danych paragonu w oczekiwanym formacie.');
  }

  // Mały model czasem zwraca kategorię spoza listy — takie pozycje trafiają do "Inne".
  result.items = (result.items || [])
    .filter((item) => item && typeof item.totalPrice === 'number')
    .map((item) => ({ ...item, category: CATEGORIES.includes(item.category) ? item.category : 'Inne' }));

  return result;
}
