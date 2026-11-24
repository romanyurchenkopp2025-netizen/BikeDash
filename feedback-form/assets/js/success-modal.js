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
window.addEventListener('load', () => {
  if (document.querySelector('.reviews-swiper') && typeof Swiper !== 'undefined') {
    new Swiper('.reviews-swiper', {
      slidesPerView: 1,
      spaceBetween: 24,
      loop: true,
      grabCursor: true,
      a11y: true,
      autoplay: {
        delay: 3500,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      },
      pagination: {
        el: '.swiper-pagination',
        clickable: true,
      },
      navigation: {
        nextEl: '.reviews-next',
        prevEl: '.reviews-prev',
      },
      breakpoints: {
        640: {
          slidesPerView: 2,
          spaceBetween: 24,
        },
        1024: {
          slidesPerView: 3,
          spaceBetween: 32,
        },
      },
    });
  }

  if (typeof Fancybox !== 'undefined' && document.querySelector('[data-fancybox="bike-gallery"]')) {
    Fancybox.bind('[data-fancybox="bike-gallery"]', {
      showClass: 'f-fadeIn',
      hideClass: 'f-fadeOut',
      Carousel: {
        transition: 'fade',
      },
      Images: {
        zoom: true,
        Panzoom: {
          maxScale: 4,
        },
      },
      Toolbar: {
        display: {
          left: [],
          middle: ['prev', 'infobar'],
          right: ['zoomIn', 'zoomOut', 'close'],
        },
      },
    });
  }
});
