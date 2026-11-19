/**
 * success-modal.js
 * Керування доступним модальним вікном успіху (нативний <dialog>).
 *
 * Вікно відкривається лише після події "feedback:valid",
 * яку validation.js викликає, коли всі поля пройшли клієнтську валідацію.
 *
 * Очікувані id в HTML:
 *   feedbackForm, successModal, successModalClose
 */

(() => {
  'use strict';

  const form = document.getElementById('feedbackForm');
  const modal = document.getElementById('successModal');
  const closeButton = document.getElementById('successModalClose');

  if (!form || !modal || !closeButton) return;

  // Елемент, який мав фокус до відкриття (щоб повернути фокус після закриття)
  let lastFocusedElement = null;

  /** Відкриває вікно як модальне: фон стає неактивним, фокус переходить усередину. */
  function openModal() {
    if (modal.open) return;

    // Запасний варіант для застарілих браузерів без підтримки <dialog>
    if (typeof modal.showModal !== 'function') {
      window.alert(modal.querySelector('#successModalText').textContent.trim());
      form.reset();
      return;
    }

    lastFocusedElement = document.activeElement;
    document.body.classList.add('overflow-hidden'); // блокуємо прокрутку сторінки під вікном
    modal.showModal();
  }

  /** Закриває вікно (кнопка "Закрити"). */
  function closeModal() {
    if (modal.open) modal.close();
  }

  /**
   * Подія "close" спрацьовує за будь-якого способу закриття:
   * кнопка, клавіша Escape, програмний виклик.
   * Тут повертаємо сторінку в початковий стан.
   */
  function handleClose() {
    document.body.classList.remove('overflow-hidden');
    form.reset(); // очищаємо форму після успішного завершення

    // Повертаємо фокус туди, звідки користувач прийшов
    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
  }

  form.addEventListener('feedback:valid', openModal);
  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('close', handleClose);
})();
