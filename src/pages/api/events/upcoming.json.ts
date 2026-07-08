import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { noCacheHeaders } from '../../../lib/cacheHeaders';

export const GET = (async () => {
	const now = new Date();

	const events = (await getCollection('events'))
		.filter((e) => e.data.date >= now)
		.sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf())
		.slice(0, 20)
		.map((e) => ({
			id: e.id,
			title: e.data.title,
			date: e.data.date.toISOString(),
			endDate: e.data.endDate?.toISOString() ?? null,
			location: e.data.location,
			description: e.data.description,
			url: `/events/${e.id}/`,
		}));

	return new Response(JSON.stringify({ events }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			...noCacheHeaders,
		},
	});
}) satisfies APIRoute;
