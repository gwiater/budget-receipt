# budget-receipt

Aplikacja w Node.js, która rozpoznaje pozycje na paragonie i przypisuje im
kategorię wydatku za pomocą LLM (Claude), a następnie sumuje wartości pozycji
per kategoria.

## Jak to działa

1. Paragon (zdjęcie/PDF lub tekst z OCR) jest wysyłany do modelu Claude.
2. Model, korzystając z wymuszonego wywołania narzędzia (`tool_choice`),
   zwraca ustrukturyzowaną listę pozycji: nazwa, ilość, cena, kategoria.
3. Aplikacja sumuje wartości pozycji per kategoria i wypisuje raport.

Kategorie są ograniczone do stałej listy (`src/extractReceipt.js`), dzięki
czemu podsumowania są konsystentne między różnymi paragonami:

- Żywność i napoje
- Alkohol
- Chemia i higiena
- Zdrowie i apteka
- Dom i AGD
- Odzież i obuwie
- Elektronika
- Rozrywka
- Transport
- Gastronomia
- Inne

## Instalacja

```bash
npm install
cp .env.example .env
# wpisz swój klucz w .env: ANTHROPIC_API_KEY=sk-ant-...
```

## Użycie

```bash
node src/index.js paragon.jpg
node src/index.js paragon.pdf
node src/index.js paragon.txt
node src/index.js paragon.jpg --json
```

Wsparcie dla formatów: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.txt`.

Przykładowy wynik:

```
==================================================
Sklep: Biedronka
Data:  2026-09-08
==================================================

Pozycje:
  [Żywność i napoje] Chleb pszenny — 4.99 zł
  [Chemia i higiena] Płyn do naczyń — 8.50 zł
  ...

Podsumowanie per kategoria:
  Żywność i napoje            34.20 zł
  Chemia i higiena             8.50 zł
--------------------------------------------------
  SUMA:                       42.70 zł
```

## Struktura projektu

- `src/extractReceipt.js` – wywołanie LLM i definicja narzędzia (schema) do
  ekstrakcji pozycji paragonu.
- `src/summarize.js` – sumowanie pozycji per kategoria.
- `src/index.js` – interfejs CLI.
