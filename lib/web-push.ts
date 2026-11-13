import webpush from "web-push";
import { createECDH } from "node:crypto";

export function webPushConfiguration() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "").trim();
  if (!publicKey || !privateKey || !subject) return { configured: false, publicKey, message: "Set the public key, private key and VAPID subject in the website server environment." };
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const pair = createECDH("prime256v1"); pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (!pair.getPublicKey().equals(Buffer.from(publicKey, "base64url"))) throw new Error("Mismatched VAPID pair");
    return { configured: true, publicKey, message: "Server push configuration is ready." };
  } catch {
    return { configured: false, publicKey, message: "The server VAPID configuration is invalid. Check its key pair and subject." };
  }
}

export function notificationDestination(sourceType?: string | null, sourceId?: string | null) {
  if (sourceType === "my_work_reminder" && sourceId) return `/demo.html?view=my-work-view&task=${encodeURIComponent(sourceId)}`;
  return "/demo.html?view=announcement-view";
}
