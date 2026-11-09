import { GITHUB_REPO } from '../consts';

export type DeployPhase = 'hidden' | 'updating' | 'ready';

export interface DeployTracker {
	phase: DeployPhase;
	expectedSha: string | null;
	publishWaitStarted: number | null;
	skipSuitesForSha: string | null;
}

interface CheckSuite {
	id: number;
	head_sha: string;
	status: string;
	conclusion: string | null;
}

const IN_FLIGHT = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);
const TRACKER_KEY = 'atc2312-deploy-tracker';
const SNAPSHOT_KEY = 'atc2312-deploy-github-snapshot';
const IDLE_POLL_MS = 120_000;
const ACTIVE_POLL_MS = 60_000;
const PUBLISH_POLL_MS = 5_000;
const PUBLISH_TIMEOUT_MS = 90_000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000;
const GITHUB_HEADERS = {
	Accept: 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
};

const REF_URL = `https://api.github.com/repos/${GITHUB_REPO}/git/ref/heads/main`;

function checkSuitesUrl(sha: string): string {
	return `https://api.github.com/repos/${GITHUB_REPO}/commits/${sha}/check-suites`;
}

interface StoredTracker extends DeployTracker {
	pageBuildId: string;
}

interface GithubSnapshot {
	fetchedAt: number;
	sha: string | null;
	suites: CheckSuite[];
	rateLimitedUntil: number | null;
}

class GithubError extends Error {
	constructor(
		message: string,
		readonly rateLimited: boolean,
		readonly resetMs: number | null,
	) {
		super(message);
		this.name = 'GithubError';
	}
}

export function emptyTracker(): DeployTracker {
	return { phase: 'hidden', expectedSha: null, publishWaitStarted: null, skipSuitesForSha: null };
}

export function isInFlightStatus(status: string): boolean {
	return IN_FLIGHT.has(status);
}

function readTracker(pageBuildId: string): DeployTracker {
	try {
		const raw = sessionStorage.getItem(TRACKER_KEY);
		if (!raw) return emptyTracker();
		const parsed = JSON.parse(raw) as StoredTracker;
		if (!parsed || parsed.pageBuildId !== pageBuildId) return emptyTracker();
		if (parsed.phase === 'ready' && parsed.expectedSha && parsed.expectedSha === pageBuildId) {
			return emptyTracker();
		}
		if (parsed.phase === 'ready') {
			return {
				phase: 'ready',
				expectedSha: parsed.expectedSha ?? null,
				publishWaitStarted: parsed.publishWaitStarted ?? null,
				skipSuitesForSha: parsed.skipSuitesForSha ?? null,
			};
		}
		if (parsed.phase === 'updating' && parsed.publishWaitStarted) {
			return {
				phase: 'updating',
				expectedSha: parsed.expectedSha ?? null,
				publishWaitStarted: parsed.publishWaitStarted,
				skipSuitesForSha: null,
			};
		}
		if (parsed.phase === 'hidden' || parsed.phase === 'updating') {
			return {
				phase: 'hidden',
				expectedSha: null,
				publishWaitStarted: null,
				skipSuitesForSha: parsed.skipSuitesForSha ?? null,
			};
		}
	} catch {
		/* fall through */
	}
	return emptyTracker();
}

function writeTracker(pageBuildId: string, tracker: DeployTracker): void {
	try {
		const stored: StoredTracker = { ...tracker, pageBuildId };
		sessionStorage.setItem(TRACKER_KEY, JSON.stringify(stored));
	} catch {
		/* private browsing */
	}
}

function readSnapshot(): GithubSnapshot | null {
	try {
		const raw = localStorage.getItem(SNAPSHOT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as GithubSnapshot;
		if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
		return {
			fetchedAt: parsed.fetchedAt,
			sha: typeof parsed.sha === 'string' ? parsed.sha : null,
			suites: Array.isArray(parsed.suites) ? parsed.suites : [],
			rateLimitedUntil: typeof parsed.rateLimitedUntil === 'number' ? parsed.rateLimitedUntil : null,
		};
	} catch {
		return null;
	}
}

function writeSnapshot(snapshot: GithubSnapshot): void {
	try {
		localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
	} catch {
		/* private browsing */
	}
}

function snapshotAgeMs(snapshot: GithubSnapshot | null): number {
	if (!snapshot) return Number.POSITIVE_INFINITY;
	return Date.now() - snapshot.fetchedAt;
}

function rateLimitFrom(res: Response): { remaining: number | null; resetMs: number | null } {
	const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
	const reset = Number(res.headers.get('X-RateLimit-Reset'));
	return {
		remaining: Number.isFinite(remaining) ? remaining : null,
		resetMs: Number.isFinite(reset) ? Math.max(60_000, reset * 1000 - Date.now()) : null,
	};
}

async function fetchGithub(url: string): Promise<{
	status: number;
	json: unknown;
	remaining: number | null;
	resetMs: number | null;
}> {
	const res = await fetch(url, {
		cache: 'no-cache',
		credentials: 'omit',
		headers: GITHUB_HEADERS,
	});
	const limit = rateLimitFrom(res);
	if (res.status === 403 || res.status === 429) {
		throw new GithubError(`github-rate-limit:${res.status}`, true, limit.resetMs);
	}
	if (!res.ok) throw new GithubError(`github:${res.status}`, false, null);
	return {
		status: res.status,
		json: await res.json(),
		remaining: limit.remaining,
		resetMs: limit.resetMs,
	};
}

function shaFromRef(json: unknown): string | null {
	if (!json || typeof json !== 'object') return null;
	const object = (json as { object?: { sha?: unknown } }).object;
	return typeof object?.sha === 'string' ? object.sha : null;
}

function suitesFromPayload(json: unknown): CheckSuite[] {
	if (!json || typeof json !== 'object') return [];
	const rows = (json as { check_suites?: unknown }).check_suites;
	if (!Array.isArray(rows)) return [];

	const suites: CheckSuite[] = [];
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue;
		const item = row as {
			id?: unknown;
			head_sha?: unknown;
			status?: unknown;
			conclusion?: unknown;
			app?: { slug?: unknown };
		};
		if (item.app?.slug && item.app.slug !== 'github-actions') continue;
		if (typeof item.id !== 'number' || typeof item.head_sha !== 'string' || typeof item.status !== 'string') {
			continue;
		}
		suites.push({
			id: item.id,
			head_sha: item.head_sha,
			status: item.status,
			conclusion: typeof item.conclusion === 'string' ? item.conclusion : null,
		});
	}
	return suites;
}

function rollup(suites: CheckSuite[]): 'in_flight' | 'success' | 'failure' | 'unknown' {
	if (suites.length === 0) return 'unknown';
	if (suites.some((suite) => isInFlightStatus(suite.status))) return 'in_flight';
	if (suites.some((suite) => suite.status === 'completed' && suite.conclusion === 'success')) return 'success';
	return 'failure';
}

export async function fetchLiveBuildId(): Promise<string | null> {
	try {
		const res = await fetch(`/api/build.json?t=${Date.now()}`, { cache: 'no-store' });
		if (!res.ok) return null;
		const data = (await res.json()) as { buildId?: unknown };
		return typeof data.buildId === 'string' ? data.buildId : null;
	} catch {
		return null;
	}
}

async function confirmPublish(tracker: DeployTracker, pageBuildId: string): Promise<DeployTracker> {
	if (!tracker.publishWaitStarted || !tracker.expectedSha) return tracker;

	if (tracker.expectedSha === pageBuildId) {
		return emptyTracker();
	}

	if (!pageBuildId) {
		return { ...tracker, phase: 'ready' };
	}

	const live = await fetchLiveBuildId();
	if (live && live !== pageBuildId) {
		return { ...tracker, phase: 'ready' };
	}

	if (Date.now() - tracker.publishWaitStarted > PUBLISH_TIMEOUT_MS) {
		return { ...tracker, phase: 'ready' };
	}

	return tracker;
}

function trackerFromSuites(
	current: DeployTracker,
	pageBuildId: string,
	sha: string,
	suites: CheckSuite[],
): DeployTracker {
	if (sha === pageBuildId) {
		return { ...emptyTracker(), skipSuitesForSha: sha };
	}

	const state = rollup(suites);
	if (state === 'in_flight') {
		return {
			phase: 'updating',
			expectedSha: sha,
			publishWaitStarted: null,
			skipSuitesForSha: null,
		};
	}

	if (state === 'success' && (current.phase === 'updating' || current.expectedSha === sha)) {
		return {
			phase: 'updating',
			expectedSha: sha,
			publishWaitStarted: current.publishWaitStarted ?? Date.now(),
			skipSuitesForSha: null,
		};
	}

	return { ...emptyTracker(), skipSuitesForSha: sha };
}

async function refreshGithub(
	current: DeployTracker,
	pageBuildId: string,
	snapshot: GithubSnapshot | null,
	maxAgeMs: number,
): Promise<{ tracker: DeployTracker; snapshot: GithubSnapshot }> {
	if (snapshot?.rateLimitedUntil && snapshot.rateLimitedUntil > Date.now()) {
		throw new GithubError('github-rate-limit:cached', true, snapshot.rateLimitedUntil - Date.now());
	}

	const fresh = snapshotAgeMs(snapshot) <= maxAgeMs ? snapshot : null;
	if (fresh?.sha) {
		return {
			snapshot: fresh,
			tracker: trackerFromSuites(current, pageBuildId, fresh.sha, fresh.suites),
		};
	}

	const watching = current.phase === 'updating' && current.expectedSha;
	if (watching) {
		const payload = await fetchGithub(checkSuitesUrl(current.expectedSha!));
		const suites = suitesFromPayload(payload.json);
		const nextSnapshot: GithubSnapshot = {
			fetchedAt: Date.now(),
			sha: current.expectedSha,
			suites,
			rateLimitedUntil: null,
		};
		writeSnapshot(nextSnapshot);
		return {
			snapshot: nextSnapshot,
			tracker: trackerFromSuites(current, pageBuildId, current.expectedSha!, suites),
		};
	}

	const ref = await fetchGithub(REF_URL);
	const sha = shaFromRef(ref.json);
	if (!sha) throw new GithubError('github-ref:missing-sha', false, null);

	if (sha === pageBuildId || (sha === current.skipSuitesForSha && current.phase !== 'updating')) {
		const nextSnapshot: GithubSnapshot = {
			fetchedAt: Date.now(),
			sha,
			suites: snapshot?.sha === sha ? snapshot.suites : [],
			rateLimitedUntil: null,
		};
		writeSnapshot(nextSnapshot);
		return { snapshot: nextSnapshot, tracker: { ...emptyTracker(), skipSuitesForSha: sha } };
	}

	if (ref.remaining !== null && ref.remaining < 2) {
		throw new GithubError('github-rate-limit:low', true, ref.resetMs);
	}

	const payload = await fetchGithub(checkSuitesUrl(sha));
	const suites = suitesFromPayload(payload.json);
	const nextSnapshot: GithubSnapshot = {
		fetchedAt: Date.now(),
		sha,
		suites,
		rateLimitedUntil: null,
	};
	writeSnapshot(nextSnapshot);
	return { snapshot: nextSnapshot, tracker: trackerFromSuites(current, pageBuildId, sha, suites) };
}

function nextInterval(tracker: DeployTracker): number {
	if (tracker.phase === 'updating') {
		return tracker.publishWaitStarted ? PUBLISH_POLL_MS : ACTIVE_POLL_MS;
	}
	return IDLE_POLL_MS;
}

export function startDeployNoticePolling(opts: {
	pageBuildId: string;
	onPhase: (phase: DeployPhase) => void;
}): () => void {
	let timer: number | undefined;
	let stopped = false;
	let tracker = readTracker(opts.pageBuildId);
	let lastPhase: DeployPhase | null = null;
	let snapshot = readSnapshot();

	function emit(next: DeployTracker) {
		tracker = next;
		writeTracker(opts.pageBuildId, tracker);
		if (tracker.phase !== lastPhase) {
			lastPhase = tracker.phase;
			opts.onPhase(tracker.phase);
		}
	}

	function hideUntilRetry(waitMs: number) {
		emit(emptyTracker());
		schedule(waitMs);
	}

	emit(tracker);

	async function tick() {
		if (stopped) return;

		if (document.visibilityState === 'hidden') {
			schedule(IDLE_POLL_MS);
			return;
		}

		if (tracker.phase === 'ready') return;

		try {
			let next = tracker;
			if (tracker.publishWaitStarted) {
				next = await confirmPublish(tracker, opts.pageBuildId);
			} else {
				const result = await refreshGithub(tracker, opts.pageBuildId, snapshot, nextInterval(tracker));
				snapshot = result.snapshot;
				next = result.tracker;
				if (next.publishWaitStarted) {
					next = await confirmPublish(next, opts.pageBuildId);
				}
			}
			emit(next);
			if (next.phase === 'ready') return;
			schedule(nextInterval(next));
		} catch (error) {
			const retryMs =
				error instanceof GithubError && error.rateLimited
					? (error.resetMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS)
					: IDLE_POLL_MS;
			if (error instanceof GithubError && error.rateLimited) {
				snapshot = {
					fetchedAt: Date.now(),
					sha: snapshot?.sha ?? null,
					suites: snapshot?.suites ?? [],
					rateLimitedUntil: Date.now() + retryMs,
				};
				writeSnapshot(snapshot);
			}
			hideUntilRetry(retryMs);
		}
	}

	function schedule(ms: number) {
		if (stopped) return;
		window.clearTimeout(timer);
		timer = window.setTimeout(() => void tick(), ms);
	}

	function onVisibility() {
		if (stopped || document.visibilityState !== 'visible') return;
		if (tracker.phase === 'ready') return;
		window.clearTimeout(timer);
		void tick();
	}

	document.addEventListener('visibilitychange', onVisibility);
	void tick();

	return () => {
		stopped = true;
		window.clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
