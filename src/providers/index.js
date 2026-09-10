import { extractReceipt as extractWithAnthropic } from './anthropicProvider.js';
import { extractReceipt as extractWithGemini } from './geminiProvider.js';

const PROVIDERS = {
  anthropic: { name: 'anthropic', extractReceipt: extractWithAnthropic },
  gemini: { name: 'gemini', extractReceipt: extractWithGemini },
};

/**
 * Wybiera dostawcę LLM na podstawie zmiennej środowiskowej LLM_PROVIDER
 * ("anthropic" lub "gemini"). Domyślnie: anthropic.
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
