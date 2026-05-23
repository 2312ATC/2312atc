/** Headers that discourage browsers and CDNs from serving stale copies. */
export const noCacheHeaders = {
	'Cache-Control': 'no-cache, no-store, must-revalidate',
	Pragma: 'no-cache',
	Expires: '0',
} as const;
