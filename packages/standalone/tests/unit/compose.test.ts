import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeMiddleware } from "../../src/extension/compose.js";
import type {
	ErrorMiddlewareFn,
	MiddlewareDefinition,
	MiddlewareFn,
} from "../../src/extension/types.js";
import { createFakeContext } from "../helpers/fake-context.js";

function mw(partial: {
	name: string;
	handler: MiddlewareFn;
	order?: number;
	match?: string | RegExp;
}): MiddlewareDefinition {
	return {
		order: 100,
		role: "normal",
		...partial,
	};
}

function errMw(partial: {
	name: string;
	handler: ErrorMiddlewareFn;
	order?: number;
	match?: string | RegExp;
}): MiddlewareDefinition {
	return {
		order: 10_000,
		role: "error",
		...partial,
	};
}

describe("composeMiddleware", () => {
	it("runs middlewares in order then final", async () => {
		const seen: string[] = [];
		const pipeline = composeMiddleware(
			[
				mw({
					name: "b",
					order: 20,
					handler: async (_ctx, next) => {
						seen.push("b");
						await next();
					},
				}),
				mw({
					name: "a",
					order: 10,
					handler: async (_ctx, next) => {
						seen.push("a");
						await next();
					},
				}),
			],
			async () => {
				seen.push("final");
			},
		);

		await pipeline(createFakeContext("/"));
		assert.deepEqual(seen, ["a", "b", "final"]);
	});

	it("skips non-matching match strings and prefixes", async () => {
		const seen: string[] = [];
		const pipeline = composeMiddleware(
			[
				mw({
					name: "exact",
					match: "/demo/exact",
					handler: async (_ctx, next) => {
						seen.push("exact");
						await next();
					},
				}),
				mw({
					name: "prefix",
					match: "/demo/prefix/**",
					handler: async (_ctx, next) => {
						seen.push("prefix");
						await next();
					},
				}),
				mw({
					name: "regex",
					match: /^\/demo\/re-.+/,
					handler: async (_ctx, next) => {
						seen.push("regex");
						await next();
					},
				}),
			],
			async () => {
				seen.push("final");
			},
		);

		await pipeline(createFakeContext("/"));
		assert.deepEqual(seen, ["final"]);

		seen.length = 0;
		await pipeline(createFakeContext("/demo/exact"));
		assert.deepEqual(seen, ["exact", "final"]);

		seen.length = 0;
		await pipeline(createFakeContext("/demo/prefix/a"));
		assert.deepEqual(seen, ["prefix", "final"]);

		seen.length = 0;
		await pipeline(createFakeContext("/demo/re-1"));
		assert.deepEqual(seen, ["regex", "final"]);
	});

	it("allows short-circuit without calling next", async () => {
		let finalCalled = false;
		const pipeline = composeMiddleware(
			[
				mw({
					name: "short",
					handler: async (ctx) => {
						ctx.res.status = 204;
						await ctx.res.end();
					},
				}),
			],
			async () => {
				finalCalled = true;
			},
		);

		const ctx = createFakeContext("/healthz");
		await pipeline(ctx);
		assert.equal(finalCalled, false);
		assert.equal(ctx.res.status, 204);
	});

	it("throws when next() is called twice", async () => {
		const pipeline = composeMiddleware(
			[
				mw({
					name: "bad",
					handler: async (_ctx, next) => {
						await next();
						await next();
					},
				}),
			],
			async () => {},
		);

		await assert.rejects(
			() => pipeline(createFakeContext("/")),
			/next\(\) called multiple times/,
		);
	});

	it("routes errors through error middleware", async () => {
		const pipeline = composeMiddleware(
			[
				mw({
					name: "boom",
					handler: async () => {
						throw new Error("boom");
					},
				}),
				errMw({
					name: "error",
					order: 10,
					handler: async (ctx, _next, error) => {
						ctx.res.status = 418;
						await ctx.res.end(error instanceof Error ? error.message : "err");
					},
				}),
			],
			async () => {
				throw new Error("should not reach final");
			},
		);

		const ctx = createFakeContext("/demo/boom");
		await pipeline(ctx);
		assert.equal(ctx.res.status, 418);
	});

	it("rethrows when error middleware calls next", async () => {
		const pipeline = composeMiddleware(
			[
				mw({
					name: "boom",
					handler: async () => {
						throw new Error("boom");
					},
				}),
				errMw({
					name: "error",
					handler: async (_ctx, next) => {
						await next();
					},
				}),
			],
			async () => {},
		);

		await assert.rejects(() => pipeline(createFakeContext("/")), /boom/);
	});
});
