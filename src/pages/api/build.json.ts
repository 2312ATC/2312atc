import type { APIRoute } from 'astro';
import { noCacheHeaders } from '../../lib/cacheHeaders';

export const GET = (() => {
	const buildId = import.meta.env.PUBLIC_BUILD_ID ?? '';
	return new Response(JSON.stringify({ buildId }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			...noCacheHeaders,
		},
	});
}) satisfies APIRoute;
