import type { ImageMetadata } from 'astro';

const imageModules = import.meta.glob<{ default: ImageMetadata }>(
	'../assets/images/**/*.{jpg,jpeg,png,gif,webp}',
	{ eager: true },
);

export function resolveCmsImage(path: string): ImageMetadata | undefined {
	const filename = path.replace(/\\/g, '/').split('/').pop();
	if (!filename) return undefined;

	for (const [modulePath, mod] of Object.entries(imageModules)) {
		if (modulePath.endsWith(`/${filename}`) || modulePath.endsWith(filename)) {
			return mod.default;
		}
	}

	return undefined;
}
