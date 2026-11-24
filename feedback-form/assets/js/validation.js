  /**
   * validation.js
   * Валідація форми зворотного зв'язку (Vanilla JS, без бібліотек).
   *
   * Очікувані id в HTML:
   *   feedbackForm, username, email, phone, message, agreement
   *
   * Для повідомлення про помилку скрипт шукає елемент з id "<id>-error"
   * (наприклад, "username-error"). Якщо такого елемента немає, він створюється
   * автоматично одразу після поля.
   *
   * UX-логіка:
   *   1. Після завантаження сторінки жодних помилок і успішних станів немає.
   *   2. Поле вважається "торкнутим" після blur (або change для чекбокса).
   *   3. blur       -> фінальна перевірка поля.
   *   4. input      -> оновлює стан поля, але лише якщо поле вже торкнуте
   *                    або була спроба відправлення.
   *   5. submit     -> перевіряє всі поля, фокус на першому невалідному.
   */

  (() => {
    'use strict';

    /* ==========================================================
    * 1. Налаштування
    * ========================================================== */

    // Tailwind-класи станів
    const CLASS_ERROR = 'border-red-500';
    const CLASS_SUCCESS = 'border-green-500';

    // Базовий клас межі, який конфліктує зі станами (прибираємо його на час стану).
    // Має збігатися з класом у index.html. slate-500 дає контраст понад 3:1 (WCAG 1.4.11).
    const CLASS_DEFAULT_BORDER = 'border-slate-500';

    // Класи тексту помилки (використовуються лише при автостворенні елемента)
    const ERROR_TEXT_CLASSES = ['mt-1.5', 'text-sm', 'font-medium', 'text-red-700'];

    // Правила валідації (без змін)
    const MIN_NAME_LENGTH = 2;
    const MIN_MESSAGE_LENGTH = 10;
    const MAX_MESSAGE_LENGTH = 1000;
    const MAX_EMAIL_LENGTH = 254;
    // Домен без порожніх сегментів: відхиляє a@.b.cc та a@b..cc
    const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
    const PHONE_REGEX = /^\+380\d{9}$/;

    /* ==========================================================
    * 2. Доступ до елементів і стан взаємодії
    * ========================================================== */

    const form = document.getElementById('feedbackForm');
    if (!form) return; // Форми немає на сторінці: нічого робити

    const fields = {
      username: document.getElementById('username'),
      email: document.getElementById('email'),
      phone: document.getElementById('phone'),
      message: document.getElementById('message'),
      agreement: document.getElementById('agreement'),
    };

    // Захист: якщо в HTML бракує якогось id, скрипт не ламає сторінку, а пише причину в консоль
    const missingIds = Object.entries(fields)
      .filter(([, element]) => !element)
      .map(([id]) => id);

    if (missingIds.length > 0) {
      console.error(`validation.js: не знайдено елементи з id: ${missingIds.join(', ')}`);
      return;
    }

    // Лічильник символів повідомлення (необов'язковий елемент)
    const messageCounter = document.getElementById('message-counter');

    // Поля, з якими користувач уже взаємодіяв (пройшли blur / change)
    const touchedFields = new Set();

    // Чи була спроба відправлення форми
    let submitAttempted = false;

    /* ==========================================================
    * 3. Допоміжні функції інтерфейсу
    * ========================================================== */

    /**
     * Додає id елемента помилки до aria-describedby поля,
     * не затираючи вже наявні значення (наприклад, підказку формату).
     */
    function linkErrorToField(field, errorEl) {
      const ids = (field.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean);

      if (!ids.includes(errorEl.id)) {
        ids.push(errorEl.id);
        field.setAttribute('aria-describedby', ids.join(' '));
      }
    }

    /**
     * Повертає елемент для тексту помилки поля.
     * Якщо його немає в HTML, створює <p> після поля.
     */
    function getErrorElement(field) {
      const errorId = `${field.id}-error`;
      let errorEl = document.getElementById(errorId);

      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.id = errorId;
        errorEl.setAttribute('aria-live', 'polite');
        errorEl.classList.add(...ERROR_TEXT_CLASSES);

        // Для чекбокса вставляємо після всього рядка (батьківського контейнера)
        const anchor = field.type === 'checkbox' ? field.parentElement : field;
        anchor.insertAdjacentElement('afterend', errorEl);
      }

      linkErrorToField(field, errorEl);
      return errorEl;
    }

    /** Показує помилку: червона межа, текст під полем, aria-invalid. */
    function showError(field, text) {
      field.classList.remove(CLASS_SUCCESS, CLASS_DEFAULT_BORDER);
      field.classList.add(CLASS_ERROR);
      field.setAttribute('aria-invalid', 'true');

      getErrorElement(field).textContent = text;
    }

    /** Показує успішний стан: зелена межа, текст помилки прибирається. */
    function showSuccess(field) {
      field.classList.remove(CLASS_ERROR, CLASS_DEFAULT_BORDER);
      field.classList.add(CLASS_SUCCESS);
      field.removeAttribute('aria-invalid');

      getErrorElement(field).textContent = '';
    }

    /**
     * За результатом перевірки (порожній рядок = помилок немає)
     * показує потрібний стан. Повертає true, якщо поле валідне.
     */
    function applyResult(field, errorText) {
      if (errorText) {
        showError(field, errorText);
        return false;
      }
      showSuccess(field);
      return true;
    }

    /* ==========================================================
    * 4. Функції перевірки окремих полів
    *    Кожна повертає текст помилки або '' (якщо все гаразд).
    *    Правила не змінені; уточнено лише тексти повідомлень,
    *    щоб вони підказували, що саме виправити.
    * ========================================================== */

    /** Ім'я: мінімум 2 символи (пробіли по краях не враховуються). */
    function getUsernameError(value) {
      const name = value.trim();
      if (name.length === 0) return "Вкажіть, як до вас звертатися";
      if (name.length < MIN_NAME_LENGTH) {
        return `Ім'я має містити щонайменше ${MIN_NAME_LENGTH} символи`;
      }
      return '';
    }

    /** Емейл: перевіряємо лише формат name@domain.zone. */
    function getEmailError(value) {
      const email = value.trim();
      if (email.length === 0) return 'Вкажіть email, щоб ми могли відповісти';
      if (email.length > MAX_EMAIL_LENGTH) {
        return `Адреса задовга: максимум ${MAX_EMAIL_LENGTH} символи`;
      }
      if (EMAIL_REGEX.test(email)) return '';

      // Уточнюємо причину, щоб користувач знав, що виправити
      if (/\s/.test(email)) return 'Приберіть пробіли в адресі';
      if (!email.includes('@')) {
        return 'В адресі бракує символу @, наприклад name@example.com';
      }
      return 'Перевірте адресу: вона має виглядати як name@example.com';
    }

    /** Телефон: строго +380 і 9 цифр, без пробілів, дужок і дефісів. */
    function getPhoneError(value) {
      if (value.length === 0) {
        return 'Вкажіть номер телефону у форматі +380XXXXXXXXX';
      }
      if (PHONE_REGEX.test(value)) return '';

      // Уточнюємо причину, щоб користувач знав, що виправити
      if (/[\s()\-]/.test(value)) {
        return 'Приберіть пробіли, дужки та дефіси: номер має виглядати як +380501234567';
      }
      if (!value.startsWith('+380')) {
        return 'Номер має починатися з +380, наприклад +380501234567';
      }

      const digitsAfterCode = value.slice(4);
      if (/\D/.test(digitsAfterCode)) {
        return 'Після +380 мають бути лише цифри';
      }
      return `Після +380 має бути рівно 9 цифр (зараз ${digitsAfterCode.length})`;
    }

    /** Повідомлення: мінімум 10 символів (пробіли по краях не враховуються). */
    function getMessageError(value) {
      const text = value.trim();
      if (text.length === 0) return 'Напишіть, із чим ми можемо допомогти';
      if (text.length < MIN_MESSAGE_LENGTH) {
        return `Напишіть трохи більше: мінімум ${MIN_MESSAGE_LENGTH} символів (зараз ${text.length})`;
      }
      return '';
    }

    /** Згода: чекбокс має бути відмічений. */
    function getAgreementError(isChecked) {
      return isChecked ? '' : 'Щоб надіслати форму, потрібна ваша згода';
    }

    /* ==========================================================
    * 5. Функції валідації з відображенням результату
    *    Кожна повертає true (валідно) або false (є помилка).
    * ========================================================== */

    const validateUsername = () =>
      applyResult(fields.username, getUsernameError(fields.username.value));

    const validateEmail = () =>
      applyResult(fields.email, getEmailError(fields.email.value));

    const validatePhone = () =>
      applyResult(fields.phone, getPhoneError(fields.phone.value));

    const validateMessage = () =>
      applyResult(fields.message, getMessageError(fields.message.value));

    const validateAgreement = () =>
      applyResult(fields.agreement, getAgreementError(fields.agreement.checked));

    // Відповідність «поле → функція перевірки» (порядок = порядок у формі)
    const validators = [
      [fields.username, validateUsername],
      [fields.email, validateEmail],
      [fields.phone, validatePhone],
      [fields.message, validateMessage],
      [fields.agreement, validateAgreement],
    ];

    /* ==========================================================
    * 6. Валідація всієї форми
    * ========================================================== */

    /**
     * Запускає всі перевірки (без раннього виходу, щоб показати всі помилки одразу).
     * Повертає перше невалідне поле або null, якщо форма коректна.
     */
    function validateForm() {
      let firstInvalid = null;

      validators.forEach(([field, validate]) => {
        touchedFields.add(field); // після submit усі поля вважаються торкнутими
        const isValid = validate();
        if (!isValid && !firstInvalid) firstInvalid = field;
      });

      return firstInvalid;
    }

    /* ==========================================================
    * 7. Обробники подій
    * ========================================================== */

    /** Чи можна показувати стан поля під час вводу. */
    function canValidateLive(field) {
      return submitAttempted || touchedFields.has(field);
    }

    /**
     * blur: фінальна перевірка поля після того, як користувач його залишив.
     * Якщо blur спричинено втратою фокусу вікна (перехід на іншу вкладку),
     * перевірку пропускаємо, щоб не показувати помилку передчасно.
     */
    function handleBlur(field, validate) {
      if (!document.hasFocus()) return;
      touchedFields.add(field);
      validate();
    }

    /** input: оновлює стан, лише якщо поле вже торкнуте або була спроба submit. */
    function handleInput(field, validate) {
      if (canValidateLive(field)) validate();
    }

    /**
     * change (чекбокс): перевірка одразу після зміни стану.
     * Для чекбокса blur не використовується: просте проходження Tab-ом
     * не повинно викликати помилку.
     */
    function handleCheckboxChange(field, validate) {
      touchedFields.add(field);
      validate();
    }

    /**
     * Обробник вводу для поля телефону.
     * При першому символі одразу додає +380 перед ним.
     * Якщо перший символ — 0 (код оператора), він замінюється на +380.
     * Якщо користувач видаляє символи і руйнує префікс +380 — відновлює його.
     */
    function handlePhoneInput() {
      const field = fields.phone;
      let val = field.value;

      // Вже починається з +380 — переконуємося, що не перевищено ліміт у 13 символів
      if (val.startsWith('+380')) {
        if (val.length > 13) {
          field.value = val.slice(0, 13);
        }
        if (canValidateLive(field)) validatePhone();
        return;
      }

      // Порожнє поле — нічого не робимо
      if (val.length === 0) return;

      // Користувач видалив частину префікса (+, +3, +38) →
      // відновлюємо +380 і ставимо курсор одразу після нього
      if (val.startsWith('+')) {
        field.value = '+380';
        field.setSelectionRange(4, 4);
        if (canValidateLive(field)) validatePhone();
        return;
      }

      // Прибираємо trunk-префікс 0, якщо є (не дублюємо його в номері)
      if (val.startsWith('0')) val = val.slice(1);

      // Прибираємо 380 без + якщо так ввели
      if (val.startsWith('380')) val = val.slice(3);

      field.value = ('+380' + val).slice(0, 13);

      // Переміщуємо курсор у кінець
      const len = field.value.length;
      field.setSelectionRange(len, len);

      if (canValidateLive(field)) validatePhone();
    }

    /** Підключає blur / input / change до кожного поля. */
    function attachFieldListeners() {
      validators.forEach(([field, validate]) => {
        if (field.type === 'checkbox') {
          field.addEventListener('change', () => handleCheckboxChange(field, validate));
          return;
        }

        // Для поля phone: спочатку форматуємо, потім валідуємо —
        // щоб після blur помилка зникала одразу, якщо номер став коректним
        if (field === fields.phone) {
          field.addEventListener('blur', () => {
            if (!document.hasFocus()) return;
            touchedFields.add(field);
            validatePhone();
          });
          field.addEventListener('input', handlePhoneInput);
        } else {
          field.addEventListener('blur', () => handleBlur(field, validate));
          field.addEventListener('input', () => handleInput(field, validate));
        }
      });

      // Автодоповнення телефону при вставці (paste → чекаємо, щоб браузер вставив текст)
      fields.phone.addEventListener('paste', () => setTimeout(() => {
        handlePhoneInput();
      }, 0));
    }

    /**
     * Оновлює лічильник символів повідомлення.
     * Лічильник візуальний (aria-hidden в HTML), тому скрінрідер його не озвучує.
     */
    function updateMessageCounter() {
      if (!messageCounter) return;
      messageCounter.textContent = `${fields.message.value.length} / ${MAX_MESSAGE_LENGTH}`;
    }

    /** Перехоплення відправлення форми. */
    function handleSubmit(event) {
      event.preventDefault(); // Зупиняємо стандартне відправлення
      submitAttempted = true;

      const firstInvalid = validateForm();

      // Є помилки: форму не надсилаємо, фокус на першому проблемному полі
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      sendForm();
    }

    /**
     * Дії після успішної клієнтської валідації.
     * Повідомляємо інші скрипти (модальне вікно) подією "feedback:valid".
     * Якщо додасте реальну відправку (fetch), викликайте цю подію
     * після успішної відповіді сервера.
     */
    function sendForm() {
      form.dispatchEvent(new CustomEvent('feedback:valid', { bubbles: true }));
    }

    /**
     * Скидання стану після form.reset():
     * прибираємо червоні/зелені межі, тексти помилок і службові прапорці,
     * щоб після закриття модального вікна форма виглядала як нова.
     */
    function handleReset() {
      touchedFields.clear();
      submitAttempted = false;

      validators.forEach(([field]) => {
        field.classList.remove(CLASS_ERROR, CLASS_SUCCESS);
        field.classList.add(CLASS_DEFAULT_BORDER);
        field.removeAttribute('aria-invalid');
        getErrorElement(field).textContent = '';
      });

      // Подія reset спрацьовує ДО очищення значень, тому лічильник оновлюємо з затримкою
      setTimeout(updateMessageCounter, 0);
    }

    /* ==========================================================
    * 8. Ініціалізація
    * ========================================================== */

    // Вимикаємо нативну браузерну валідацію, щоб працювали наші повідомлення
    form.setAttribute('novalidate', '');

    form.addEventListener('submit', handleSubmit);
    form.addEventListener('reset', handleReset);
    fields.message.addEventListener('input', updateMessageCounter);
    attachFieldListeners();
    // Початковий стан навмисно не чіпаємо: при завантаженні сторінки помилок немає
  })();
