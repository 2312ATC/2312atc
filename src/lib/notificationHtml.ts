import { iconForNotification, type Notification, type NotificationType } from './notifications';

/** Escape text for safe HTML interpolation (same approach as events cards). */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function notificationBodyHtml(icon: string, title: string, messageHtml: string): string {
	return `
		<div class="js-notif__heading">
			<span class="js-notif__icon-wrap" aria-hidden="true">
				<span class="material-icons js-notif__icon">${escapeHtml(icon)}</span>
			</span>
			<p class="js-notif__title">${escapeHtml(title)}</p>
		</div>
		${messageHtml}
	`.trim();
}

function cmsBodyHtml(n: Notification): string {
	return notificationBodyHtml(
		iconForNotification(n),
		n.title,
		`<p class="js-notif__message">${escapeHtml(n.message)}</p>`,
	);
}

/** Home page banner notification (dismissible). */
export function buildBannerNotificationHtml(n: Notification): string {
	const id = escapeHtml(n.id);
	const dismissLabel = escapeHtml(`Dismiss notification: ${n.title}`);

	return `
		<div class="js-notif js-notif--${n.type}" role="alert" aria-atomic="true" data-notif-id="${id}">
			<div class="js-notif__main">
				${cmsBodyHtml(n)}
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
			${cmsBodyHtml(n)}
		</li>
	`.trim();
}

export type DeployNoticePhase = 'updating' | 'ready';

/** Site-update notice. Not dismissible and not part of the CMS notification list. */
export function buildDeployNoticeHtml(phase: DeployNoticePhase, type: NotificationType = 'info'): string {
	if (phase === 'updating') {
		return `
			<div class="js-notif js-notif--${type} js-notif--deploy-updating" role="status" aria-atomic="true" data-deploy-notice-card>
				<div class="js-notif__main">
					${notificationBodyHtml(
						'sync',
						'Site update in progress',
						'<p class="js-notif__message">The website is being updated. This page may change shortly.</p>',
					)}
				</div>
			</div>
		`.trim();
	}

	const href = escapeHtml(`${location.pathname}${location.search}${location.hash}` || '/');
	return `
		<div class="js-notif js-notif--${type} js-notif--deploy-ready" role="status" aria-atomic="true" data-deploy-notice-card>
			<div class="js-notif__main">
				${notificationBodyHtml(
					'check_circle',
					'Site updated',
					`<p class="js-notif__message">A new version is available. <a href="${href}" data-deploy-refresh>Refresh the page</a> to see it.</p>`,
				)}
			</div>
		</div>
	`.trim();
}
