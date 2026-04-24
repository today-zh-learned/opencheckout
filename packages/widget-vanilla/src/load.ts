import { validateGatewayUrl, validatePublishableKey } from "./internal/validate.js";
import { type CheckoutWidgets, type WidgetsOptions, createWidgets } from "./widgets.js";

export type LoadOptions = {
  readonly publishableKey: string;
  readonly gatewayUrl?: string;
};

export type OpenCheckoutInstance = {
  readonly publishableKey: string;
  widgets(opts: WidgetsOptions): CheckoutWidgets;
};

const DEFAULT_GATEWAY_URL = "https://cloud.opencheckout.dev";

export async function load(opts: LoadOptions): Promise<OpenCheckoutInstance> {
  const publishableKey = validatePublishableKey(opts.publishableKey);
  const gatewayUrl = validateGatewayUrl(opts.gatewayUrl ?? DEFAULT_GATEWAY_URL);

  const instance: OpenCheckoutInstance = {
    publishableKey,
    widgets(widgetOpts: WidgetsOptions): CheckoutWidgets {
      return createWidgets({
        publishableKey,
        gatewayUrl,
        options: widgetOpts,
      });
    },
  };
  return instance;
}
