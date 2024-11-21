document.addEventListener('DOMContentLoaded', function () {
  let elements = document.querySelectorAll('[data-i18n]');
  for (let element of elements) {
    let messageKey = element.getAttribute('data-i18n');
    element.textContent = browser.i18n.getMessage(messageKey);
  }
});
