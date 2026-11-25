/* ==========================================================================
   BikeDash — калькулятор вартості оренди велосипеда (Vanilla JS, без jQuery)

   Формула:
     вартість одного велосипеда = тариф × години + сума обраних опцій
     сума  = вартість одного велосипеда × кількість + маршрут
     разом = сума × 0.9, якщо велосипедів ≥ 5 (округлення до гривні)

   Контроль: E-Bike, 2 год, шолом + страховка, 1 байк        → 230 ₴
             E-Bike, 4 год, шолом + страховка, 5 байків, за місто → 1 935 ₴
   ========================================================================== */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const form = $('rental-calculator');
  if (!form) return; // віджета немає на сторінці — нічого не робимо

  /* ---------- 1. Елементи DOM ---------- */
  const el = {
    bikeRadios:      form.querySelectorAll('input[name="bike-type"]'),
    durationRange:   $('duration-range'),
    durationValue:   $('duration-value'),
    durationUnit:    $('duration-unit'),
    presets:         form.querySelectorAll('#duration-presets [data-hours]'),
    bikesCount:      $('bikes-count'),
    bikesDecrease:   $('bikes-decrease'),
    bikesIncrease:   $('bikes-increase'),
    routeSelect:     $('route-select'),
    equipment:       form.querySelectorAll('input[name="equipment"]'),
    total:           $('summary-total'),
    mobileTotal:     $('mobile-total'),
    discountBadge:   $('discount-badge'),
    errorsBox:       $('calc-errors'),
    errorsList:      $('calc-errors-list'),
    bikesCountError: $('bikes-count-error'),
    durationError:   $('duration-error'),
    mobileBar:       $('mobile-total-bar'),
    steps:           $('calculator-steps'),
    summary:         $('calc-summary'),

    // Елементи лендингу поза віджетом (можуть бути відсутні — тоді просто пропускаємо)
    bookingBike:     $('booking-bike'),
    bookingDuration: $('booking-duration'),
    bookingTotal:    $('booking-total-price')
  };

  /* ---------- 2. Константи бізнес-правил ---------- */
  const DISCOUNT_THRESHOLD = 5;    // від скількох велосипедів діє знижка
  const DISCOUNT_RATE = 0.10;      // 10 %

  /* ---------- 3. Допоміжні функції ---------- */

  // Ціна з data-атрибута: лише скінченне невід'ємне число, інакше 0
  function toPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  // Межі (min/max) читаємо з HTML-атрибутів, з безпечним запасним значенням
  function readLimit(input, attr, fallback) {
    const n = Number(input ? input.getAttribute(attr) : NaN);
    return Number.isInteger(n) ? n : fallback;
  }

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // Строгий розбір цілого числа: "3" → 3; "", "2.5", "abc", "1e3" → NaN
  function parseStrictInt(raw) {
    const s = String(raw).trim();
    return /^-?\d+$/.test(s) ? Number(s) : NaN;
  }

  // 1 година, 2 години, 5 годин, 11 годин, 21 година
  function pluralHours(n) {
    const last = n % 10;
    const lastTwo = n % 100;
    if (last === 1 && lastTwo !== 11) return 'година';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'години';
    return 'годин';
  }

  // 1935 → "1 935 ₴"
  function formatMoney(n) {
    const safe = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    return `${safe.toLocaleString('uk-UA')} ₴`;
  }

  /* ---------- 4. Межі та стан ---------- */
  const HOURS_MIN = readLimit(el.durationRange, 'min', 1);
  const HOURS_MAX = readLimit(el.durationRange, 'max', 12);
  const COUNT_MIN = readLimit(el.bikesCount, 'min', 1);
  const COUNT_MAX = readLimit(el.bikesCount, 'max', 10);

  // Останні коректні значення: поки користувач вводить помилку, розрахунок тримається на них
  let lastValidHours = clamp(parseStrictInt(el.durationRange?.value) || HOURS_MIN, HOURS_MIN, HOURS_MAX);
  let lastValidCount = clamp(parseStrictInt(el.bikesCount?.value) || COUNT_MIN, COUNT_MIN, COUNT_MAX);

  /* ---------- 5. Помилки ---------- */
  const errors = new Map(); // ключ поля → текст помилки

  function setFieldError(key, message) {
    errors.set(key, message);
    const input = key === 'count' ? el.bikesCount : el.durationRange;
    const box = key === 'count' ? el.bikesCountError : el.durationError;
    if (box) {
      // текст пишемо у <span data-error-text>, щоб не стерти іконку поруч
      const textEl = box.querySelector('[data-error-text]') || box;
      textEl.textContent = message;
      box.hidden = false;
    }
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(key) {
    errors.delete(key);
    const input = key === 'count' ? el.bikesCount : el.durationRange;
    const box = key === 'count' ? el.bikesCountError : el.durationError;
    if (box) box.hidden = true;
    if (input) input.setAttribute('aria-invalid', 'false');
  }

  // Поле, до якого веде пункт у загальному блоці помилок
  const ERROR_FIELDS = { count: 'bikes-count', hours: 'duration-range' };

  function renderErrors() {
    if (!el.errorsBox || !el.errorsList) return;
    el.errorsList.replaceChildren();
    errors.forEach((message, key) => {
      const li = document.createElement('li');
      const fieldId = ERROR_FIELDS[key];
      const field = fieldId ? $(fieldId) : null;
      if (field) {
        // Пункт-посилання: переводить фокус на поле з помилкою
        const link = document.createElement('a');
        link.href = `#${fieldId}`;
        link.className = 'underline underline-offset-2 hover:no-underline';
        link.textContent = message;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          field.focus({ preventScroll: true });
          field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        li.append(link);
      } else {
        li.textContent = message;
      }
      el.errorsList.append(li);
    });
    el.errorsBox.hidden = errors.size === 0;
  }

  /* ---------- 5a. Захист від непередбачених збоїв ---------- */
  // Технічний текст помилки (TypeError тощо) йде лише в консоль для розробника,
  // а користувач бачить зрозуміле повідомлення
  function handleUnexpected(error) {
    console.error('[BikeDash] Непередбачена помилка калькулятора:', error);
    errors.set('fatal', 'Не вдалося оновити розрахунок. Оновіть сторінку або залиште заявку — ми порахуємо вартість вручну.');
    try { renderErrors(); } catch (_) { /* блок помилок недоступний — нічого не показуємо */ }
  }

  // Обгортка для обробників подій: збій в одному обробнику не ламає сторінку
  const safe = (handler) => (...args) => {
    try {
      return handler(...args);
    } catch (error) {
      handleUnexpected(error);
      return undefined;
    }
  };

  /* ---------- 6. Валідація кількості ---------- */
  // Повертає { value, error }. value = NaN, якщо дані некоректні
  function validateCount() {
    const input = el.bikesCount;
    const raw = input.value.trim();

    if (input.validity.badInput) {
      return { value: NaN, error: 'Кількість має бути числом, без літер і символів.' };
    }
    if (raw === '') {
      return { value: NaN, error: `Вкажіть кількість велосипедів (від ${COUNT_MIN} до ${COUNT_MAX}).` };
    }
    const n = parseStrictInt(raw);
    if (Number.isNaN(n)) {
      return { value: NaN, error: 'Кількість має бути цілим числом, наприклад 3.' };
    }
    if (n < COUNT_MIN || n > COUNT_MAX) {
      return { value: n, error: `Можна обрати від ${COUNT_MIN} до ${COUNT_MAX} велосипедів. Для більшої групи залиште заявку.` };
    }
    return { value: n, error: null };
  }

  /* ---------- 7. Зчитування стану форми ---------- */
  function getBike() {
    const radio = form.querySelector('input[name="bike-type"]:checked') || el.bikeRadios[0];
    return {
      name: radio?.dataset.name || 'Велосипед',
      rate: toPrice(radio?.dataset.rate)
    };
  }

  function getHours() {
    const n = parseStrictInt(el.durationRange?.value);
    if (Number.isNaN(n) || n < HOURS_MIN || n > HOURS_MAX) {
      setFieldError('hours', `Тривалість має бути від ${HOURS_MIN} до ${HOURS_MAX} годин.`);
      return lastValidHours;
    }
    clearFieldError('hours');
    lastValidHours = n;
    return n;
  }

  function getCount() {
    const { value, error } = validateCount();
    if (error) {
      setFieldError('count', error);
      return lastValidCount; // під час введення не рахуємо з помилкою
    }
    clearFieldError('count');
    lastValidCount = value;
    return value;
  }

  function getRoute() {
    const option = el.routeSelect?.selectedOptions[0];
    return {
      selected: Boolean(option) && option.value !== 'none',
      name: option ? option.textContent.split('·')[0].trim() : '',
      price: toPrice(option?.dataset.price)
    };
  }

  function getEquipment() {
    return [...el.equipment].map((input) => ({
      key: input.value,                   // gps / helmet / seat / insurance
      name: input.dataset.name || input.value,
      price: toPrice(input.dataset.price),
      checked: input.checked
    }));
  }

  /* ---------- 8. Чистий розрахунок (без DOM) ---------- */
  function calculate({ rate, hours, count, equipment, routePrice }) {
    const optionsPerBike = equipment
      .filter((item) => item.checked)
      .reduce((sum, item) => sum + item.price, 0);

    const bikeCost = rate * hours * count;
    const perBike = rate * hours + optionsPerBike;
    const subtotal = perBike * count + routePrice;
    const hasDiscount = count >= DISCOUNT_THRESHOLD;

    let total = hasDiscount ? Math.round(subtotal * (1 - DISCOUNT_RATE)) : Math.round(subtotal);
    if (!Number.isFinite(total) || total < 0) total = 0; // останній захист від NaN / Infinity / мінуса

    return { bikeCost, subtotal, hasDiscount, discount: Math.max(subtotal - total, 0), total };
  }

  /* ---------- 9. Оновлення інтерфейсу ---------- */
  function setRow(key, visible, label, cost) {
    const row = $(`summary-row-${key}`);
    if (!row) return;
    row.hidden = !visible;
    const labelEl = $(`summary-${key}-label`);
    const costEl = $(`summary-${key}-cost`);
    if (labelEl && label !== undefined) labelEl.textContent = label;
    if (costEl && cost !== undefined) costEl.textContent = cost;
  }

  function render() {
    const bike = getBike();
    const hours = getHours();
    const count = getCount();
    const route = getRoute();
    const equipment = getEquipment();

    const result = calculate({ rate: bike.rate, hours, count, equipment, routePrice: route.price });

    // Тривалість і пресети
    if (el.durationValue) el.durationValue.textContent = String(hours);
    if (el.durationUnit) el.durationUnit.textContent = pluralHours(hours);
    el.presets.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.hours) === hours));
    });

    // Кнопки «−» / «+»
    if (el.bikesDecrease) el.bikesDecrease.disabled = count <= COUNT_MIN;
    if (el.bikesIncrease) el.bikesIncrease.disabled = count >= COUNT_MAX;

    // Деталізація
    setRow('bike', true,
      `${bike.name} · ${hours} год × ${bike.rate} ₴ × ${count}`,
      formatMoney(result.bikeCost));

    equipment.forEach((item) => {
      setRow(item.key, item.checked,
        `${item.name} × ${count}`,
        item.price === 0 ? 'Безкоштовно' : formatMoney(item.price * count));
    });

    setRow('route', route.selected, `Маршрут: ${route.name} (за групу)`, formatMoney(route.price));
    setRow('discount', result.hasDiscount, 'Групова знижка −10%', `−${formatMoney(result.discount)}`);
    if (el.discountBadge) el.discountBadge.hidden = !result.hasDiscount;

    // Підсумок
    const totalText = formatMoney(result.total);
    if (el.total) el.total.textContent = totalText;
    if (el.mobileTotal) el.mobileTotal.textContent = totalText;

    syncLanding({ bike, hours, count, totalText });
    errors.delete('fatal'); // розрахунок пройшов успішно — прибираємо повідомлення про збій
    renderErrors();
  }

  /* ---------- 9a. Інтеграція з лендингом ---------- */
  // Передає вибір у форму бронювання та підсвічує картку моделі в каталозі
  function syncLanding({ bike, hours, count, totalText }) {
    if (el.bookingBike) {
      el.bookingBike.value = count > 1 ? `${bike.name} × ${count}` : bike.name;
    }
    if (el.bookingDuration) {
      el.bookingDuration.value = `${hours} ${pluralHours(hours)}`;
    }
    if (el.bookingTotal) {
      const strong = el.bookingTotal.querySelector('strong');
      (strong || el.bookingTotal).textContent = totalText;
    }
    if (typeof window.syncBikeCards === 'function') {
      window.syncBikeCards(bike.name);
    }
  }

  /* ---------- 9b. Мобільна панель підсумку ---------- */
  // Показується лише тоді, коли користувач гортає кроки, а картка підсумку ще за екраном.
  // На ширині від 1024 px панель прихована класом lg:hidden — там підсумок «прилипає» збоку.
  function initMobileBar() {
    if (!el.mobileBar || !el.steps || !el.summary || !('IntersectionObserver' in window)) return;
    let stepsVisible = false;
    let summaryVisible = false;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === el.steps) stepsVisible = entry.isIntersecting;
        if (entry.target === el.summary) summaryVisible = entry.isIntersecting;
      });
      el.mobileBar.hidden = !(stepsVisible && !summaryVisible);
    });
    observer.observe(el.steps);
    observer.observe(el.summary);
  }

  /* ---------- 10. Нормалізація кількості після завершення введення ---------- */
  function normalizeCount() {
    const input = el.bikesCount;
    const raw = input.value.trim();
    let next;

    if (raw === '' && !input.validity.badInput) {
      next = COUNT_MIN;                         // порожнє поле → 1
    } else {
      const n = parseStrictInt(raw);
      next = Number.isNaN(n) ? lastValidCount   // текст, дріб → останнє коректне значення
                             : clamp(n, COUNT_MIN, COUNT_MAX); // поза межами → у діапазон
    }
    input.value = String(next);
    render();
  }

  function stepCount(delta) {
    const { value } = validateCount();
    const base = Number.isNaN(value) ? lastValidCount : clamp(value, COUNT_MIN, COUNT_MAX);
    el.bikesCount.value = String(clamp(base + delta, COUNT_MIN, COUNT_MAX));
    render();
  }

  /* ---------- 11. Обробники подій ---------- */
  el.bikeRadios.forEach((radio) => radio.addEventListener('change', safe(render)));

  el.durationRange?.addEventListener('input', safe(render));

  el.presets.forEach((btn) => {
    btn.addEventListener('click', safe(() => {
      const hours = parseStrictInt(btn.dataset.hours);
      if (Number.isNaN(hours)) return;
      el.durationRange.value = String(clamp(hours, HOURS_MIN, HOURS_MAX));
      render();
    }));
  });

  if (el.bikesCount) {
    el.bikesCount.addEventListener('input', safe(render));       // перевірка під час введення
    el.bikesCount.addEventListener('change', safe(normalizeCount)); // виправлення після введення

    // Не даємо ввести символи, які браузер допускає в number: e, E, +, -, крапку, кому
    el.bikesCount.addEventListener('keydown', (event) => {
      if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
    });

    // Вставка з буфера: дозволяємо лише цілі числа
    el.bikesCount.addEventListener('paste', safe((event) => {
      const text = (event.clipboardData?.getData('text') || '').trim();
      if (!/^\d+$/.test(text)) {
        event.preventDefault();
        setFieldError('count', 'Вставлено некоректне значення. Введіть ціле число від 1 до 10.');
        renderErrors();
      }
    }));
  }

  el.bikesDecrease?.addEventListener('click', safe(() => stepCount(-1)));
  el.bikesIncrease?.addEventListener('click', safe(() => stepCount(+1)));

  el.routeSelect?.addEventListener('change', safe(render));
  el.equipment.forEach((input) => input.addEventListener('change', safe(render)));

  // Enter у полі кількості не повинен перезавантажувати сторінку
  form.addEventListener('submit', safe((event) => {
    event.preventDefault();
    normalizeCount();
  }));

  /* ---------- 12. Початковий розрахунок ---------- */
  safe(render)();
  safe(initMobileBar)();

  // Для ручного тестування в консолі: BikeDashCalculator.calculate({...})
  window.BikeDashCalculator = { calculate, pluralHours, formatMoney };
});
