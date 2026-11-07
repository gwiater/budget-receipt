import { extractReceipt as extractWithAnthropic, extractExpenses as extractExpensesWithAnthropic } from './anthropicProvider.js';
import { extractReceipt as extractWithGemini, extractExpenses as extractExpensesWithGemini } from './geminiProvider.js';
import { extractReceipt as extractWithOllama, extractExpenses as extractExpensesWithOllama } from './ollamaProvider.js';
import { applyDiscounts } from '../receiptRules.js';

/** totalPrice po rabatach liczy kod (applyDiscounts), nie model — patrz src/receiptRules.js. */
const withDiscounts = (extract) => async (payload) => applyDiscounts(await extract(payload));

const PROVIDERS = {
  anthropic: { name: 'anthropic', extractReceipt: withDiscounts(extractWithAnthropic), extractExpenses: extractExpensesWithAnthropic },
  gemini: { name: 'gemini', extractReceipt: withDiscounts(extractWithGemini), extractExpenses: extractExpensesWithGemini },
  ollama: { name: 'ollama', extractReceipt: withDiscounts(extractWithOllama), extractExpenses: extractExpensesWithOllama },
};

/**
 * Wybiera dostawcę LLM na podstawie zmiennej środowiskowej LLM_PROVIDER
 * ("anthropic", "gemini" albo "ollama" — lokalny model bez klucza). Domyślnie: anthropic.
 */
export function getProvider(name = process.env.LLM_PROVIDER) {
  const key = (name || 'anthropic').trim().toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Nieznany LLM_PROVIDER: "${name}". Dostępne opcje: ${Object.keys(PROVIDERS).join(', ')}.`,
    );
  }
  return provider;
}
