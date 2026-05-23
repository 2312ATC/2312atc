import { getCollection } from 'astro:content';
import type { APIRoute, GetStaticPaths } from 'astro';
import { noCacheHeaders } from '../../../../lib/cacheHeaders';

export const getStaticPaths = (async () => {
	const events = await getCollection('events');

	const monthSet = new Set<string>();

	// Every month that has at least one event
	for (const event of events) {
		const d = event.data.date;
		monthSet.add(`${d.getFullYear()}_${d.getMonth()}`);
	}

	// Current month ±18 so the calendar can browse freely
	const now = new Date();
	for (let offset = -18; offset <= 18; offset++) {
		const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
		monthSet.add(`${d.getFullYear()}_${d.getMonth()}`);
	}

	return [...monthSet].map((key) => {
		const [year, month] = key.split('_');
		return { params: { year, month } };
	});
}) satisfies GetStaticPaths;

export const GET = (async ({ params }) => {
	const year = Number(params.year);
	const month = Number(params.month); // 0-indexed (Jan = 0)

	const events = await getCollection('events');

	const monthEvents = events
		.filter((e) => {
			const d = e.data.date;
			return d.getFullYear() === year && d.getMonth() === month;
		})
		.sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf())
		.map((e) => ({
			id: e.id,
			title: e.data.title,
			date: e.data.date.toISOString(),
			endDate: e.data.endDate?.toISOString() ?? null,
			location: e.data.location,
			description: e.data.description,
			url: `/events/${e.id}/`,
		}));

	return new Response(JSON.stringify({ year, month, events: monthEvents }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			...noCacheHeaders,
		},
	});
}) satisfies APIRoute;
