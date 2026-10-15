import {
	PARENT_ORGANIZATION_NAME,
	RAFAC_URL,
	SITE_DESCRIPTION,
	SITE_TITLE,
	SQUADRON_ADDRESS_PARTS,
	SQUADRON_EMAIL,
	SQUADRON_GEO,
	SQUADRON_LEGAL_NAME,
	SQUADRON_OPENING_HOURS,
} from '../consts';

export type JsonLdNode = Record<string, unknown>;
export type WebPageType = 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage';

export interface BreadcrumbItem {
	name: string;
	url: string;
}

export function canonicalUrlFromPath(pathname: string, site: URL): URL {
	const publicPath = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
	return new URL(publicPath.length > 1 ? publicPath.replace(/\/$/, '') : publicPath || '/', site);
}

export function organizationId(siteOrigin: string): string {
	return `${siteOrigin}/#organization`;
}

export function webSiteId(siteOrigin: string): string {
	return `${siteOrigin}/#website`;
}

function idRef(id: string): JsonLdNode {
	return { '@id': id };
}

export function organizationNode(siteOrigin: string, logoUrl: string): JsonLdNode {
	return {
		'@type': 'EducationalOrganization',
		'@id': organizationId(siteOrigin),
		name: SITE_TITLE,
		legalName: SQUADRON_LEGAL_NAME,
		url: `${siteOrigin}/`,
		email: SQUADRON_EMAIL,
		description: SITE_DESCRIPTION,
		logo: {
			'@type': 'ImageObject',
			url: logoUrl,
		},
		image: logoUrl,
		address: {
			'@type': 'PostalAddress',
			...SQUADRON_ADDRESS_PARTS,
		},
		geo: {
			'@type': 'GeoCoordinates',
			latitude: SQUADRON_GEO.latitude,
			longitude: SQUADRON_GEO.longitude,
		},
		openingHours: [...SQUADRON_OPENING_HOURS],
		parentOrganization: {
			'@type': 'Organization',
			name: PARENT_ORGANIZATION_NAME,
			url: RAFAC_URL,
		},
	};
}

export function webSiteNode(siteOrigin: string): JsonLdNode {
	return {
		'@type': 'WebSite',
		'@id': webSiteId(siteOrigin),
		url: `${siteOrigin}/`,
		name: SITE_TITLE,
		description: SITE_DESCRIPTION,
		publisher: idRef(organizationId(siteOrigin)),
		inLanguage: 'en-GB',
	};
}

export function webPageNode(options: {
	url: string;
	title: string;
	description: string;
	type?: WebPageType;
	siteOrigin: string;
	mainEntityId?: string;
}): JsonLdNode {
	const node: JsonLdNode = {
		'@type': options.type ?? 'WebPage',
		'@id': options.url,
		url: options.url,
		name: options.title,
		description: options.description,
		isPartOf: idRef(webSiteId(options.siteOrigin)),
		about: idRef(organizationId(options.siteOrigin)),
		inLanguage: 'en-GB',
	};

	if (options.mainEntityId) {
		node.mainEntity = idRef(options.mainEntityId);
	}

	return node;
}

export function blogPostingNode(options: {
	url: string;
	headline: string;
	description: string;
	datePublished: Date;
	dateModified?: Date;
	imageUrl?: string;
	siteOrigin: string;
}): JsonLdNode {
	const articleId = `${options.url}#article`;
	const node: JsonLdNode = {
		'@type': 'BlogPosting',
		'@id': articleId,
		headline: options.headline,
		description: options.description,
		datePublished: options.datePublished.toISOString(),
		dateModified: (options.dateModified ?? options.datePublished).toISOString(),
		mainEntityOfPage: idRef(options.url),
		author: idRef(organizationId(options.siteOrigin)),
		publisher: idRef(organizationId(options.siteOrigin)),
		inLanguage: 'en-GB',
	};

	if (options.imageUrl) {
		node.image = options.imageUrl;
	}

	return node;
}

export function eventNode(options: {
	url: string;
	name: string;
	description: string;
	startDate: Date;
	endDate?: Date;
	imageUrl?: string;
	siteOrigin: string;
}): JsonLdNode {
	const eventId = `${options.url}#event`;
	const node: JsonLdNode = {
		'@type': 'Event',
		'@id': eventId,
		name: options.name,
		description: options.description,
		startDate: options.startDate.toISOString(),
		url: options.url,
		eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
		eventStatus: 'https://schema.org/EventScheduled',
		organizer: idRef(organizationId(options.siteOrigin)),
		location: {
			'@type': 'Place',
			address: {
				'@type': 'PostalAddress',
				addressLocality: SQUADRON_ADDRESS_PARTS.addressLocality,
				addressRegion: SQUADRON_ADDRESS_PARTS.addressRegion,
				addressCountry: SQUADRON_ADDRESS_PARTS.addressCountry,
			},
		},
	};

	if (options.endDate) {
		node.endDate = options.endDate.toISOString();
	}

	if (options.imageUrl) {
		node.image = options.imageUrl;
	}

	return node;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[], pageUrl: string): JsonLdNode {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		'@id': `${pageUrl}#breadcrumb`,
		name: items.map((item) => item.name).join(' › '),
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			'@id': `${pageUrl}#breadcrumb-${index + 1}`,
			position: index + 1,
			name: item.name,
			item: {
				'@type': 'WebPage',
				'@id': item.url,
				name: item.name,
				url: item.url,
			},
		})),
	};
}

export function buildJsonLdGraph(options: {
	siteOrigin: string;
	canonicalUrl: string;
	title: string;
	description: string;
	logoUrl: string;
	pageType?: WebPageType;
	extra?: JsonLdNode[];
	isHome?: boolean;
}): { '@context': string; '@graph': JsonLdNode[] } {
	const extra = options.extra ?? [];
	const extraMainEntity = extra.find(
		(node) => node['@type'] === 'BlogPosting' || node['@type'] === 'Event',
	);
	const mainEntityId = options.isHome
		? webSiteId(options.siteOrigin)
		: extraMainEntity
			? (extraMainEntity['@id'] as string)
			: undefined;

	const graph: JsonLdNode[] = [
		organizationNode(options.siteOrigin, options.logoUrl),
		webSiteNode(options.siteOrigin),
		webPageNode({
			url: options.canonicalUrl,
			title: options.title,
			description: options.description,
			type: options.pageType,
			siteOrigin: options.siteOrigin,
			mainEntityId,
		}),
		...extra,
	];

	return {
		'@context': 'https://schema.org',
		'@graph': graph,
	};
}
