# SvelteKit: Back while `onNavigate` is pending keeps the abandoned page

When a navigation is superseded while its `onNavigate` callback is still pending, SvelteKit commits it anyway once the callback resolves. With Back, the newer navigation has usually finished by then, so the address bar shows `/a` while page B stays rendered and `page.url` says `/b`.

Reported in [sveltejs/kit#17492](https://github.com/sveltejs/kit/issues/17492).

## By hand

[Open in StackBlitz](https://stackblitz.com/github/stickerdaniel/sveltekit-onnavigate-back-repro), or run `npm install && npm run dev`.

1. Open `/a`.
2. Click “Go to B”. `onNavigate` holds this navigation for 1.5 s.
3. Press the browser’s Back button within those 1.5 s.

Expected: page A at `/a`.
Actual: page B at `/a`. The status bar shows `location.pathname` `/a` and `page.url.pathname` `/b`, and it stays like that until the next navigation.

The 1.5 s promise stands in for any async `onNavigate` callback. It skips navigations that keep the pathname, as many view transition setups do. The Back navigation therefore does not wait and commits first, and the superseded navigation commits after it.

## Automated

```sh
npm install
npx playwright install chromium
npm run build
npm run repro
```

`repro.mjs` opens `/a?mode=…`, clicks “Go to B” and calls `history.back()` right after SvelteKit's `history.pushState` for `/b` returns. Results with `@sveltejs/kit` 3.1.0 in Chromium 156, 12 trials per mode:

| `mode` | `onNavigate` | Page B stays under `/a` | Page B rendered at some point |
| --- | --- | --- | --- |
| `hold&hold=100` | 100 ms promise, skipped when the pathname stays | 12/12 | 12/12 |
| `transition` | view transition recipe from the FAQ, skipped when the pathname stays | 12/12 | 12/12 |
| `transition-faq` | view transition recipe from the FAQ, verbatim | 0/12 | 12/12 |

With the verbatim recipe, the Back navigation also starts a view transition. That skips the first transition and runs its update callback, so the superseded navigation commits first and page B is replaced shortly after.
