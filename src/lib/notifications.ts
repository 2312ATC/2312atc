export type NotificationType = 'info' | 'warning' | 'alert';

export interface Notification {
	id: string;
	title: string;
	message: string;
	type: NotificationType;
	icon: string | null;
	pubDate: string;
	notBefore: string;
	notAfter: string;
}

interface NotificationsResponse {
	notifications: Notification[];
}

interface DismissalEntry {
	dismissedAt: string;
}

interface DismissalStore {
	version: 1;
	dismissed: Record<string, DismissalEntry>;
}

const STORAGE_KEY = 'atc2312-notification-dismissals';
const LEGACY_STORAGE_KEY = 'dismissed-notifications';
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const DEFAULT_ICONS: Record<NotificationType, string> = {
	info: 'info',
	warning: 'warning',
	alert: 'error',
};

export function defaultIconForType(type: NotificationType): string {
	return DEFAULT_ICONS[type];
}

export function iconForNotification(n: Notification): string {
	return n.icon?.trim() || defaultIconForType(n.type);
}

export function isInWindow(n: Notification, now = new Date()): boolean {
	const start = new Date(n.notBefore).getTime();
	const end = new Date(n.notAfter).getTime();
	const t = now.getTime();
	return t >= start && t < end;
}

function emptyStore(): DismissalStore {
	return { version: 1, dismissed: {} };
}

function migrateLegacyDismissals(): DismissalStore {
	const store = emptyStore();
	try {
		const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
		if (!raw) return store;
		const ids = JSON.parse(raw) as unknown;
		if (!Array.isArray(ids)) return store;
		const now = new Date().toISOString();
		for (const id of ids) {
			if (typeof id === 'string' && id) {
				store.dismissed[id] = { dismissedAt: now };
			}
		}
		localStorage.removeItem(LEGACY_STORAGE_KEY);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		/* ignore corrupt legacy data */
	}
	return store;
}

function readStore(): DismissalStore {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return migrateLegacyDismissals();
		const parsed = JSON.parse(raw) as DismissalStore;
		if (parsed?.version === 1 && parsed.dismissed && typeof parsed.dismissed === 'object') {
			return parsed;
		}
	} catch {
		/* fall through */
	}
	return migrateLegacyDismissals();
}

function writeStore(store: DismissalStore): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getDismissals(): DismissalStore {
	return readStore();
}

export function isDismissed(id: string): boolean {
	return id in readStore().dismissed;
}

export function dismiss(id: string): void {
	const store = readStore();
	if (!store.dismissed[id]) {
		store.dismissed[id] = { dismissedAt: new Date().toISOString() };
		writeStore(store);
	}
}

export function undismiss(id: string): void {
	const store = readStore();
	if (store.dismissed[id]) {
		delete store.dismissed[id];
		writeStore(store);
	}
}

export function getDismissedAt(id: string): string | null {
	return readStore().dismissed[id]?.dismissedAt ?? null;
}

/** Drop stale dismissal entries not tied to current notifications. */
export function pruneDismissals(activeIds: Set<string>): void {
	const store = readStore();
	const cutoff = Date.now() - PRUNE_AGE_MS;
	let changed = false;

	for (const [id, entry] of Object.entries(store.dismissed)) {
		if (activeIds.has(id)) continue;
		const dismissedAt = new Date(entry.dismissedAt).getTime();
		if (Number.isNaN(dismissedAt) || dismissedAt < cutoff) {
			delete store.dismissed[id];
			changed = true;
		}
	}

	if (changed) writeStore(store);
}

export async function fetchNotifications(buildId = ''): Promise<Notification[]> {
	const query = buildId ? `?v=${encodeURIComponent(buildId)}` : '';
	const url = `/api/notifications.json${query}`;
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) return [];
	const data = (await res.json()) as NotificationsResponse;
	return data.notifications ?? [];
}

export function filterInWindow(notifications: Notification[], now = new Date()): Notification[] {
	return notifications.filter((n) => isInWindow(n, now));
}

export function filterVisible(notifications: Notification[], now = new Date()): Notification[] {
	return filterInWindow(notifications, now).filter((n) => !isDismissed(n.id));
}

export function formatDismissedDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		});
	} catch {
		return '';
	}
}
