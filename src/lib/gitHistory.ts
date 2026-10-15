import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * First and latest commit timestamps for sitemap lastmod and JSON-LD dates.
 * Created is the page file's first commit. Updated is the latest commit of
 * that file or the content files the page renders.
 */

interface GitFileDates {
	created: string;
	updated: string;
}

interface PageSources {
	primary: string;
	also?: string[];
}

export interface GitPageDates {
	created?: string;
	updated?: string;
}

let historyCache: Map<string, GitFileDates> | undefined;

const PAGE_SOURCES: Record<string, PageSources> = {
	'/': {
		primary: 'src/pages/index.astro',
		also: ['src/content/landingCarousel.json', 'src/content/blog', 'src/content/notifications'],
	},
	'/about': {
		primary: 'src/pages/about.astro',
		also: ['src/content/staff.json', 'src/content/offers.json'],
	},
	'/cadets': {
		primary: 'src/pages/cadets.astro',
		also: ['src/content/opportunities.json', 'src/content/cadetLinks.json'],
	},
	'/contact': {
		primary: 'src/pages/contact.astro',
		also: ['src/consts.ts'],
	},
	'/events': {
		primary: 'src/pages/events/index.astro',
		also: ['src/components/EventCalendar.astro', 'src/content/events'],
	},
	'/joinUs': {
		primary: 'src/pages/joinUs.astro',
		also: ['src/content/faq.json', 'src/consts.ts'],
	},
	'/whatWeDo': {
		primary: 'src/pages/whatWeDo.astro',
		also: ['src/content/activities.json'],
	},
};

function findRepoRoot(start: string): string {
	let dir = start;
	while (true) {
		if (existsSync(join(dir, '.git'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return start;
		dir = parent;
	}
}

function later(a: string, b: string): string {
	return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earlier(a: string, b: string): string {
	return Date.parse(a) <= Date.parse(b) ? a : b;
}

function applyDate(records: Map<string, GitFileDates>, filePath: string, date: string): void {
	const existing = records.get(filePath);
	if (!existing) {
		records.set(filePath, { created: date, updated: date });
		return;
	}
	existing.created = date;
}

function loadHistory(): Map<string, GitFileDates> {
	if (historyCache) return historyCache;

	const records = new Map<string, GitFileDates>();
	historyCache = records;

	let output = '';
	try {
		output = execFileSync(
			'git',
			['log', '--pretty=format:%x1e%cI', '--name-status', '--diff-filter=ACMRT'],
			{
				cwd: findRepoRoot(process.cwd()),
				encoding: 'utf8',
				maxBuffer: 32 * 1024 * 1024,
			},
		);
	} catch (error) {
		console.warn(
			`[git-history] Could not read git history (${error instanceof Error ? error.message : error}). Dates omitted.`,
		);
		return records;
	}

	const renames: { oldPath: string; newPath: string }[] = [];

	for (const chunk of output.split('\x1e')) {
		const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		const date = lines[0];
		if (!date || !/^\d{4}-\d{2}-\d{2}T/.test(date)) continue;

		for (const line of lines.slice(1)) {
			const [status, firstPath, secondPath] = line.split('\t');
			if (!status || !firstPath) continue;

			if (status.startsWith('R') && secondPath) {
				renames.push({ oldPath: firstPath, newPath: secondPath });
				applyDate(records, secondPath, date);
				continue;
			}

			applyDate(records, firstPath, date);
		}
	}

	for (const { oldPath, newPath } of renames.reverse()) {
		const oldRecord = records.get(oldPath);
		const newRecord = records.get(newPath);
		if (!oldRecord || !newRecord) continue;
		newRecord.created = earlier(newRecord.created, oldRecord.created);
	}

	return records;
}

export function normalizePathname(pathname: string): string {
	let path = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
	if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
	if (!path.startsWith('/')) path = `/${path}`;
	try {
		path = decodeURIComponent(path);
	} catch {
		// Keep the raw pathname when it is not valid encoding.
	}
	return path || '/';
}

function contentFile(dir: string, id: string, history: Map<string, GitFileDates>): string | undefined {
	const prefix = `${dir}/${id}`;
	for (const suffix of ['.md', '.mdx', '.json', '/index.md', '/index.mdx', '/index.json']) {
		const candidate = prefix + suffix;
		if (history.has(candidate)) return candidate;
	}
	return undefined;
}

function filesFor(entries: string[], history: Map<string, GitFileDates>): string[] {
	const files: string[] = [];
	for (const entry of entries) {
		if (history.has(entry)) {
			files.push(entry);
			continue;
		}
		const prefix = `${entry}/`;
		for (const key of history.keys()) {
			if (key.startsWith(prefix)) files.push(key);
		}
	}
	return files;
}

function sourcesForPathname(pathname: string, history: Map<string, GitFileDates>): PageSources | undefined {
	const path = normalizePathname(pathname);
	const known = PAGE_SOURCES[path];
	if (known) return known;

	if (/^\/blog\/page\/\d+$/.test(path)) {
		return { primary: 'src/pages/blog/page/[page].astro', also: ['src/content/blog'] };
	}

	if (path.startsWith('/blog/')) {
		const file = contentFile('src/content/blog', path.slice('/blog/'.length), history);
		return {
			primary: file ?? 'src/pages/blog/[...slug].astro',
			also: file ? ['src/pages/blog/[...slug].astro', 'src/layouts/BlogPost.astro'] : [],
		};
	}

	if (path.startsWith('/events/')) {
		const file = contentFile('src/content/events', path.slice('/events/'.length), history);
		return {
			primary: file ?? 'src/pages/events/[...slug].astro',
			also: file ? ['src/pages/events/[...slug].astro'] : [],
		};
	}

	for (const candidate of [`src/pages${path}.astro`, `src/pages${path}/index.astro`, `src/pages${path}.html`]) {
		if (history.has(candidate)) return { primary: candidate, also: [] };
	}

	return undefined;
}

export function gitDatesForPathname(pathname: string): GitPageDates | undefined {
	const history = loadHistory();
	const sources = sourcesForPathname(pathname, history);
	if (!sources) return undefined;

	const primary = history.get(sources.primary);
	let updated = primary?.updated;
	for (const file of filesFor(sources.also ?? [], history)) {
		const record = history.get(file);
		if (!record) continue;
		updated = updated ? later(updated, record.updated) : record.updated;
	}

	if (!primary?.created && !updated) return undefined;
	return { created: primary?.created, updated };
}

export function lastmodForSitemapUrl(url: string): string | undefined {
	return gitDatesForPathname(new URL(url).pathname)?.updated;
}

export interface BlogPostGitDates {
	published?: Date;
	updated?: Date;
}

/** Dates for a blog post file only, ignoring shared templates. */
export function blogPostGitDates(id: string): BlogPostGitDates {
	const history = loadHistory();
	const file = contentFile('src/content/blog', id, history);
	const record = file ? history.get(file) : undefined;
	if (!record) return {};

	return {
		published: new Date(record.created),
		updated: new Date(record.updated),
	};
}
