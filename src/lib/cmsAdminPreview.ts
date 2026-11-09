import { CMS_PREVIEW_MESSAGE, CMS_PREVIEW_READY } from './cmsPreviewProtocol';

const LOCAL_MEDIA = '/assets/images/';

const PREVIEWS = {
	landingCarousel: '/',
	staff: '/about',
	offers: '/about',
	activities: '/whatWeDo',
	faq: '/joinUs',
	opportunities: '/cadets',
	cadetLinks: '/cadets',
	blog: '/cms-preview/blog',
	events: '/cms-preview/event',
	notifications: '/cms-preview/notification',
} as const;

type CollectionName = keyof typeof PREVIEWS;

type AssetLike = {
	url?: string;
	toString(): string;
};

type GetAsset = (path?: string, field?: unknown) => unknown;

type Hyperscript = (
	type: unknown,
	props?: Record<string, unknown> | null,
	...children: unknown[]
) => unknown;

type CreateClass = (spec: object) => unknown;

type WidgetInstance = {
	props: { getAsset?: GetAsset } & Record<string, unknown>;
	__cmsGetAssetOrig?: GetAsset;
	__cmsGetAsset?: GetAsset;
};

type WidgetControl = {
	prototype?: {
		render?: ((this: WidgetInstance) => unknown) & { __cmsPatched?: boolean };
	};
};

type DecapCMS = {
	init?: (...args: unknown[]) => unknown;
	getWidget?: (name: string) => { control?: WidgetControl } | undefined;
	registerPreviewTemplate: (name: string, component: unknown) => void;
};

type MarkedApi = ((src: string) => string) | { parse?: (src: string) => string };

type ImmutableData = {
	toJS?: () => unknown;
};

type PreviewProps = {
	document?: Document;
	entry?: { get?: (key: string) => ImmutableData | undefined };
	getAsset: GetAsset;
};

type PreviewInstance = {
	props: PreviewProps;
	iframe: HTMLIFrameElement | null;
	debounce: ReturnType<typeof setTimeout> | null;
	_onReady?: (event: MessageEvent) => void;
	prepareFrame: () => void;
	send: () => void;
	queue: () => void;
	onReady: (event: MessageEvent) => void;
};

function decapGlobals() {
	return window as Window & {
		CMS?: DecapCMS;
		h?: Hyperscript;
		createClass?: CreateClass;
		marked?: MarkedApi;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function markdownToHtml(src: string) {
	if (!src) return '';
	const marked = decapGlobals().marked;
	try {
		if (marked && typeof marked === 'object' && typeof marked.parse === 'function') {
			return marked.parse(src);
		}
		if (typeof marked === 'function') return marked(src);
	} catch (error) {
		console.warn('CMS preview markdown failed', error);
	}
	return `<p>${String(src)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n\n/g, '</p><p>')
		.replace(/\n/g, '<br>')}</p>`;
}

function filenameOf(path: string) {
	const parts = path.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] || '';
}

function usableAssetUrl(url: string) {
	return /^(blob:|data:|https?:|\/(?!\.\.))/i.test(url);
}

function localMediaUrl(path: string) {
	const filename = filenameOf(path);
	return filename ? LOCAL_MEDIA + encodeURIComponent(filename) : '';
}

function assetToUrl(asset: unknown) {
	if (!asset) return '';
	if (typeof asset === 'string') return asset;
	if (typeof asset === 'object' && typeof (asset as AssetLike).toString === 'function') {
		return (asset as AssetLike).toString();
	}
	return String(asset);
}

function localAsset(path: string) {
	const local = localMediaUrl(path);
	if (!local) return null;
	return {
		url: local,
		toString() {
			return local;
		},
	};
}

function wrapGetAsset(getAsset: GetAsset): GetAsset {
	return (path, field) => {
		if (path && !usableAssetUrl(path)) {
			const local = localAsset(path);
			if (local) return local;
		}
		const asset = getAsset(path, field);
		const url = assetToUrl(asset);
		if (usableAssetUrl(url)) return asset;
		return localAsset(path || url) ?? asset;
	};
}

function patchImageWidget(CMS: DecapCMS) {
	const control = CMS.getWidget?.('image')?.control;
	const origRender = control?.prototype?.render;
	if (!control?.prototype || !origRender || origRender.__cmsPatched) return;
	const renderFn: (this: WidgetInstance) => unknown = origRender;

	function patchedRender(this: WidgetInstance) {
		const getAsset = this.props.getAsset;
		if (getAsset && this.__cmsGetAssetOrig !== getAsset) {
			this.__cmsGetAssetOrig = getAsset;
			this.__cmsGetAsset = wrapGetAsset(getAsset);
		}
		if (this.__cmsGetAsset) {
			const previous = this.props;
			this.props = { ...previous, getAsset: this.__cmsGetAsset };
			try {
				return renderFn.call(this);
			} finally {
				this.props = previous;
			}
		}
		return renderFn.call(this);
	}
	patchedRender.__cmsPatched = true;
	control.prototype.render = patchedRender;
}

function resolveImage(getAsset: GetAsset, value: unknown) {
	if (!value || typeof value !== 'string') return '';
	if (usableAssetUrl(value)) return value;
	try {
		const url = assetToUrl(getAsset(value));
		if (usableAssetUrl(url)) return url;
	} catch {
		/* fall through to the same-origin media fallback */
	}
	return localMediaUrl(value);
}

function asDate(value: unknown) {
	if (value == null || value === '') return null;
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(value: unknown) {
	const date = asDate(value);
	if (!date) return '';
	return date.toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

function formatShortDate(value: unknown) {
	const date = asDate(value);
	if (!date) return '';
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

function formatTimeLabel(value: unknown) {
	const date = asDate(value);
	if (!date) return '';
	if (date.getHours() === 0 && date.getMinutes() === 0) return '';
	return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function serializeEntry(props: PreviewProps) {
	const data = props.entry?.get?.('data');
	const raw = data?.toJS?.() ?? {};
	const plain: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
	const getAsset = props.getAsset;

	if (Array.isArray(plain.items)) {
		plain.items = plain.items.map((item) => {
			if (!isRecord(item)) return item;
			const next = { ...item };
			if (next.image) next.imageSrc = resolveImage(getAsset, next.image);
			if (typeof next.body === 'string' && next.body) next.bodyHtml = markdownToHtml(next.body);
			return next;
		});
	}

	if (plain.heroImage) plain.heroImageSrc = resolveImage(getAsset, plain.heroImage);
	if (typeof plain.body === 'string' && plain.body) plain.bodyHtml = markdownToHtml(plain.body);

	if (plain.date) {
		plain.dateLabel = formatDateLabel(plain.date);
		plain.timeLabel = formatTimeLabel(plain.date);
		plain.showTime = Boolean(plain.timeLabel);
	}
	if (plain.endDate) plain.endDateLabel = formatShortDate(plain.endDate);
	if (plain.pubDate) plain.pubDateLabel = formatShortDate(plain.pubDate);
	if (plain.notBefore) plain.notBeforeLabel = formatShortDate(plain.notBefore);
	if (plain.notAfter) plain.notAfterLabel = formatShortDate(plain.notAfter);

	return plain;
}

function previewSrc(path: string) {
	return `${path}${path.includes('?') ? '&' : '?'}cms-preview=1`;
}

function makePreview(h: Hyperscript, createClass: CreateClass, collection: CollectionName, path: string) {
	return createClass({
		iframe: null as HTMLIFrameElement | null,
		debounce: null as ReturnType<typeof setTimeout> | null,
		prepareFrame(this: PreviewInstance) {
			const doc = this.props.document;
			if (!doc) return;
			doc.documentElement.style.height = '100%';
			doc.documentElement.style.margin = '0';
			doc.body.style.height = '100%';
			doc.body.style.margin = '0';
			doc.body.style.padding = '0';
			doc.body.style.overflow = 'hidden';
			doc.body.style.position = 'relative';
		},
		send(this: PreviewInstance) {
			const iframe = this.iframe;
			if (!iframe?.contentWindow) return;
			iframe.contentWindow.postMessage(
				{
					type: CMS_PREVIEW_MESSAGE,
					collection,
					data: serializeEntry(this.props),
				},
				window.location.origin,
			);
		},
		queue(this: PreviewInstance) {
			if (this.debounce) clearTimeout(this.debounce);
			this.debounce = setTimeout(() => {
				this.send();
			}, 50);
		},
		onReady(this: PreviewInstance, event: MessageEvent) {
			if (event.origin !== window.location.origin) return;
			if (!isRecord(event.data) || event.data.type !== CMS_PREVIEW_READY) return;
			if (!this.iframe || event.source !== this.iframe.contentWindow) return;
			this.send();
		},
		componentDidMount(this: PreviewInstance) {
			this.prepareFrame();
			this._onReady = (event) => this.onReady(event);
			window.addEventListener('message', this._onReady);
			this.queue();
		},
		componentDidUpdate(this: PreviewInstance) {
			this.queue();
		},
		componentWillUnmount(this: PreviewInstance) {
			if (this.debounce) clearTimeout(this.debounce);
			if (this._onReady) window.removeEventListener('message', this._onReady);
		},
		render(this: PreviewInstance) {
			return h(
				'div',
				{
					style: {
						position: 'absolute',
						inset: '0',
						width: '100%',
						height: '100%',
					},
				},
				h('iframe', {
					src: previewSrc(path),
					title: 'Live page preview',
					style: {
						width: '100%',
						height: '100%',
						border: 'none',
						display: 'block',
						background: '#fff',
					},
					ref: (el: HTMLIFrameElement | null) => {
						this.iframe = el;
					},
					onLoad: () => {
						this.send();
					},
				}),
			);
		},
	});
}

export function registerCmsPreview() {
	const { CMS, h, createClass } = decapGlobals();
	if (!CMS || !h || !createClass) return;

	patchImageWidget(CMS);
	const origInit = CMS.init;
	if (typeof origInit === 'function' && !(origInit as { __cmsPatched?: boolean }).__cmsPatched) {
		const patchedInit = (...args: unknown[]) => {
			patchImageWidget(CMS);
			return origInit.apply(CMS, args);
		};
		(patchedInit as { __cmsPatched?: boolean }).__cmsPatched = true;
		CMS.init = patchedInit;
	}

	(Object.keys(PREVIEWS) as CollectionName[]).forEach((name) => {
		CMS.registerPreviewTemplate(name, makePreview(h, createClass, name, PREVIEWS[name]));
	});
}
