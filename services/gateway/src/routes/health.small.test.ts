import { describe, expect, it } from "vitest";
import { health } from "./health.js";

describe("health routes", () => {
  it("serves legacy and deployment health endpoints", async () => {
    for (const path of ["/health", "/healthz"]) {
      const response = await health.request(path);
      const body = (await response.json()) as { status: string };

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
    }
  });

  it("serves legacy and deployment readiness endpoints", async () => {
    for (const path of ["/ready", "/readyz"]) {
      const response = await health.request(path);
      const body = (await response.json()) as { status: string };

      expect(response.status).toBe(200);
      expect(body.status).toBe("ready");
    }
  });
});
