import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { getProvider } from './providers/index.js';
import { summarizeByCategory } from './summarize.js';
import { CATEGORIES } from './categories.js';

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: getProvider().name });
});

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

app.post('/api/receipts', upload.single('file'), async (req, res) => {
  try {
    const payload = buildPayload(req);
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
  if (req.file) {
    if (!ALLOWED_MEDIA_TYPES.has(req.file.mimetype)) {
      throw httpError(400, `Nieobsługiwany typ pliku: ${req.file.mimetype}.`);
    }
    return { imageBase64: req.file.buffer.toString('base64'), mediaType: req.file.mimetype };
  }

  const body = req.body || {};

  if (body.imageBase64) {
    if (!body.mediaType || !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
      throw httpError(
        400,
        'Podaj poprawny "mediaType" (image/jpeg, image/png, image/webp, application/pdf).',
      );
    }
    return { imageBase64: body.imageBase64, mediaType: body.mediaType };
  }

  if (body.text) {
    return { text: body.text };
  }

  throw httpError(
    400,
    'Wymagany plik w polu multipart "file", albo pole "text", albo "imageBase64" + "mediaType" w JSON.',
  );
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
