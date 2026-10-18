// Регистрация service worker. Обычный скрипт (не модуль) — подключается напрямую в index.html.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // офлайн-кэш оболочки не критичен для работы — приложение продолжит работать без него
    });
  });
}
