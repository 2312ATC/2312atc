import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { noCacheHeaders } from '../../lib/cacheHeaders';

export const GET = (async () => {
	const now = new Date();

	const notifications = (await getCollection('notifications'))
		.filter((n) => n.data.active && n.data.notAfter > now)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
		.map((n) => ({
			id: n.id,
			title: n.data.title,
			message: n.data.message,
			type: n.data.type,
			icon: n.data.icon ?? null,
			pubDate: n.data.pubDate.toISOString(),
			notBefore: n.data.notBefore.toISOString(),
			notAfter: n.data.notAfter.toISOString(),
		}));

	return new Response(JSON.stringify({ notifications }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			...noCacheHeaders,
		},
	});
}) satisfies APIRoute;
