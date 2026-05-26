import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { orderedListLoader, orderedListSchema } from './content/loaders/orderedListLoader';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
		}),
});

const landingCarouselItem = z.object({
	image: z.string(),
	caption: z.string().optional(),
	link: z.string().optional(),
});

const landingCarousel = defineCollection({
	loader: orderedListLoader({
		file: 'src/content/landingCarousel.json',
		itemSchema: landingCarouselItem,
	}),
	schema: orderedListSchema(landingCarouselItem),
});

const events = defineCollection({
	loader: glob({ base: './src/content/events', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			date: z.coerce.date(),
			endDate: z.coerce.date().optional(),
			location: z.string(),
			description: z.string(),
			heroImage: z.optional(image()),
		}),
});

const notifications = defineCollection({
	loader: glob({ base: './src/content/notifications', pattern: '**/*.{md,mdx,json}' }),
	schema: z.object({
		title: z.string(),
		message: z.string(),
		pubDate: z.coerce.date(),
		notBefore: z.coerce.date(),
		notAfter: z.coerce.date(),
		type: z.enum(['info', 'warning', 'alert']).default('info'),
		icon: z.string().optional(),
		active: z.boolean().default(true),
	}),
});

const staffItem = z.object({
	name: z.string(),
	role: z.string(),
	bio: z.string().optional(),
});

const staff = defineCollection({
	loader: orderedListLoader({ file: 'src/content/staff.json', itemSchema: staffItem }),
	schema: orderedListSchema(staffItem),
});

const activityItem = z.object({
	title: z.string(),
	icon: z.string(),
	body: z.string(),
	bodyHtml: z.string(),
});

const activities = defineCollection({
	loader: orderedListLoader({ file: 'src/content/activities.json', itemSchema: activityItem }),
	schema: orderedListSchema(activityItem),
});

const opportunityItem = z.object({
	title: z.string(),
	description: z.string(),
	icon: z.string(),
});

const opportunities = defineCollection({
	loader: orderedListLoader({
		file: 'src/content/opportunities.json',
		itemSchema: opportunityItem,
	}),
	schema: orderedListSchema(opportunityItem),
});

const faqItem = z.object({
	question: z.string(),
	body: z.string(),
	bodyHtml: z.string(),
});

const faq = defineCollection({
	loader: orderedListLoader({ file: 'src/content/faq.json', itemSchema: faqItem }),
	schema: orderedListSchema(faqItem),
});

const cadetLinkItem = z.object({
	label: z.string(),
	url: z.string(),
	icon: z.string(),
	external: z.boolean().default(false),
});

const cadetLinks = defineCollection({
	loader: orderedListLoader({ file: 'src/content/cadetLinks.json', itemSchema: cadetLinkItem }),
	schema: orderedListSchema(cadetLinkItem),
});

export const collections = {
	blog,
	landingCarousel,
	events,
	notifications,
	staff,
	activities,
	opportunities,
	faq,
	cadetLinks,
};
