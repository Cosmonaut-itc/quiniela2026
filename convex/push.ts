"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { deadEndpoints } from "./lib/push";

declare const process: { env: Record<string, string | undefined> };

export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }): Promise<void> => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:quiniela2026@example.com";
    if (!pub || !priv) return; // sin claves configuradas, no se envía push (in-app ya quedó)

    const data = await ctx.runQuery(internal.notifications.getForPush, { notificationId });
    if (!data || data.subscriptions.length === 0) return;

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, pub, priv);
    const payload = JSON.stringify({ title: data.title, body: data.body, url: data.url });

    const results: { endpoint: string; statusCode: number }[] = [];
    for (const s of data.subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e) {
        const code = e && typeof e === "object" && "statusCode" in e
          ? Number((e as { statusCode: unknown }).statusCode) : 0;
        results.push({ endpoint: s.endpoint, statusCode: code });
      }
    }
    const dead = deadEndpoints(results);
    if (dead.length > 0) await ctx.runMutation(internal.notifications.pruneSubscriptions, { endpoints: dead });
  },
});
