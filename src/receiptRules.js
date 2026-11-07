/**
 * Wspólne zasady odczytu paragonu — ten sam tekst idzie do promptu każdego dostawcy
 * (Anthropic, Gemini, Ollama), żeby rabaty liczyły się wszędzie tak samo.
 *
 * Najczęstszy błąd: pod pozycją jest kilka linii rabatu (np. Lidl Plus: „kupon -7,50”
 * i „voucher -0,63”) — model brał cenę przed rabatem albo odejmował tylko pierwszy rabat,
 * a przy długim paragonie przypisywał ceny do nazwy z sąsiedniego wiersza.
 */
export const RECEIPT_RULES = [
  'Zasady:',
  '- Pozycja na paragonie zajmuje zwykle kilka linii: nazwa produktu, pod nią linia z ilością/wagą, ceną i wartością (np. „3 * 4.99 14.97 C” albo „1,422kg x 6.99 9.94 C”), a pod nią ZERO, JEDNA LUB KILKA linii rabatu z kwotą ujemną (np. „Lidl Plus kupon -7,50”, „Lidl Plus voucher -0,63”, „Rabat”, „Upust”, „Promocja”, „Obniżka”, „Kupon”). Linia z ceną i wszystkie linie rabatu należą do nazwy NAD nimi — aż do następnej nazwy produktu. Przypisuj ceny dokładnie wiersz po wierszu, nie przesuwaj ich do sąsiednich pozycji.',
  '- name: nazwa pozycji tak, jak jest na paragonie (bez ilości i ceny).',
  '- price: wartość pozycji PRZED rabatami, przepisana z linii z ceną (np. 14.97 z „3 * 4.99 14.97 C”). Dla towaru na wagę wartość, a nie cena za kg.',
  '- discounts: lista WSZYSTKICH rabatów wydrukowanych pod tą pozycją, jako liczby dodatnie przepisane dokładnie z paragonu (np. pod masłem „Lidl Plus kupon -7,50” i „Lidl Plus voucher -0,63” → [7.50, 0.63]). Gdy rabatów brak → []. Nie pomijaj drugiego ani kolejnego rabatu.',
  '- totalPrice: price minus suma discounts (np. 14.97 − 7.50 − 0.63 = 6.84).',
  '- Linie rabatu NIE są osobnymi pozycjami — nie dodawaj ich do items.',
  '- quantity i unitPrice: ilość i cena jednostkowa przed rabatem, jeśli są podane.',
  '- Podsumowania pod listą (PTU, „Kwota A/C”, „Suma”, „Z Lidl Plus zaoszczędzono …”, „Wykorzystane kupony”, „Rabaty razem”) to nie pozycje ani dodatkowe rabaty — są już uwzględnione przy pozycjach, nie odejmuj ich drugi raz. Wyjątek: rabat na cały paragon wydrukowany tylko raz, bez przypisania do pozycji — rozłóż go proporcjonalnie na pozycje.',
  '- store: nazwa sklepu lub sieci (np. Lidl, Biedronka), nie nazwa firmy-właściciela.',
  '- date: data paragonu w formacie YYYY-MM-DD.',
  '- total: suma do zapłaty z dołu paragonu (np. „Suma PLN”).',
  '- Pomiń pozycje stornowane (anulowane). Nie wymyślaj pozycji, których nie ma na paragonie.',
  '- Każdą pozycję wypisz tyle razy, ile razy jest wydrukowana na paragonie — nie dubluj i nie pomijaj pozycji (także gdy zdjęcia długiego paragonu na siebie zachodzą).',
  '- Sprawdzenie na koniec: suma totalPrice wszystkich pozycji musi być równa total (z dokładnością do groszy). Jeśli nie jest — przejrzyj paragon jeszcze raz (pominięte rabaty, ceny przypisane do złej pozycji, pominięte pozycje) i popraw odczyt.',
].join('\n');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Kwotę po rabatach liczymy w kodzie, nie w modelu — tańsze modele (Haiku) mylą się przy
 * odejmowaniu kilku rabatów. Model przepisuje `price` i `discounts`, my liczymy `totalPrice`.
 * Pozycje bez `price` (np. stare odpowiedzi) zostają z `totalPrice` od modelu.
 */
export function applyDiscounts(result) {
  if (!Array.isArray(result?.items)) return result;
  return {
    ...result,
    items: result.items.map((item) => {
      const price = Number(item?.price);
      if (!item || item.price == null || !Number.isFinite(price)) return item;
      const discounts = (Array.isArray(item.discounts) ? item.discounts : [])
        .map((d) => Math.abs(Number(d)))
        .filter((d) => Number.isFinite(d) && d > 0);
      return { ...item, discounts, totalPrice: round2(price - discounts.reduce((a, d) => a + d, 0)) };
    }),
  };
}
