import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer assertion for the advertised core action:
 * "Paste a URL on your phone — it opens on your laptop a second later."
 *
 * Peer A submits a URL; peer B must surface an open/launch affordance (an
 * <a> link) whose href is EXACTLY that URL. This fails on any local-only stub
 * (a link that lands in React state never crosses the mesh) and passes only
 * when the write goes through the shared Yjs `links` array.
 */
test("URL submitted on peer A surfaces as a launchable link on peer B", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await expect(a.locator(".link-send input")).toBeVisible();
    await expect(b.locator(".link-send input")).toBeVisible();

    const slug = Math.random().toString(36).slice(2, 10);
    const url = `https://example.com/from-phone/${slug}`;

    await a.locator(".link-send input").fill(url);
    await a.getByRole("button", { name: /^send$/i }).click();

    // The advertised result: B (the OTHER device) gets an open affordance —
    // a real <a> whose href is EXACTLY the submitted URL.
    const linkOnB = b.locator(`.link-list a.link-url[href="${url}"]`);
    await expect(linkOnB).toBeVisible();
    await expect(linkOnB).toHaveAttribute("href", url);
    // Opens in a new context on the laptop (the "opens on your laptop" UX).
    await expect(linkOnB).toHaveAttribute("target", "_blank");
  } finally {
    await cleanup();
  }
});

/**
 * Security: incoming peer data is untrusted. A hostile peer can write a
 * LinkEntry with a `javascript:` (or other dangerous-scheme) URL DIRECTLY
 * into the shared Yjs array, bypassing the local input validation. The
 * receiving peer must NEVER render that as a clickable `javascript:` href.
 */
test("javascript: scheme injected by a peer is not rendered as a live link", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await expect(a.locator(".link-send input")).toBeVisible();
    await expect(b.locator(".link-send input")).toBeVisible();

    const marker = Math.random().toString(36).slice(2, 10);
    const evil = `javascript:alert('xss-${marker}')`;
    const good = `https://example.com/ok-${marker}`;

    // Hostile peer A writes BOTH a malicious entry and a benign entry straight
    // into the Yjs doc, skipping the UI's tryParseUrl guard entirely.
    await a.evaluate(
      ({ evilUrl, goodUrl }) => {
        const w = window as unknown as { __lsRoom?: { doc: import("yjs").Doc; peerId: string } };
        const room = w.__lsRoom;
        if (!room) throw new Error("test hook window.__lsRoom missing");
        const arr = room.doc.getArray("links");
        arr.push([
          { id: crypto.randomUUID(), url: evilUrl, fromPeer: room.peerId, ts: Date.now() },
          { id: crypto.randomUUID(), url: goodUrl, fromPeer: room.peerId, ts: Date.now() },
        ]);
      },
      { evilUrl: evil, goodUrl: good },
    );

    // The benign entry crosses the mesh and renders — proves the doc synced.
    await expect(b.locator(`.link-list a.link-url[href="${good}"]`)).toBeVisible();

    // The malicious entry must NOT produce any element with a javascript: href.
    const liveJs = b.locator(`[href^="javascript:"]`);
    await expect(liveJs).toHaveCount(0);
    // And specifically not the marker we injected, in any href anywhere.
    await expect(b.locator(`[href*="xss-${marker}"]`)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
