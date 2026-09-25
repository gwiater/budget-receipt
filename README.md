# budget-receipt

Aplikacja w Node.js, która rozpoznaje pozycje na paragonie i przypisuje im
kategorię wydatku za pomocą LLM, a następnie sumuje wartości pozycji per
kategoria. Dostępna jako CLI oraz jako API HTTP, z możliwością uruchomienia
w Dockerze.

## Wybór dostawcy LLM

Dostawca wybierany jest zmienną środowiskową `LLM_PROVIDER`:

- `anthropic` (domyślny) — Claude, wymaga `ANTHROPIC_API_KEY`.
- `gemini` — Google Gemini Flash (darmowy tier), wymaga `GEMINI_API_KEY`.

- `ollama` — lokalny model przez [Ollamę](https://ollama.com), **bez klucza API i bez
  opłat** (domyślnie `qwen2.5vl:3b`, ~3,2 GB). Adres `OLLAMA_URL` (domyślnie
  `http://ollama:11434`). Działa też na samym CPU, ale wolniej (kilkadziesiąt sekund na
  zdjęcie); nie czyta PDF-ów.

Model dla każdego dostawcy można nadpisać przez `ANTHROPIC_MODEL` /
`GEMINI_MODEL` / `OLLAMA_MODEL` (domyślnie `claude-opus-5` / `gemini-3.5-flash` /
`qwen2.5vl:3b`).

Ollama w Dockerze (model pobiera się raz):

```bash
docker run -d --name ollama -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
docker exec ollama ollama pull qwen2.5vl:3b
LLM_PROVIDER=ollama OLLAMA_URL=http://localhost:11434 npm start
```

Kategorie są ograniczone do stałej listy (`src/categories.js`), dzięki czemu
podsumowania są konsystentne między różnymi paragonami i niezależne od
wybranego dostawcy:

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
# wybierz dostawcę i wpisz odpowiedni klucz w .env
```

- Klucz Anthropic: https://console.anthropic.com/
- Klucz Gemini (darmowy): https://aistudio.google.com/apikey

## CLI

```bash
npm run cli -- paragon.jpg
npm run cli -- paragon.pdf
npm run cli -- paragon.txt
npm run cli -- paragon.jpg --json

# długi paragon rozłożony na kilka zdjęć (w kolejności) — potraktowane jako jeden dokument
npm run cli -- paragon-1.jpg paragon-2.jpg paragon-3.jpg
```

Wsparcie dla formatów: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.txt`. Plik
`.txt` musi być podany samodzielnie (bez łączenia z innymi plikami).

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

## API HTTP

```bash
npm start
# serwer nasłuchuje na porcie z PORT (domyślnie 3000)
```

### `GET /health`

```bash
curl localhost:3000/health
# {"status":"ok","provider":"anthropic"}
```

### `GET /api/categories`

Zwraca listę dostępnych kategorii.

### `POST /api/receipts`

Długi paragon obsługiwany jest przez **kilka plików w jednym żądaniu** —
podaj zdjęcia we właściwej kolejności, a model potraktuje je jako jeden
ciągły dokument (bez podwójnego liczenia pozycji z nakładających się
fragmentów). Limit: do 10 plików, każdy do 15 MB.

**1. Pliki (multipart/form-data, jedno lub więcej pól `files`)**

```bash
# jedno zdjęcie
curl -X POST localhost:3000/api/receipts \
  -F "files=@paragon.jpg"

# długi paragon — kilka zdjęć w kolejności
curl -X POST localhost:3000/api/receipts \
  -F "files=@paragon-1.jpg" \
  -F "files=@paragon-2.jpg" \
  -F "files=@paragon-3.jpg"
```

**2. Obrazy/PDF-y jako base64 (JSON)**

```bash
# jedno zdjęcie
curl -X POST localhost:3000/api/receipts \
  -H "Content-Type: application/json" \
  -d '{"imageBase64": "<base64>", "mediaType": "image/jpeg"}'

# kilka zdjęć jednego paragonu, w kolejności
curl -X POST localhost:3000/api/receipts \
  -H "Content-Type: application/json" \
  -d '{"images": [
        {"imageBase64": "<base64-1>", "mediaType": "image/jpeg"},
        {"imageBase64": "<base64-2>", "mediaType": "image/jpeg"}
      ]}'
```

**Opcjonalna uwaga do promptu** — pole `note` (w multipart albo w JSON, do 1000
znaków) jest dołączane do promptu jako dodatkowa informacja od użytkownika, np.
„zakupy na urodziny Zuzi”, „wszystko to karma dla kota”:

```bash
curl -X POST localhost:3000/api/receipts \
  -F "files=@paragon.jpg" \
  -F "note=zakupy na urodziny Zuzi"
```

**3. Czysty tekst (np. z OCR)**

```bash
curl -X POST localhost:3000/api/receipts \
  -H "Content-Type: application/json" \
  -d '{"text": "Biedronka\nChleb pszenny 4.99\nMleko 3.29"}'
```

Odpowiedź:

```json
{
  "provider": "anthropic",
  "store": "Biedronka",
  "date": "2026-09-08",
  "items": [
    { "name": "Chleb pszenny", "totalPrice": 4.99, "category": "Żywność i napoje" }
  ],
  "total": 4.99,
  "summary": [
    { "category": "Żywność i napoje", "total": 4.99 }
  ]
}
```

Limity: do 10 plików w żądaniu, każdy do 15 MB, obsługiwane typy:
`image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

## Docker

```bash
docker build -t budget-receipt .
docker run -p 3000:3000 \
  -e LLM_PROVIDER=gemini \
  -e GEMINI_API_KEY=twoj-klucz \
  budget-receipt
```

Albo przez docker-compose (odczytuje zmienne z `.env` w katalogu projektu):

```bash
docker compose up --build
```

## Struktura projektu

- `src/categories.js` – lista kategorii wydatków.
- `src/providers/anthropicProvider.js` – ekstrakcja pozycji przez Claude
  (wymuszone wywołanie narzędzia).
- `src/providers/geminiProvider.js` – ekstrakcja pozycji przez Gemini Flash
  (structured output przez `responseSchema`).
- `src/providers/index.js` – wybór dostawcy na podstawie `LLM_PROVIDER`.
- `src/summarize.js` – sumowanie pozycji per kategoria.
- `src/index.js` – interfejs CLI.
- `src/server.js` – API HTTP (Express).
