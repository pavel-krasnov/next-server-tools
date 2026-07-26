import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildExample,
	type ExampleName,
	markerExists,
	type SmokeMode,
	startExampleServer,
} from "./harness.js";

type DemoStats = {
	requestStart: number;
	requestFinish: number;
	requestError: number;
	nextBefore: number;
	nextAfter: number;
	responseSent: number;
	errorMiddleware: number;
};

async function assertFeatureContract(
	baseUrl: string,
	options: { checkStatic: boolean },
): Promise<void> {
	const home = await fetch(`${baseUrl}/`);
	assert.equal(home.status, 200);
	assert.ok(home.headers.get("x-request-id"));
	assert.equal(home.headers.get("x-demo-config"), "1");
	assert.equal(home.headers.get("x-demo-service"), "demo");
	assert.equal(home.headers.get("x-demo-exact"), null);

	const api = await fetch(`${baseUrl}/api/ok`);
	assert.equal(api.status, 200);
	assert.deepEqual(await api.json(), { ok: true });
	assert.ok(api.headers.get("x-request-id"));

	const healthz = await fetch(`${baseUrl}/healthz`);
	assert.equal(healthz.status, 200);
	const healthzBody = (await healthz.json()) as { ok: boolean; id: string };
	assert.equal(healthzBody.ok, true);
	assert.ok(healthzBody.id);

	const exact = await fetch(`${baseUrl}/demo/exact`);
	assert.equal(exact.status, 200);
	assert.equal(exact.headers.get("x-demo-exact"), "1");
	assert.deepEqual(await exact.json(), { matched: "exact" });

	const prefix = await fetch(`${baseUrl}/demo/prefix/a`);
	assert.equal(prefix.status, 200);
	assert.equal(prefix.headers.get("x-demo-prefix"), "1");

	const other = await fetch(`${baseUrl}/demo/other`);
	assert.equal(other.headers.get("x-demo-prefix"), null);

	const regex = await fetch(`${baseUrl}/demo/re-1`);
	assert.equal(regex.status, 200);
	assert.equal(regex.headers.get("x-demo-regex"), "1");

	const boom = await fetch(`${baseUrl}/demo/boom`);
	assert.equal(boom.status, 418);
	const boomBody = (await boom.json()) as { handled: boolean };
	assert.equal(boomBody.handled, true);

	const crash = await fetch(`${baseUrl}/demo/crash`);
	assert.equal(crash.status, 500);

	const statsResponse = await fetch(`${baseUrl}/demo/stats`);
	assert.equal(statsResponse.status, 200);
	const stats = (await statsResponse.json()) as DemoStats;
	assert.ok(stats.requestStart >= 1);
	assert.ok(stats.requestFinish >= 1);
	assert.ok(stats.nextBefore >= 1);
	assert.ok(stats.nextAfter >= 1);
	assert.ok(stats.responseSent >= 1);
	assert.ok(stats.errorMiddleware >= 1);
	assert.ok(stats.requestError >= 1);

	if (options.checkStatic) {
		const asset = await fetch(`${baseUrl}/next.svg`);
		assert.equal(asset.status, 200);
	}
}

async function runSmoke(name: ExampleName, mode: SmokeMode): Promise<void> {
	const server = await startExampleServer({ name, mode });
	try {
		assert.ok(
			await markerExists(server.markerDir, "server-start"),
			"server-start marker missing",
		);
		if (mode === "dev") {
			assert.ok(
				server.stdout.includes(
					`> Ready on ${server.baseUrl} (development)`,
				),
			);
		} else {
			assert.ok(
				server.stdout.includes(
					`> nst ready on ${server.baseUrl} (standalone)`,
				),
			);
		}
		assert.ok(
			server.stdout.includes(
				`[nst] info server ready {"url":"${server.baseUrl}"`,
			),
		);

		await assertFeatureContract(server.baseUrl, {
			checkStatic: mode === "start",
		});
	} finally {
		await server.stop();
	}

	assert.ok(
		await markerExists(server.markerDir, "server-shutdown"),
		"server-shutdown marker missing",
	);
}

describe("example feature smoke", { timeout: 600_000 }, () => {
	it("next-15 start", async () => {
		await buildExample("next-15");
		await runSmoke("next-15", "start");
	});

	it("next-16 start", async () => {
		await buildExample("next-16");
		await runSmoke("next-16", "start");
	});

	it("next-15 dev", async () => {
		await runSmoke("next-15", "dev");
	});

	it("next-15 dev --turbopack", async () => {
		const server = await startExampleServer({
			name: "next-15",
			mode: "dev",
			devArgs: ["--turbopack"],
		});
		try {
			assert.ok(
				server.stdout.includes(
					`> Ready on ${server.baseUrl} (development, turbopack)`,
				),
				`expected turbopack ready line\n${server.stdout}`,
			);
			const api = await fetch(`${server.baseUrl}/api/ok`);
			assert.equal(api.status, 200);
		} finally {
			await server.stop();
		}
	});

	it("next-16 dev", async () => {
		await runSmoke("next-16", "dev");
	});
});
