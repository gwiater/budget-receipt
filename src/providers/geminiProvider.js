import { GoogleGenAI, Type } from '@google/genai';
import { CATEGORIES } from '../categories.js';

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    store: {
      type: Type.STRING,
      description: 'Nazwa sklepu/punktu sprzedaży, jeśli jest widoczna na paragonie.',
      nullable: true,
    },
    date: {
      type: Type.STRING,
      description: 'Data paragonu w formacie YYYY-MM-DD, jeśli jest widoczna.',
      nullable: true,
    },
    items: {
      type: Type.ARRAY,
      description: 'Pojedyncze pozycje z paragonu.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nazwa produktu/pozycji.' },
          quantity: {
            type: Type.NUMBER,
            description: 'Ilość, jeśli podana.',
            nullable: true,
          },
          unitPrice: {
            type: Type.NUMBER,
            description: 'Cena jednostkowa, jeśli podana.',
            nullable: true,
          },
          totalPrice: {
            type: Type.NUMBER,
            description: 'Wartość pozycji (ilość * cena).',
          },
          category: {
            type: Type.STRING,
            enum: CATEGORIES,
            description: 'Kategoria wydatku najlepiej odpowiadająca tej pozycji.',
          },
        },
        required: ['name', 'totalPrice', 'category'],
      },
    },
    total: {
      type: Type.NUMBER,
      description: 'Suma całego paragonu wydrukowana na dole, jeśli widoczna.',
      nullable: true,
    },
  },
  required: ['items'],
};

/**
 * Wywołuje Google Gemini (darmowy model Flash) w celu rozpoznania pozycji
 * paragonu i przypisania im kategorii wydatku. Przyjmuje jeden lub więcej
 * obrazów/PDF-ów paragonu (base64, np. kilka zdjęć długiego paragonu w
 * kolejności) i/lub czysty tekst.
 */
export async function extractReceipt({ images, text, note }) {
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

  const multiImageHint =
    images && images.length > 1
      ? ` Powyższe ${images.length} zdjęcia to fragmenty jednego, długiego paragonu, podane w kolejności — potraktuj je jako jeden ciągły dokument i nie licz pozycji dwa razy, jeśli fragmenty się nakładają.`
      : '';

  parts.push({
    text: (text
      ? `Poniżej treść paragonu (tekst):\n\n${text}\n\nRozpoznaj wszystkie pozycje i przypisz każdej z nich kategorię wydatku z dostępnej listy.${multiImageHint}`
      : `Rozpoznaj wszystkie pozycje widoczne na tym paragonie i przypisz każdej z nich kategorię wydatku z dostępnej listy.${multiImageHint}`)
      + noteHint(note),
  });

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECEIPT_SCHEMA,
    },
  });

  const text_ = response.text;
  if (!text_) {
    throw new Error('Model Gemini nie zwrócił żadnej odpowiedzi.');
  }

  try {
    return JSON.parse(text_);
  } catch (err) {
    throw new Error(`Nie udało się sparsować odpowiedzi Gemini jako JSON: ${err.message}`);
  }
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
