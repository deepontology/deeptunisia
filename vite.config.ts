import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: { allow: ['..'] },
		/*
		 * Agora is a tab in this app, not a separate site — so its API has to look
		 * same-origin to the browser.
		 *
		 * That matters for more than tidiness. The atlas asserts, on every route and
		 * in both themes, that it makes zero cross-origin requests; the rule exists
		 * because the site was found handing every reader's page to Google through a
		 * webfont. Talking to a second origin for discussion data would break that
		 * assertion and would tell a second server what each reader is reading.
		 *
		 * Proxying keeps the atlas fully prerendered and free to host: the static
		 * build has no server, and /api is answered by the community worker. In
		 * production the same shape is a Cloudflare route mapping /api/* to the
		 * worker and everything else to the static site.
		 */
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:5200',
				changeOrigin: false
			}
		}
	}
});
