import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { getProvider } from './providers/index.js';
import { summarizeByCategory } from './summarize.js';
import { CATEGORIES, resolveCategories } from './categories.js';
import { createTimer, formatTimings } from './timing.js';
import { readExpenseText, resolveExpenseCategories, resolveExpenseTags } from './expenses.js';

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_NOTE_LENGTH = 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES },
});

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: getProvider().name });
});

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

// Timer startuje przed multerem, żeby zmierzyć też odbiór plików od budżetu.
const startTimer = (req, res, next) => {
  req.timer = createTimer();
  req.uploadStartedAt = performance.now();
  next();
};

app.post('/api/receipts', startTimer, upload.array('files', MAX_FILES), async (req, res) => {
  const timer = req.timer;
  timer.add('odbiór plików', performance.now() - req.uploadStartedAt, {
    files: req.files?.length ?? 0,
    kB: Math.round((req.files || []).reduce((sum, f) => sum + f.size, 0) / 1024),
  });
  try {
    const fromBudget = req.body?.categories !== undefined && req.body?.categories !== '';
    const payload = { ...buildPayload(req), note: readNote(req), categories: resolveCategories(req.body?.categories), timer };
    const provider = getProvider();
    const examples = payload.categories.reduce((sum, c) => sum + (c.examples?.length ?? 0), 0);
    console.log(`Paragon: ${payload.images?.length ?? 0} plik(ów), uwaga: ${payload.note ? `„${payload.note}”` : 'brak'}, `
      + `kategorie: ${fromBudget ? 'z budżetu' : 'wbudowane'} (${payload.categories.length}, przykładów ${examples})`);
    const result = await provider.extractReceipt(payload);
    const summary = summarizeByCategory(result.items || []);
    console.log(formatTimings(timer));

    res.json({ provider: provider.name, ...result, summary, timings: timer.toJSON() });
  } catch (err) {
    console.error(err);
    console.log(`${formatTimings(timer)} — BŁĄD`);
    res.status(err.statusCode || 500).json({ error: err.message, timings: timer.toJSON() });
  }
});

// Wydatki z tekstu wpisanego/podyktowanego w budżecie (src/expenses.js):
// JSON {text, categories: [{id, name, examples?}], tags?: [{id, name}]}
// → {items: [{categoryId, amount, description, tagIds, newTags}]}.
app.post('/api/expenses/text', async (req, res) => {
  const timer = createTimer();
  try {
    const text = readExpenseText(req.body?.text);
    const categories = resolveExpenseCategories(req.body?.categories);
    const tags = resolveExpenseTags(req.body?.tags);
    const provider = getProvider();
    console.log(`Wydatki z tekstu: ${text.length} znaków, kategorii ${categories.length}, etykiet ${tags.length}`);
    const result = await provider.extractExpenses({ text, categories, tags, timer });
    console.log(`${formatTimings(timer)} — wydatków ${result.items.length}`);

    res.json({ provider: provider.name, ...result, timings: timer.toJSON() });
  } catch (err) {
    console.error(err);
    console.log(`${formatTimings(timer)} — BŁĄD`);
    res.status(err.statusCode || 500).json({ error: err.message, timings: timer.toJSON() });
  }
});

function buildPayload(req) {
  if (req.files && req.files.length > 0) {
    const images = req.files.map((file) => {
      if (!ALLOWED_MEDIA_TYPES.has(file.mimetype)) {
        throw httpError(
          400,
          `Nieobsługiwany typ pliku: ${file.mimetype} (${file.originalname}).`,
        );
      }
      return { data: file.buffer.toString('base64'), mediaType: file.mimetype };
    });
    return { images };
  }

  const body = req.body || {};

  // Kilka zdjęć jednego długiego paragonu: [{ imageBase64, mediaType }, ...]
  if (Array.isArray(body.images) && body.images.length > 0) {
    if (body.images.length > MAX_FILES) {
      throw httpError(400, `Zbyt wiele plików — maksymalnie ${MAX_FILES}.`);
    }
    const images = body.images.map((image, i) => {
      if (!image.mediaType || !ALLOWED_MEDIA_TYPES.has(image.mediaType)) {
        throw httpError(
          400,
          `images[${i}]: podaj poprawny "mediaType" (image/jpeg, image/png, image/webp, application/pdf).`,
        );
      }
      if (!image.imageBase64) {
        throw httpError(400, `images[${i}]: brak pola "imageBase64".`);
      }
      return { data: image.imageBase64, mediaType: image.mediaType };
    });
    return { images };
  }

  if (body.imageBase64) {
    if (!body.mediaType || !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
      throw httpError(
        400,
        'Podaj poprawny "mediaType" (image/jpeg, image/png, image/webp, application/pdf).',
      );
    }
    return { images: [{ data: body.imageBase64, mediaType: body.mediaType }] };
  }

  if (body.text) {
    return { text: body.text };
  }

  throw httpError(
    400,
    'Wymagany co najmniej jeden plik w polu multipart "files", albo pole "text", albo ' +
      '"images": [{imageBase64, mediaType}, ...] / "imageBase64" + "mediaType" w JSON.',
  );
}

// Opcjonalna uwaga do promptu: pole "note" w multipart albo w JSON.
function readNote(req) {
  const note = (req.body && typeof req.body.note === 'string') ? req.body.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    throw httpError(400, `Pole "note" może mieć najwyżej ${MAX_NOTE_LENGTH} znaków.`);
  }
  return note || undefined;
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`budget-receipt API działa na porcie ${port} (LLM_PROVIDER=${getProvider().name})`);
});
