export function getPiUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `gitpilot/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
