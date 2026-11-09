import { buildBannerNotificationHtml, buildModalNotificationHtml } from './notificationHtml';
import { destroyLandingCarousel, initLandingCarousel } from './landingCarousel';
import { defaultIconForType, type Notification, type NotificationType } from './notifications';
import { CMS_PREVIEW_MESSAGE, CMS_PREVIEW_READY } from './cmsPreviewProtocol';

export { CMS_PREVIEW_MESSAGE, CMS_PREVIEW_READY };

interface PreviewMessage {
	type: typeof CMS_PREVIEW_MESSAGE;
	collection: string;
	data: Record<string, unknown>;
}

type Item = Record<string, unknown>;

function isPreviewMessage(value: unknown): value is PreviewMessage {
	if (!value || typeof value !== 'object') return false;
	const message = value as PreviewMessage;
	return message.type === CMS_PREVIEW_MESSAGE && typeof message.collection === 'string';
}

function textOf(item: Item, field: string): string {
	const value = item[field];
	if (value == null) return '';
	return String(value);
}

function htmlOf(item: Item, field: string): string {
	const htmlField = `${field}Html`;
	if (typeof item[htmlField] === 'string' && item[htmlField]) return item[htmlField] as string;
	const value = item[field];
	return typeof value === 'string' ? value : '';
}

function isPresent(item: Item, field: string): boolean {
	const value = item[field];
	if (typeof value === 'boolean') return value;
	if (Array.isArray(value)) return value.length > 0;
	return value != null && String(value).trim() !== '';
}

function applyShowHide(root: ParentNode, item: Item) {
	root.querySelectorAll<HTMLElement>('[data-cms-show]').forEach((el) => {
		const field = el.dataset.cmsShow;
		if (field) el.hidden = !isPresent(item, field);
	});
	root.querySelectorAll<HTMLElement>('[data-cms-hide]').forEach((el) => {
		const field = el.dataset.cmsHide;
		if (field) el.hidden = isPresent(item, field);
	});
	root.querySelectorAll<HTMLElement>('[data-cms-if]').forEach((el) => {
		const field = el.dataset.cmsIf;
		if (field) el.hidden = !isPresent(item, field);
	});
}

function bind(node: ParentNode, item: Item, index: number) {
	const elements =
		node instanceof Element ? [node, ...node.querySelectorAll<HTMLElement>('*')] : [...node.querySelectorAll<HTMLElement>('*')];

	for (const el of elements) {
		if (!(el instanceof HTMLElement)) continue;

		const altClass = el.dataset.cmsAltClass;
		if (altClass) el.classList.toggle(altClass, index % 2 === 1);

		if (el.dataset.cmsId) el.id = `${el.dataset.cmsId}-${index}`;
		if (el.dataset.cmsLabelledby) {
			el.setAttribute('aria-labelledby', `${el.dataset.cmsLabelledby}-${index}`);
		}

		if (el.dataset.cmsText) el.textContent = textOf(item, el.dataset.cmsText);
		if (el.dataset.cmsHtml) el.innerHTML = htmlOf(item, el.dataset.cmsHtml);
		if (el.dataset.cmsIcon) el.textContent = textOf(item, el.dataset.cmsIcon);

		if (el.dataset.cmsHref && el instanceof HTMLAnchorElement) {
			el.href = textOf(item, el.dataset.cmsHref) || '#';
		}

		if (el.dataset.cmsSrc && el instanceof HTMLImageElement) {
			const src = textOf(item, el.dataset.cmsSrc);
			el.src = src;
			el.hidden = !src;
		}

		if (el.dataset.cmsNewtab && el instanceof HTMLAnchorElement) {
			if (isPresent(item, el.dataset.cmsNewtab)) {
				el.target = '_blank';
				el.rel = 'noopener noreferrer';
			} else {
				el.removeAttribute('target');
				el.removeAttribute('rel');
			}
		}
	}

	applyShowHide(node, item);
}

function itemsOf(data: Record<string, unknown>): Item[] {
	return Array.isArray(data.items) ? (data.items as Item[]) : [];
}

function renderList(name: string, data: Record<string, unknown>) {
	const list = document.querySelector(`[data-cms-list="${name}"]`);
	const template = document.querySelector<HTMLTemplateElement>(`template[data-cms-template="${name}"]`);
	if (!list || !template) return;

	list.replaceChildren();
	itemsOf(data).forEach((item, index) => {
		const fragment = template.content.cloneNode(true) as DocumentFragment;
		bind(fragment, item, index);
		fragment.querySelectorAll('details').forEach((details) => {
			details.open = true;
		});
		list.appendChild(fragment);
	});

	list.scrollIntoView({ block: 'start' });
}

function unwrapLink(link: HTMLAnchorElement) {
	const parent = link.parentNode;
	if (!parent) return;
	while (link.firstChild) parent.insertBefore(link.firstChild, link);
	link.remove();
}

function applyCarousel(data: Record<string, unknown>) {
	const host = document.querySelector('[data-cms-root="landingCarousel"]');
	const sectionTpl = document.querySelector<HTMLTemplateElement>('template[data-cms-template="landingCarousel"]');
	const slideTpl = document.querySelector<HTMLTemplateElement>('template[data-cms-template="landingCarousel-slide"]');
	const dotTpl = document.querySelector<HTMLTemplateElement>('template[data-cms-template="landingCarousel-dot"]');
	if (!host || !sectionTpl || !slideTpl || !dotTpl) return;

	const existing = host.querySelector<HTMLElement>('.carousel');
	if (existing) destroyLandingCarousel(existing);

	const slides = itemsOf(data);
	if (slides.length === 0) {
		host.replaceChildren();
		return;
	}

	const sectionFrag = sectionTpl.content.cloneNode(true) as DocumentFragment;
	const carousel = sectionFrag.querySelector<HTMLElement>('.carousel');
	const track = sectionFrag.querySelector<HTMLElement>('[data-cms-carousel-track]');
	const dots = sectionFrag.querySelector<HTMLElement>('[data-cms-carousel-dots]');
	if (!carousel || !track) return;

	slides.forEach((slide, index) => {
		const slideFrag = slideTpl.content.cloneNode(true) as DocumentFragment;
		const item = slideFrag.querySelector<HTMLElement>('.carousel-item');
		const img = slideFrag.querySelector<HTMLImageElement>('.carousel-img');
		const link = slideFrag.querySelector<HTMLAnchorElement>('a');
		const caption = slideFrag.querySelector<HTMLElement>('.carousel-caption');
		if (!item || !img) return;

		item.classList.toggle('active', index === 0);
		item.setAttribute('aria-label', `Slide ${index + 1} of ${slides.length}`);
		if (index !== 0) item.setAttribute('aria-hidden', 'true');
		else item.removeAttribute('aria-hidden');

		const src = textOf(slide, 'imageSrc') || textOf(slide, 'image');
		const alt = textOf(slide, 'caption');
		img.alt = alt;
		img.src = src;
		if (index === 0) {
			img.loading = 'eager';
		}

		if (index === 0 && img.src) {
			const applyRatio = () => {
				if (!img.naturalWidth || !img.naturalHeight) return;
				carousel.style.setProperty('--carousel-reserve-w', String(img.naturalWidth));
				carousel.style.setProperty('--carousel-reserve-h', String(img.naturalHeight));
			};
			if (img.complete) applyRatio();
			else img.addEventListener('load', applyRatio, { once: true });
		}

		if (link) {
			const href = textOf(slide, 'link');
			if (href) {
				link.href = href;
				link.tabIndex = index === 0 ? 0 : -1;
				link.setAttribute('aria-label', alt || `Carousel slide ${index + 1}`);
			} else {
				unwrapLink(link);
			}
		}

		if (caption) {
			if (alt) caption.textContent = alt;
			else caption.remove();
		}

		track.appendChild(slideFrag);
	});

	const multiple = slides.length > 1;
	sectionFrag.querySelectorAll<HTMLElement>('[data-cms-if-multiple]').forEach((el) => {
		if (!multiple) el.remove();
	});

	if (multiple && dots) {
		slides.forEach((_, index) => {
			const dotFrag = dotTpl.content.cloneNode(true) as DocumentFragment;
			const dot = dotFrag.querySelector<HTMLButtonElement>('.carousel-dot');
			if (!dot) return;
			dot.classList.toggle('active', index === 0);
			dot.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
			dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
			dot.dataset.index = String(index);
			dots.appendChild(dotFrag);
		});
	}

	host.replaceChildren(sectionFrag);
	initLandingCarousel(carousel);
	host.scrollIntoView({ block: 'start' });
}

function applyBlog(data: Record<string, unknown>) {
	bind(document, data, 0);
	const title = textOf(data, 'title');
	if (title) document.title = `${title} | 2312 Squadron`;
	document.querySelectorAll<HTMLImageElement>('[data-cms-src="heroImageSrc"]').forEach((img) => {
		img.alt = title;
	});
}

function applyEvent(data: Record<string, unknown>) {
	bind(document, data, 0);
	const title = textOf(data, 'title');
	if (title) document.title = `${title} | Events | 2312 Squadron`;
}

function asNotificationType(value: unknown): NotificationType {
	if (value === 'warning' || value === 'alert' || value === 'info') return value;
	return 'info';
}

function applyNotification(data: Record<string, unknown>) {
	const active = data.active !== false;
	const type = asNotificationType(data.type);
	const notification: Notification = {
		id: 'preview',
		title: textOf(data, 'title') || 'Untitled notification',
		message: textOf(data, 'message'),
		type,
		icon: textOf(data, 'icon') || defaultIconForType(type),
		pubDate: textOf(data, 'pubDate'),
		notBefore: textOf(data, 'notBefore'),
		notAfter: textOf(data, 'notAfter'),
	};

	const banner = document.querySelector('[data-cms-notification-banner]');
	const panel = document.querySelector('[data-cms-notification-panel]');
	if (banner) banner.innerHTML = buildBannerNotificationHtml(notification);
	if (panel) panel.innerHTML = buildModalNotificationHtml(notification);

	bind(document, {
		...data,
		activeLabel: active ? 'Active' : 'Inactive — hidden on the live site',
		typeLabel: type,
		iconLabel: notification.icon,
	}, 0);
}

const handlers: Record<string, (data: Record<string, unknown>) => void> = {
	staff: (data) => renderList('staff', data),
	offers: (data) => renderList('offers', data),
	activities: (data) => renderList('activities', data),
	faq: (data) => renderList('faq', data),
	opportunities: (data) => renderList('opportunities', data),
	cadetLinks: (data) => renderList('cadetLinks', data),
	landingCarousel: applyCarousel,
	blog: applyBlog,
	events: applyEvent,
	notifications: applyNotification,
};

function loadFullIconFont() {
	if (document.getElementById('cms-preview-icons')) return;
	const style = document.createElement('style');
	style.id = 'cms-preview-icons';
	style.textContent = `
		@font-face {
			font-family: "Material Icons";
			font-style: normal;
			font-weight: 400;
			font-display: block;
			src: url("https://fonts.gstatic.com/s/materialicons/v142/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2") format("woff2");
		}
		html.cms-preview [data-cms-list],
		html.cms-preview [data-cms-root] {
			outline: 2px dashed var(--color-raf-red, #cf142b);
			outline-offset: 6px;
		}
	`;
	document.head.appendChild(style);
}

function apply(message: PreviewMessage) {
	handlers[message.collection]?.(message.data ?? {});
}

export function bootCmsPreview() {
	document.documentElement.classList.add('cms-preview');
	loadFullIconFont();

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const link = target.closest('a');
		if (!link) return;
		if (link.closest('[data-notification-banner], [data-cms-notification-banner]')) return;
		event.preventDefault();
	});

	window.addEventListener('message', (event) => {
		if (event.origin !== window.location.origin) return;
		// Decap's preview template runs in the admin window, so messages
		// arrive from top, not from this iframe's parent (the preview pane).
		if (
			event.source !== window.parent &&
			event.source !== window.top &&
			event.source !== window
		) {
			return;
		}
		if (!isPreviewMessage(event.data)) return;
		apply(event.data);
	});

	const ready = { type: CMS_PREVIEW_READY };
	window.parent.postMessage(ready, window.location.origin);
	if (window.top && window.top !== window.parent) {
		window.top.postMessage(ready, window.location.origin);
	}
}
