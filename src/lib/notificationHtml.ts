import { iconForNotification, type Notification } from './notifications';

/** Escape text for safe HTML interpolation (same approach as events cards). */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function notificationBodyHtml(n: Notification): string {
	const icon = escapeHtml(iconForNotification(n));
	const title = escapeHtml(n.title);
	const message = escapeHtml(n.message);

	return `
		<div class="js-notif__heading">
			<span class="js-notif__icon-wrap" aria-hidden="true">
				<span class="material-icons js-notif__icon">${icon}</span>
			</span>
			<p class="js-notif__title">${title}</p>
		</div>
		<p class="js-notif__message">${message}</p>
	`.trim();
}

/** Home page banner notification (dismissible). */
export function buildBannerNotificationHtml(n: Notification): string {
	const id = escapeHtml(n.id);
	const dismissLabel = escapeHtml(`Dismiss notification: ${n.title}`);

	return `
		<div class="js-notif js-notif--${n.type}" role="alert" aria-atomic="true" data-notif-id="${id}">
			<div class="js-notif__main">
				${notificationBodyHtml(n)}
			</div>
			<button type="button" class="js-notif__dismiss" data-dismiss-id="${id}" aria-label="${dismissLabel}">
				<span class="material-icons" aria-hidden="true">close</span>
			</button>
		</div>
	`.trim();
}

/** Header modal list item (read-only). */
export function buildModalNotificationHtml(n: Notification): string {
	return `
		<li class="js-notif js-notif--${n.type}">
			${notificationBodyHtml(n)}
		</li>
	`.trim();
}
