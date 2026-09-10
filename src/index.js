#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getProvider } from './providers/index.js';
import { summarizeByCategory } from './summarize.js';

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function parseArgs(argv) {
  const args = { json: false, files: [] };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else args.files.push(arg);
  }
  return args;
}

function printUsage() {
  console.error(
    'Użycie: node src/index.js <paragon.jpg|.png|.webp|.pdf|.txt> [kolejne-zdjęcie.jpg ...] [--json]\n' +
      '  (dla długiego paragonu podaj kilka zdjęć w kolejności — potraktowane jako jeden dokument)',
  );
}

async function main() {
  const { files, json } = parseArgs(process.argv.slice(2));

  if (files.length === 0) {
    printUsage();
    process.exit(1);
  }

  const provider = getProvider();

  if (provider.name === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Brak ANTHROPIC_API_KEY w środowisku. Skopiuj .env.example do .env i wpisz swój klucz API.',
    );
    process.exit(1);
  }

  if (provider.name === 'gemini' && !process.env.GEMINI_API_KEY) {
    console.error(
      'Brak GEMINI_API_KEY w środowisku. Skopiuj .env.example do .env i wpisz swój klucz API.',
    );
    process.exit(1);
  }

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`Plik nie istnieje: ${file}`);
      process.exit(1);
    }
  }

  if (files.length > 1 && files.some((f) => path.extname(f).toLowerCase() === '.txt')) {
    console.error('Plik .txt nie może być łączony z innymi plikami — podaj go samodzielnie.');
    process.exit(1);
  }

  let payload;
  if (files.length === 1 && path.extname(files[0]).toLowerCase() === '.txt') {
    payload = { text: fs.readFileSync(files[0], 'utf-8') };
  } else {
    const images = files.map((file) => {
      const ext = path.extname(file).toLowerCase();
      const mediaType = MIME_TYPES[ext];
      if (!mediaType) {
        console.error(`Nieobsługiwany format pliku: ${ext} (${file}). Wsparcie: jpg, png, webp, pdf, txt.`);
        process.exit(1);
      }
      return { data: fs.readFileSync(file).toString('base64'), mediaType };
    });
    payload = { images };
  }

  const result = await provider.extractReceipt(payload);
  const summary = summarizeByCategory(result.items || []);

  if (json) {
    console.log(JSON.stringify({ ...result, summary }, null, 2));
    return;
  }

  printReport(result, summary);
}

function printReport({ store, date, items = [], total }, summary) {
  const line = '='.repeat(50);
  console.log(line);
  if (store) console.log(`Sklep: ${store}`);
  if (date) console.log(`Data:  ${date}`);
  console.log(line);

  console.log('\nPozycje:');
  for (const item of items) {
    const qty = item.quantity ? ` x${item.quantity}` : '';
    const price = Number(item.totalPrice ?? 0).toFixed(2);
    console.log(`  [${item.category}] ${item.name}${qty} — ${price} zł`);
  }

  console.log('\nPodsumowanie per kategoria:');
  for (const row of summary) {
    console.log(`  ${row.category.padEnd(22)} ${row.total.toFixed(2).padStart(10)} zł`);
  }

  const sumTotal = summary.reduce((acc, row) => acc + row.total, 0);
  console.log('-'.repeat(50));
  console.log(`  SUMA:${' '.repeat(17)}${sumTotal.toFixed(2).padStart(10)} zł`);
  if (typeof total === 'number' && Math.abs(total - sumTotal) > 0.01) {
    console.log(`  (suma odczytana z paragonu: ${total.toFixed(2)} zł)`);
  }
}

main().catch((err) => {
  console.error('Błąd:', err.message);
  process.exit(1);
});
