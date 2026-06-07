import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

// Devuelve Uint8Array<ArrayBuffer> (no ArrayBufferLike) para que TS lo acepte como
// applicationServerKey (BufferSource respaldado por ArrayBuffer, no SharedArrayBuffer).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushSubscription(args: { personalToken?: string; adminToken?: string }) {
  const save = useMutation(api.notifications.savePushSubscription);
  const remove = useMutation(api.notifications.removePushSubscription);
  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator &&
    "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC;
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setEnabled(!!s))
      .catch(() => { /* ignore */ });
  }, [supported]);

  async function enable() {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
      });
      const json = sub.toJSON();
      await save({ ...args, endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await remove({ endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return { supported, standalone, enabled, busy, enable, disable };
}
