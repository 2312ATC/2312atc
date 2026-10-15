import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { noCacheHeaders } from '../lib/cacheHeaders';
import { blogPostGitDates } from '../lib/gitHistory';

export const GET = (async (context) => {
	const posts = await getCollection('blog');
	const feed = await rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site ?? new URL('https://tavistock.air-cadets.org'),
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${post.id}`,
			pubDate: blogPostGitDates(post.id).published,
		})),
	});

	for (const [key, value] of Object.entries(noCacheHeaders)) {
		feed.headers.set(key, value);
	}

	return feed;
}) satisfies APIRoute;
