import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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

const landingCarousel = defineCollection({
	loader: glob({ base: './src/content/landingCarousel', pattern: '**/*.{md,mdx,json}' }),
	schema: ({ image }) =>
		z.object({
			image: image(),
			caption: z.string().optional(),
			link: z.string().optional(),
		}),
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

const staff = defineCollection({
	loader: glob({ base: './src/content/staff', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		name: z.string(),
		role: z.string(),
		bio: z.string().optional(),
		order: z.number().default(99),
	}),
});

const activities = defineCollection({
	loader: glob({ base: './src/content/activities', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		icon: z.string(),
		order: z.number().default(99),
	}),
});

const opportunities = defineCollection({
	loader: glob({ base: './src/content/opportunities', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		icon: z.string(),
		order: z.number().default(99),
	}),
});

const faq = defineCollection({
	loader: glob({ base: './src/content/faq', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		question: z.string(),
		order: z.number().default(99),
	}),
});

export const collections = { blog, landingCarousel, events, notifications, staff, activities, opportunities, faq };
