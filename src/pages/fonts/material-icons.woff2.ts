import { getCollection, type CollectionKey } from 'astro:content';
import type { APIRoute } from 'astro';
import { collections } from '../../content.config';

const userAgent =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

/** Names written in markup, plus names assigned in script (play_arrow, warning, error). */
const markupIcons = [
	'check_circle',
	'chevron_left',
	'chevron_right',
	'close',
	'directions_walk',
	'email',
	'error',
	'event',
	'event_available',
	'family_restroom',
	'help_outline',
	'home',
	'info',
	'language',
	'location_on',
	'mail',
	'menu',
	'notifications',
	'open_in_new',
	'pause',
	'person_add',
	'play_arrow',
	'schedule',
	'warning',
] as const;

function addIcons(value: unknown, names: Set<string>) {
	if (Array.isArray(value)) {
		for (const item of value) addIcons(item, names);
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value)) {
		if (key === 'icon' && typeof child === 'string') {
			const icon = child.trim();
			if (icon) names.add(icon);
		} else {
			addIcons(child, names);
		}
	}
}

async function iconNames(): Promise<string[]> {
	const names = new Set<string>(markupIcons);
	const keys = Object.keys(collections) as CollectionKey[];
	const lists = await Promise.all(keys.map((key) => getCollection(key)));
	for (const entries of lists) {
		for (const entry of entries) addIcons(entry.data, names);
	}
	return [...names].sort();
}

let cached: { key: string; bytes: ArrayBuffer } | undefined;

async function fontBytes(): Promise<ArrayBuffer> {
	const names = await iconNames();
	console.log(names);
	const key = names.join(',');
	if (cached?.key === key) return cached.bytes;

	// https://developers.google.com/fonts/docs/material_symbols
	// icon_names must be alphabetical. FILL@1 keeps the solid style of the old Material Icons font.
	const cssUrl =
		'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL@1' +
		`&icon_names=${key}` +
		'&display=block';
	const cssResponse = await fetch(cssUrl, { headers: { 'User-Agent': userAgent } });
	if (!cssResponse.ok) {
		const detail = (await cssResponse.text()).trim();
		throw new Error(
			`Google Fonts returned ${cssResponse.status} for the icon subset.${detail ? ` ${detail}` : ''}`,
		);
	}
	const css = await cssResponse.text();
	const fontUrls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((match) => match[1]);
	if (fontUrls.length !== 1) {
		throw new Error(`Expected one icon font file from Google Fonts, got ${fontUrls.length}.`);
	}

	const fontResponse = await fetch(fontUrls[0], { headers: { 'User-Agent': userAgent } });
	if (!fontResponse.ok) {
		throw new Error(`Google Fonts returned ${fontResponse.status} while downloading the icon subset.`);
	}
	const bytes = await fontResponse.arrayBuffer();
	cached = { key, bytes };
	return bytes;
}

export const GET = (async () => {
	const bytes = await fontBytes();
	return new Response(bytes, {
		status: 200,
		headers: {
			'Content-Type': 'font/woff2',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}) satisfies APIRoute;
