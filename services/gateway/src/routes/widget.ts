import type { TenantId } from "@opencheckout/core";
import { Hono } from "hono";
import { z } from "zod";

export type WidgetTokenIssueInput = {
  readonly tenantId: TenantId;
  readonly orderId: string;
  readonly origin?: string;
};

export type WidgetTokenResponse = {
  readonly token: string;
  readonly tokenType: "Bearer";
  readonly tenantId: string;
  readonly orderId: string;
  readonly allowedOrigins: readonly string[];
  readonly expiresAt: string;
};

export type WidgetTokenIssuer = {
  issueWidgetToken(input: WidgetTokenIssueInput): Promise<WidgetTokenResponse>;
};

export type PublicOrderDTO = {
  readonly publicId: string;
  readonly status: string;
  readonly amount: {
    readonly amount: number;
    readonly currency: string;
  };
  readonly updatedAt: string;
  readonly version: string;
};

export type PublicOrderReader = {
  getPublicOrder(publicId: string): Promise<PublicOrderDTO | undefined>;
};

export type WidgetRouteDependencies = {
  readonly tokenIssuer: WidgetTokenIssuer;
  readonly publicOrders: PublicOrderReader;
};

const WidgetTokenRequestSchema = z.object({
  orderId: z.string().min(1),
  origin: z.string().min(1).optional(),
});

export function widgetRoutes(deps: WidgetRouteDependencies): Hono {
  const app = new Hono();

  app.post("/v1/widget/tokens", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = WidgetTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/validation",
          title: "Invalid widget token request",
          status: 400,
          errors: parsed.error.issues,
        },
        400,
      );
    }

    const origin = parsed.data.origin ? normalizeAllowedOrigin(parsed.data.origin) : undefined;
    if (origin instanceof Error) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/validation",
          title: "Invalid widget origin",
          status: 400,
          detail: origin.message,
        },
        400,
      );
    }

    const token = await deps.tokenIssuer.issueWidgetToken({
      tenantId: c.get("tenantId") as TenantId,
      orderId: parsed.data.orderId,
      ...(origin ? { origin } : {}),
    });

    c.header("Cache-Control", "no-store");
    return c.json(token, 201);
  });

  app.get("/v1/public/orders/:publicId", async (c) => {
    const publicId = c.req.param("publicId");
    const order = await deps.publicOrders.getPublicOrder(publicId);
    if (!order) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/not-found",
          title: "Public order not found",
          status: 404,
        },
        404,
      );
    }

    c.header("Cache-Control", "public, max-age=30, s-maxage=60");
    c.header("ETag", `W/"${order.version}"`);
    return c.json(order, 200);
  });

  return app;
}

function normalizeAllowedOrigin(raw: string): string | Error {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return new Error("origin must use http or https");
    }
    return url.origin;
  } catch {
    return new Error("origin must be a valid URL");
  }
}
