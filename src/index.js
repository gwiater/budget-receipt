#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { extractReceipt } from './extractReceipt.js';
import { summarizeByCategory } from './summarize.js';

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function parseArgs(argv) {
  const args = { json: false, file: null };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (!args.file) args.file = arg;
  }
  return args;
}

function printUsage() {
  console.error(
    'Użycie: node src/index.js <ścieżka-do-paragonu.jpg|.png|.webp|.pdf|.txt> [--json]',
  );
}

async function main() {
  const { file, json } = parseArgs(process.argv.slice(2));

  if (!file) {
    printUsage();
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Brak ANTHROPIC_API_KEY w środowisku. Skopiuj .env.example do .env i wpisz swój klucz API.',
    );
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`Plik nie istnieje: ${file}`);
    process.exit(1);
  }

  const ext = path.extname(file).toLowerCase();
  const buffer = fs.readFileSync(file);

  let payload;
  if (ext === '.txt') {
    payload = { text: buffer.toString('utf-8') };
  } else {
    const mediaType = MIME_TYPES[ext];
    if (!mediaType) {
      console.error(`Nieobsługiwany format pliku: ${ext}. Wsparcie: jpg, png, webp, pdf, txt.`);
      process.exit(1);
    }
    payload = { imageBase64: buffer.toString('base64'), mediaType };
  }

  const result = await extractReceipt(payload);
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
