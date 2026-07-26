/** @type {import('semantic-release').Options} */
module.exports = {
	branches: ["main", { name: "beta", prerelease: true }],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/npm",
			{
				pkgRoot: "packages/standalone",
			},
		],
		[
			"@semantic-release/git",
			{
				assets: ["packages/standalone/package.json"],
				message:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release template
					"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
			},
		],
		"@semantic-release/github",
	],
};
