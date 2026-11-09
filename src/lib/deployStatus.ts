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
const IDLE_POLL_MS = 120_000;
const ACTIVE_POLL_MS = 30_000;
const PUBLISH_POLL_MS = 5_000;
const PUBLISH_TIMEOUT_MS = 90_000;
const RATE_LIMIT_BACKOFF_MS = 120_000;
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
		if (parsed.phase === 'hidden' || parsed.phase === 'updating' || parsed.phase === 'ready') {
			return {
				phase: parsed.phase,
				expectedSha: parsed.expectedSha ?? null,
				publishWaitStarted: parsed.publishWaitStarted ?? null,
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

async function fetchGithub(url: string): Promise<{ status: number; json: unknown }> {
	const res = await fetch(url, {
		cache: 'no-cache',
		credentials: 'omit',
		headers: GITHUB_HEADERS,
	});
	if (res.status === 403 || res.status === 429) {
		throw new Error(`github-rate-limit:${res.status}`);
	}
	if (res.status === 304) {
		return { status: 304, json: null };
	}
	if (!res.ok) throw new Error(`github:${res.status}`);
	return { status: res.status, json: await res.json() };
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

async function pollGithub(
	current: DeployTracker,
	pageBuildId: string,
	cached: { sha: string | null; suites: CheckSuite[] },
): Promise<{ tracker: DeployTracker; sha: string | null; suites: CheckSuite[] }> {
	const ref = await fetchGithub(REF_URL);
	const sha = ref.status === 304 ? cached.sha : shaFromRef(ref.json);
	if (!sha) throw new Error('github-ref:missing-sha');

	if (sha === pageBuildId) {
		return { tracker: { ...emptyTracker(), skipSuitesForSha: sha }, sha, suites: cached.suites };
	}

	if (sha === current.skipSuitesForSha && current.phase !== 'updating') {
		return { tracker: { ...emptyTracker(), skipSuitesForSha: sha }, sha, suites: cached.suites };
	}

	const payload = await fetchGithub(checkSuitesUrl(sha));
	const suites = payload.status === 304 ? cached.suites : suitesFromPayload(payload.json);
	const state = rollup(suites);

	if (state === 'in_flight' || state === 'unknown') {
		return {
			sha,
			suites,
			tracker: {
				phase: 'updating',
				expectedSha: sha,
				publishWaitStarted: null,
				skipSuitesForSha: null,
			},
		};
	}

	if (state === 'success' && (current.phase === 'updating' || current.expectedSha === sha)) {
		return {
			sha,
			suites,
			tracker: {
				phase: 'updating',
				expectedSha: sha,
				publishWaitStarted: current.publishWaitStarted ?? Date.now(),
				skipSuitesForSha: null,
			},
		};
	}

	return { sha, suites, tracker: { ...emptyTracker(), skipSuitesForSha: sha } };
}

function nextInterval(tracker: DeployTracker, rateLimited: boolean): number {
	if (rateLimited) return RATE_LIMIT_BACKOFF_MS;
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
	let lastSha: string | null = tracker.expectedSha ?? tracker.skipSuitesForSha;
	let lastSuites: CheckSuite[] = [];

	function emit(next: DeployTracker) {
		tracker = next;
		writeTracker(opts.pageBuildId, tracker);
		if (tracker.phase !== lastPhase) {
			lastPhase = tracker.phase;
			opts.onPhase(tracker.phase);
		}
	}

	emit(tracker);

	async function tick() {
		if (stopped) return;

		if (document.visibilityState === 'hidden') {
			schedule(IDLE_POLL_MS);
			return;
		}

		if (tracker.phase === 'ready') return;

		let rateLimited = false;
		try {
			let next = tracker;
			if (tracker.publishWaitStarted) {
				next = await confirmPublish(tracker, opts.pageBuildId);
			} else {
				const result = await pollGithub(tracker, opts.pageBuildId, { sha: lastSha, suites: lastSuites });
				lastSha = result.sha;
				lastSuites = result.suites;
				next = result.tracker;
				if (next.publishWaitStarted) {
					next = await confirmPublish(next, opts.pageBuildId);
				}
			}
			emit(next);
			if (next.phase === 'ready') return;
			schedule(nextInterval(next, false));
		} catch (error) {
			rateLimited = error instanceof Error && error.message.startsWith('github-rate-limit:');
			schedule(nextInterval(tracker, rateLimited));
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
