import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const imagesDir = join(process.cwd(), 'src/assets/images');
const urlPrefix = '/assets/images/';
const srcPrefix = '/src/assets/images/';

type NextFunction = (err?: unknown) => void;

/** Structural so ViteDevServer is assignable without importing `vite`. */
type MiddlewareServer = {
	middlewares: {
		stack: { route: string; handle: unknown }[];
	};
};

function rewriteCmsImageUrl(req: IncomingMessage, _res: ServerResponse, next: NextFunction) {
	const raw = req.url ?? '';
	const path = raw.split('?')[0] ?? '';
	if (path.startsWith(urlPrefix)) {
		req.url = srcPrefix + raw.slice(urlPrefix.length);
	}
	next();
}

function prependMiddleware(server: MiddlewareServer) {
	server.middlewares.stack.unshift({
		route: '',
		handle: rewriteCmsImageUrl,
	});
}

export function cmsImageDevPlugin() {
	return {
		name: 'cms-image-fallback',
		enforce: 'pre' as const,
		configureServer(server: MiddlewareServer) {
			prependMiddleware(server);
			return () => prependMiddleware(server);
		},
	};
}

export function cmsImageFallback(): AstroIntegration {
	return {
		name: 'cms-image-fallback',
		hooks: {
			'astro:server:setup': ({ server }) => {
				prependMiddleware(server);
			},
			'astro:build:done': ({ dir }) => {
				if (!existsSync(imagesDir)) return;
				const dest = join(fileURLToPath(dir), 'assets', 'images');
				mkdirSync(dest, { recursive: true });
				for (const filename of readdirSync(imagesDir)) {
					const src = join(imagesDir, filename);
					if (statSync(src).isFile()) copyFileSync(src, join(dest, filename));
				}
			},
		},
	};
}
