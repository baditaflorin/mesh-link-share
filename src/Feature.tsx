import { useEffect, useMemo, useRef, useState } from "react";
import {
  MeshSwitch,
  safeUrl,
  useStorageNamespace,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type LinkEntry = {
  id: string;
  url: string;
  title?: string;
  fromPeer: string;
  ts: number;
};

const MAX_LINKS = 30;
const AUTO_OPEN_KEY = "autoOpen";

function tryParseUrl(raw: string): URL | null {
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(candidate);
  } catch {
    return null;
  }
}

function shortFrom(id: string) {
  return id.slice(0, 4);
}

export function Feature({ room, config }: Props) {
  const ns = useStorageNamespace(config.storagePrefix);
  const [draft, setDraft] = useState("");
  const [autoOpen, setAutoOpen] = useState(() => ns.get<string>(AUTO_OPEN_KEY) === "1");
  const [, rerender] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ns.set(AUTO_OPEN_KEY, autoOpen ? "1" : "0");
  }, [autoOpen, ns]);

  useEffect(() => {
    if (!room) return;
    const arr = room.doc.getArray<LinkEntry>("links");
    // Seed the seen-set with whatever is already in the doc so we don't auto-open history.
    arr.toArray().forEach((e) => seenRef.current.add(e.id));

    const onChange = () => {
      if (autoOpen) {
        const latest = arr.toArray();
        for (const e of latest) {
          if (e.fromPeer === room.peerId) continue;
          if (seenRef.current.has(e.id)) continue;
          seenRef.current.add(e.id);
          // Pop-up blockers will require a prior user gesture (the auto-open
          // toggle); if blocked, the link is still in the list.
          const safe = safeUrl(e.url);
          if (safe) window.open(safe, "_blank", "noopener");
        }
      }
      rerender((n) => n + 1);
    };
    arr.observe(onChange);
    return () => arr.unobserve(onChange);
  }, [room, autoOpen]);

  const links = useMemo(() => {
    if (!room) return [] as LinkEntry[];
    return [...room.doc.getArray<LinkEntry>("links").toArray()].reverse();
  }, [room]);

  if (!room) {
    return (
      <div className="link-screen">
        <h1>link share</h1>
        <p className="link-status">Connecting…</p>
      </div>
    );
  }

  const send = (raw: string) => {
    const url = tryParseUrl(raw.trim());
    if (!url) return;
    const arr = room.doc.getArray<LinkEntry>("links");
    arr.push([
      { id: crypto.randomUUID(), url: url.toString(), fromPeer: room.peerId, ts: Date.now() },
    ]);
    while (arr.length > MAX_LINKS) arr.delete(0, 1);
    setDraft("");
  };

  return (
    <div className="link-screen">
      <header className="link-header">
        <h1>link share</h1>
        <p className="link-status">
          {room.peerCount + 1} device{room.peerCount === 0 ? "" : "s"} · open the same room on phone
          + laptop to send URLs between them
        </p>
      </header>

      <form
        className="link-send"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="paste or type a URL"
          autoComplete="off"
        />
        <button type="submit" disabled={!tryParseUrl(draft.trim())}>
          send
        </button>
      </form>

      <MeshSwitch
        checked={autoOpen}
        onCheckedChange={setAutoOpen}
        label="auto-open new links on this device"
        className="link-toggle"
      />
      <p className="link-warn">
        Auto-open uses <code>window.open</code> — pop-up blockers can block it. If links don't open,
        click them once below to allow.
      </p>

      <ul className="link-list">
        {links.map((e) => {
          const mine = e.fromPeer === room.peerId;
          let host = e.url;
          try {
            host = new URL(e.url).host;
          } catch {
            // fall through
          }
          return (
            <li key={e.id} className={`link-entry ${mine ? "is-mine" : ""}`}>
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="link-url">
                {host}
                <span className="link-full">{e.url}</span>
              </a>
              <span className="link-meta">
                {mine ? "you" : `peer-${shortFrom(e.fromPeer)}`} ·{" "}
                {new Date(e.ts).toLocaleTimeString()}
              </span>
            </li>
          );
        })}
        {links.length === 0 && <li className="link-empty">no links yet</li>}
      </ul>
    </div>
  );
}
