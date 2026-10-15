import { GoogleGenAI } from '@google/genai';
import { CATEGORY_DEFINITIONS, categoryPrompt, normalizeCategory } from '../categories.js';

/**
 * Format odpowiedzi opisany w prompcie. Bez wymuszonego schematu (responseSchema) —
 * z nim gemini-3.5-flash liczył paragon ponad 4 minuty, bez niego kilkanaście sekund.
 * Kategorie sprawdzamy po odpowiedzi (normalizeResult).
 */
const RESPONSE_FORMAT =
  '{"store": "nazwa sklepu" lub null, "date": "YYYY-MM-DD" lub null, "items": [{"name": "nazwa pozycji", '
  + '"quantity": liczba lub null, "unitPrice": liczba lub null, "totalPrice": liczba, "category": "nazwa kategorii z listy"}], '
  + '"total": liczba lub null}';

/**
 * Zapasowe modele: gdy model odpowiada 503 (przeciążony) albo 429 (limit), od razu próbujemy
 * następnego — każdy model ma osobną pulę mocy i limitów. Kolejność: GEMINI_MODEL, potem
 * GEMINI_FALLBACK_MODELS (po przecinku). Gdy wszystkie są przeciążone, jeszcze jedna runda
 * po krótkiej przerwie.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash';
// gemini-3.7-flash na końcu — prawie zawsze odpowiada 503 i tylko opóźniał odczyt (~4 s na próbę).
const DEFAULT_FALLBACK_MODELS = 'gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.7-flash';
const ROUNDS = 2;
const ROUND_DELAY_MS = 5000;

/**
 * Wywołuje Google Gemini (darmowy model Flash) w celu rozpoznania pozycji
 * paragonu i przypisania im kategorii wydatku. Przyjmuje jeden lub więcej
 * obrazów/PDF-ów paragonu (base64, np. kilka zdjęć długiego paragonu w
 * kolejności) i/lub czysty tekst.
 */
export async function extractReceipt({ images, text, note, categories = CATEGORY_DEFINITIONS, timer }) {
  if ((!images || images.length === 0) && !text) {
    throw new Error('Podaj co najmniej jeden obraz paragonu (images) lub tekst (text).');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Brak GEMINI_API_KEY w środowisku.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const parts = [];

  for (const image of images || []) {
    parts.push({ inlineData: { mimeType: image.mediaType, data: image.data } });
  }

  parts.push({ text: buildPrompt({ images, text, note, categories }) });

  const response = await withFallback(timer, (model) => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      // Odczyt paragonu nie wymaga długiego „myślenia” — przy domyślnym poziomie
      // gemini-3.5-flash potrafi liczyć paragon ponad 5 minut, przy „low” kilka sekund.
      thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'low' },
    },
  }));

  // Tokeny „myślenia” (thoughts) najbardziej wydłużają odczyt — widać je w logu.
  const usage = response.usageMetadata;
  if (usage && timer) {
    timer.steps[timer.steps.length - 1].tokens = {
      prompt: usage.promptTokenCount,
      output: usage.candidatesTokenCount,
      thoughts: usage.thoughtsTokenCount ?? 0,
    };
  }

  const text_ = response.text;
  if (!text_) {
    throw new Error('Model Gemini nie zwrócił żadnej odpowiedzi.');
  }

  let result;
  try {
    result = JSON.parse(text_);
  } catch (err) {
    throw new Error(`Nie udało się sparsować odpowiedzi Gemini jako JSON: ${err.message}`);
  }

  return normalizeResult(result, categories);
}

export function buildPrompt({ images, text, note, categories = CATEGORY_DEFINITIONS }) {
  const multiImageHint =
    images && images.length > 1
      ? `\nPowyższe ${images.length} zdjęcia to fragmenty jednego, długiego paragonu, podane w kolejności — potraktuj je jako jeden ciągły dokument i nie licz pozycji dwa razy, jeśli fragmenty się nakładają.`
      : '';

  return [
    (text
      ? `Poniżej treść paragonu (tekst):\n\n${text}\n\nOdczytaj z niego wszystkie pozycje.`
      : 'Odczytaj wszystkie pozycje z załączonego paragonu (polski paragon fiskalny).') + multiImageHint,
    [
      'Zasady:',
      '- name: nazwa pozycji tak, jak jest na paragonie (bez ilości i ceny).',
      '- totalPrice: wartość pozycji w zł po rabatach — dla towaru na wagę wartość, a nie cena za kg; rabat wydrukowany pod pozycją odejmij od niej.',
      '- quantity i unitPrice: ilość i cena jednostkowa, jeśli są podane.',
      '- store: nazwa sklepu lub sieci (np. Lidl, Biedronka), nie nazwa firmy-właściciela.',
      '- date: data paragonu w formacie YYYY-MM-DD.',
      '- total: suma do zapłaty z dołu paragonu.',
      '- Pomiń pozycje stornowane (anulowane). Nie wymyślaj pozycji, których nie ma na paragonie.',
    ].join('\n'),
    categoryPrompt(categories),
    noteHint(note),
    `Odpowiedz wyłącznie JSON-em w formacie:\n${RESPONSE_FORMAT}`,
  ].filter(Boolean).join('\n\n');
}

/** Kategorie spoza listy → „Inne” (normalizeCategory), pozycje bez kwoty pomijane. */
function normalizeResult(result, categories) {
  const items = Array.isArray(result?.items) ? result.items : [];

  return {
    store: typeof result?.store === 'string' ? result.store : null,
    date: typeof result?.date === 'string' ? result.date : null,
    items: items
      .filter((item) => item && typeof item.name === 'string' && typeof item.totalPrice === 'number')
      .map((item) => ({ ...item, category: normalizeCategory(item.category, categories) })),
    total: typeof result?.total === 'number' ? result.total : null,
  };
}

/** Lista modeli do wypróbowania, bez powtórzeń. */
function modelChain() {
  const models = [
    process.env.GEMINI_MODEL || DEFAULT_MODEL,
    ...(process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS).split(','),
  ].map((m) => m.trim()).filter(Boolean);

  return [...new Set(models)];
}

function isOverloaded(err) {
  const message = String(err?.message);
  return [429, 503].includes(err?.status) || /"code":\s*(429|503)/.test(message);
}

/**
 * Wywołuje kolejne modele, dopóki któryś nie odpowie (patrz DEFAULT_FALLBACK_MODELS).
 * Każda próba (także nieudana) trafia do `timer` jako krok „gemini <model>”.
 */
async function withFallback(timer, call) {
  const models = modelChain();
  let lastError;
  for (let round = 1; round <= ROUNDS; round++) {
    for (const model of models) {
      const startedAt = performance.now();
      try {
        const response = await call(model);
        timer?.add(`gemini ${model}`, performance.now() - startedAt, { status: 'ok' });
        console.log(`Gemini: odczyt modelem ${model}`);
        return response;
      } catch (err) {
        timer?.add(`gemini ${model}`, performance.now() - startedAt, { status: err?.status ?? 'błąd' });
        if (!isOverloaded(err)) {
          throw err;
        }
        console.warn(`Gemini: ${model} przeciążony (${err?.status ?? 'błąd'}), próbuję następnego modelu`);
        lastError = err;
      }
    }
    if (round < ROUNDS) {
      timer?.add('przerwa przed 2. rundą', ROUND_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, ROUND_DELAY_MS));
    }
  }
  throw lastError;
}

/**
 * Opcjonalna uwaga użytkownika dołączana do promptu (np. „to zakupy na urodziny”,
 * „płatność kartą firmową”) — wskazówka przy odczycie i kategoryzacji.
 */
function noteHint(note) {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return trimmed
    ? `Dodatkowa informacja od użytkownika (uwzględnij ją przy odczycie i przypisywaniu kategorii): ${trimmed}`
    : '';
}
