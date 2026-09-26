# Просмотр документов — прототип

Проверка библиотеки [flyfish-dev/file-viewer](https://github.com/flyfish-dev/file-viewer)
(`@file-viewer/web-full` 3.1.2). Пользователь выбирает или перетаскивает файл,
документ рендерится прямо в браузере. Бэкенда нет, файл никуда не отправляется.

## Запуск

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # статика в dist/
pnpm preview    # проверить прод-сборку локально
```

Нужен Node 20.19+ (проверено на 23) и pnpm. Не смешивать npm и pnpm в одном `node_modules`.

## Деплой

Это чистая статика: содержимое `dist/` можно выложить на любой статический хостинг
(Cloudflare Pages, Netlify, Vercel, Render Static Site, GitHub Pages, nginx).

Требования к хостингу:

- каталог `dist/file-viewer/` (Workers, WASM, шрифты) должен отдаваться как есть,
  с корректными MIME-типами (`application/wasm`, `text/javascript`);
- SPA-fallback на `index.html` не должен перехватывать пути `/file-viewer/*` и `/assets/*`;
- приложение рассчитано на деплой в корень домена. Для подпапки задать `base` в `vite.config.ts`.

## Что внутри

- `index.html` — разметка: панель с кнопкой, строка статуса, зона просмотра, журнал событий.
- `src/main.ts` — регистрирует Web Component `<flyfish-file-viewer>`, передаёт ему
  выбранный `File` через `viewer.source = { file, filename }`, пишет события
  (`load-start`, `load-complete`, ошибки, время загрузки) в журнал.
- `vite.config.ts` — плагин `@file-viewer/vite-plugin` с `copyAssets: true`,
  который копирует ассеты рендереров в `public/file-viewer` (dev) и `dist/file-viewer` (build).

## Известные особенности

- **Vite 8 обязателен.** На Vite 7 прод-сборка падает с
  `Cannot set properties of undefined (setting 'assign')` из-за циклических чанков
  (CommonJS-шим pako внутри `preset-all`). Официальный пример библиотеки собран на Vite 8.
- Локали интерфейса viewer: только `en-US`, `zh-CN`, `ja-JP`, `de-DE`. Русской нет.
- Рендереры подгружаются лениво при открытии файла нужного типа. Первый файл каждого
  типа открывается медленнее из-за загрузки чанка.
- CAD (DWG/DWF/DWFX) работает, но этот рантайм под лицензией AGPL-3.0. Для продукта
  нужно отдельное решение.
- Заявленное качество по формату: DOCX, PPTX, PDF, изображения — high-fidelity;
  XLSX, DOC, PPT, RTF, ODT, архивы, почта — structured (структура сохраняется, оформление
  может отличаться). Полная матрица: `docs/generated/format-catalog.md` в репозитории библиотеки.

## Что проверять

Открывать реальные рабочие документы и смотреть: шрифты, колонтитулы, таблицы, формулы
в XLSX, диаграммы в PPTX, встроенные картинки, сканы в PDF. Время загрузки и рендерер
видны в строке статуса и журнале внизу страницы.
