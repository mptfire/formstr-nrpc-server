
import "dotenv/config";
import {
  getPublicKey,
  nip19,
  SimplePool,
  getEventHash,
  getSignature,
} from "nostr-tools";
import { CONFIG } from "../config.js";

const RELAYS = CONFIG.relays;
const NSEC = process.env.NSEC as string;
const { data: nsec } = nip19.decode(NSEC);
const seckey = nsec as Uint8Array;
const pubkey = getPublicKey(seckey);
const npub = nip19.npubEncode(pubkey);

const pool = new SimplePool();

async function main() {
  const req = {
    kind: 22068,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", pubkey],
      ["method", "getMethods"],
    ],
    content: "",
    pubkey,
  };

  const event: any = {
    ...req,
    id: getEventHash(req),
  };

  event.sig = getSignature(event, seckey);
  console.log(`Submitting request from ${npub}...`);

  try {
    await Promise.all(pool.publish(RELAYS, event));
  } catch (error) {
    console.error("Error publishing event:", error);
    process.exit(1);
  }

  console.log(`Request submitted, waiting for response...`);
  const sub = pool.sub(RELAYS, [
    {
      kinds: [22069],
      "#e": [event.id],
      authors: [pubkey],
    },
  ]);

  const timeout = setTimeout(() => {
    console.error("Health check failed: timeout");
    sub.unsub();
    pool.close(RELAYS);
    process.exit(1);
  }, 10000); // 10 second timeout

  sub.on("event", (event: any) => {
    console.log("Got response:", event);
    const status = event.tags.find((t: any) => t[0] === "status");
    if (status && status[1] === "200") {
      console.log("Health check passed!");
      clearTimeout(timeout);
      sub.unsub();
      pool.close(RELAYS);
      process.exit(0);
    } else {
      console.error("Health check failed: non-200 status");
      clearTimeout(timeout);
      sub.unsub();
      pool.close(RELAYS);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
