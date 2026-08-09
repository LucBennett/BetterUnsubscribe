/**
 * Applies i18n message strings to any element carrying a `data-i18n`
 * attribute, replacing its text content with the matching localized string.
 */
document.addEventListener('DOMContentLoaded', function () {
  let elements = document.querySelectorAll('[data-i18n]');
  for (let element of elements) {
    let messageKey = element.getAttribute('data-i18n');
    element.textContent = messenger.i18n.getMessage(messageKey);
  }
});
