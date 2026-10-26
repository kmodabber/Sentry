import { describe, expect, it } from "vitest";
import worker from "../src";

const call = (path: string) => worker.fetch(new Request(`https://worker.test${path}`), {});

describe("worker", () => {
  it("answers /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "c3.v0" });
  });

  it("returns a C3 error for unknown paths", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });
});
