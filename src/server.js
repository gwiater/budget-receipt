import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { getProvider } from './providers/index.js';
import { summarizeByCategory } from './summarize.js';
import { CATEGORIES } from './categories.js';

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

app.post('/api/receipts', upload.array('files', MAX_FILES), async (req, res) => {
  try {
    const payload = { ...buildPayload(req), note: readNote(req) };
    const provider = getProvider();
    const result = await provider.extractReceipt(payload);
    const summary = summarizeByCategory(result.items || []);

    res.json({ provider: provider.name, ...result, summary });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
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
