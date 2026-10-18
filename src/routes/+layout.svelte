<script>
	import { browser } from '$app/environment';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	// The first page load picks how `onNavigate` holds a navigation:
	//   ?mode=hold (default)    resolve after `hold` ms (1500), long enough to press Back by hand
	//   ?mode=transition        the view transition recipe from the FAQ, skipped when the pathname stays
	//   ?mode=transition-faq    the FAQ recipe verbatim
	const params = new URLSearchParams(browser ? location.search : '');
	const mode = params.get('mode') ?? 'hold';
	const hold = Number(params.get('hold') ?? 1500);

	onNavigate((navigation) => {
		const samePath = navigation.from?.url.pathname === navigation.to?.url.pathname;
		if (mode !== 'transition-faq' && samePath) return;

		if (mode === 'hold') {
			return new Promise((resolve) => setTimeout(resolve, hold));
		}

		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	let hydrated = $state(false);
	afterNavigate(() => (hydrated = true));

	// pushState and replaceState fire no event, so the address is also read on an interval.
	let address = $state('');
	const readAddress = () => (address = location.pathname);
	afterNavigate(readAddress);
	onMount(() => {
		const id = setInterval(readAddress, 50);
		return () => clearInterval(id);
	});

	const mismatch = $derived(hydrated && !navigating.to && address !== page.url.pathname);
</script>

<svelte:window onpopstate={readAddress} />

<div class="app">
	{@render children()}

	<dl class="status" data-hydrated={hydrated} data-mode={mode}>
		<div><dt>mode</dt><dd>{mode}{mode === 'hold' ? ` (${hold} ms)` : ''}</dd></div>
		<div><dt>location.pathname</dt><dd id="location">{address}</dd></div>
		<div><dt>navigating.to</dt><dd id="navigating">{navigating.to?.url.pathname ?? 'null'}</dd></div>
		<div><dt>page.url.pathname</dt><dd id="page-url">{page.url.pathname}</dd></div>
	</dl>

	{#if mismatch}
		<p class="mismatch" id="mismatch">
			The address bar shows {address}, but SvelteKit rendered {page.url.pathname}.
		</p>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.status {
		display: grid;
		grid-template-columns: repeat(4, auto);
		justify-content: start;
		gap: 4px 28px;
		margin: 0;
		padding: 14px 24px;
		background: #0f172a;
		color: #e2e8f0;
	}
	dt {
		font-size: 12px;
		color: #94a3b8;
	}
	dd {
		margin: 2px 0 0;
		font: 600 16px ui-monospace, monospace;
	}
	.mismatch {
		margin: 0;
		padding: 12px 24px;
		background: #dc2626;
		color: white;
		font-weight: 600;
	}
</style>
