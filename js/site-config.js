/**
 * Публичный URL сайта без слэша в конце, например: https://mysite.netlify.app
 * Нужен, чтобы OG / Twitter всегда имели абсолютные ссылки даже там, где нет выполнения JS.
 * Если пустая строка — в браузере подставится location.origin автоматически (см. seo-meta.js).
 */
window.HLOR_PUBLIC_ORIGIN = '';
