import { extractReceipt as extractWithAnthropic, extractExpenses as extractExpensesWithAnthropic } from './anthropicProvider.js';
import { extractReceipt as extractWithGemini, extractExpenses as extractExpensesWithGemini } from './geminiProvider.js';
import { extractReceipt as extractWithOllama, extractExpenses as extractExpensesWithOllama } from './ollamaProvider.js';

const PROVIDERS = {
  anthropic: { name: 'anthropic', extractReceipt: extractWithAnthropic, extractExpenses: extractExpensesWithAnthropic },
  gemini: { name: 'gemini', extractReceipt: extractWithGemini, extractExpenses: extractExpensesWithGemini },
  ollama: { name: 'ollama', extractReceipt: extractWithOllama, extractExpenses: extractExpensesWithOllama },
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
