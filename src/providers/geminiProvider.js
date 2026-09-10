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
 * paragonu i przypisania im kategorii wydatku. Przyjmuje obraz/PDF paragonu
 * (base64) lub czysty tekst.
 */
export async function extractReceipt({ imageBase64, mediaType, text }) {
  if (!imageBase64 && !text) {
    throw new Error('Podaj obraz paragonu (imageBase64) lub tekst (text).');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Brak GEMINI_API_KEY w środowisku.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const parts = [];

  if (imageBase64) {
    parts.push({ inlineData: { mimeType: mediaType, data: imageBase64 } });
  }

  parts.push({
    text: text
      ? `Poniżej treść paragonu (tekst):\n\n${text}\n\nRozpoznaj wszystkie pozycje i przypisz każdej z nich kategorię wydatku z dostępnej listy.`
      : 'Rozpoznaj wszystkie pozycje widoczne na tym paragonie i przypisz każdej z nich kategorię wydatku z dostępnej listy.',
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
