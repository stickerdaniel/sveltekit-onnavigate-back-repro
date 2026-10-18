// Automated reproduction: `npm run build && npm run repro`.
// For every mode, opens /a, clicks "Go to B" and calls history.back() right after
// SvelteKit's history.pushState for /b returns, while onNavigate is still pending.
// A trial is stale when the address is back on /a but page B is rendered.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PORT = 4318;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TRIALS = 12;
const MODES = ['hold&hold=100', 'transition', 'transition-faq'];

const kit = JSON.parse(readFileSync('node_modules/@sveltejs/kit/package.json', 'utf8')).version;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
	stdio: 'ignore'
});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const results = [];
let browser;
let chromiumVersion;
try {
	for (let i = 0; ; i++) {
		if (i === 100) throw new Error('vite preview did not start');
		try {
			if ((await fetch(ORIGIN + '/a')).ok) break;
		} catch {}
		await sleep(100);
	}

	browser = await chromium.launch();
	chromiumVersion = browser.version();
	for (const mode of MODES) {
		for (let trial = 1; trial <= TRIALS; trial++) {
			const context = await browser.newContext({ reducedMotion: 'no-preference' });
			const page = await context.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await page.goto(`${ORIGIN}/a?mode=${mode}`);
				await page.locator('[data-hydrated="true"]').waitFor();
				await page.evaluate(() => {
					const pushState = history.pushState;
					history.pushState = function (...args) {
						const result = pushState.apply(this, args);
						history.pushState = pushState;
						history.back();
						return result;
					};
					addEventListener('popstate', () => (window.popped = true), { once: true });
					// Records every heading that gets rendered, to catch page B showing briefly.
					window.headings = [];
					new MutationObserver(() => {
						const heading = document.querySelector('h1')?.textContent;
						if (heading !== window.headings.at(-1)) window.headings.push(heading);
					}).observe(document.body, { childList: true, subtree: true, characterData: true });
				});
				await page.getByRole('link', { name: 'Go to B' }).click();
				await page.waitForFunction(() => window.popped);
				await page.waitForFunction(() => document.querySelector('#navigating')?.textContent === 'null');
				await sleep(600);
				const state = await page.evaluate(() => ({
					location: location.pathname,
					pageUrl: document.querySelector('#page-url')?.textContent,
					heading: document.querySelector('h1')?.textContent,
					headings: window.headings
				}));
				const stale = state.location === '/a' && state.heading === 'Page B';
				const flashed = state.headings.includes('Page B');
				results.push({ kit, mode, trial, stale, flashed, ...state, errors });
			} finally {
				await context.close();
			}
		}
	}
} finally {
	await browser?.close();
	server.kill();
}

writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log(`@sveltejs/kit ${kit}, Chromium ${chromiumVersion}`);
for (const mode of MODES) {
	const rows = results.filter((row) => row.mode === mode);
	const count = (key) => `${rows.filter((row) => row[key]).length}/${rows.length}`;
	console.log(`${mode.padEnd(16)} B stays ${count('stale')}, B rendered at some point ${count('flashed')}`);
}
