"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Toast = { msg: string; tone: "ok" | "warn" } | null;

/** The capturing device's IANA timezone (FR42). */
function clientTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The single conversational composer (FR43 — one chat bar). Text routes to the
 * orchestrator; Voice and Image remain here as multimodal capture (FR29). No
 * mode tabs or recipient picker (§5.1.6) — the agent infers intent.
 */
export function CaptureBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function flash(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 3000);
  }

  async function sendText() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, tz: clientTz() }),
      });
      const data = await res.json();
      if (res.ok) {
        setText("");
        router.refresh(); // the session thread re-renders with the new turns
      } else {
        flash({ msg: data.error ?? "Something went wrong", tone: "warn" });
      }
    } catch {
      flash({ msg: "Network error — try again", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  async function postForm(url: string, form: FormData) {
    setBusy(true);
    const tz = clientTz();
    if (tz) form.append("tz", tz);
    try {
      const res = await fetch(url, { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        flash({ msg: data.filed ? "Captured" : "Noted", tone: "ok" });
        router.refresh();
      } else {
        flash({ msg: data.error ?? "Capture failed", tone: "warn" });
      }
    } catch {
      flash({ msg: "Capture failed — try again", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  async function onImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    await postForm("/api/capture/image", form);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size > 0 && chunksRef.current.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "note.webm");
        await postForm("/api/capture/voice", form);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      flash({ msg: "Microphone unavailable", tone: "warn" });
    }
  }

  return (
    <div className="capture">
      <div className="capwrap">
        <div className="capbox">
          <svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M3 12h18" />
          </svg>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Talk to your Chief of Staff — add something, give an update, or ask…"
            aria-label="Message your chief of staff"
          />
          <span className="modehint">you talk · I file, schedule &amp; remind</span>
          <button
            className={cn("iconbtn", recording && "act")}
            onClick={toggleRecording}
            disabled={busy}
            title="Voice"
            aria-label="Voice capture"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={onImagePicked}
          />
          <button
            className="iconbtn"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Image"
            aria-label="Image capture"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="M3 17l5-4 4 3 3-2 6 5" />
            </svg>
          </button>
          <button className="send" onClick={sendText} disabled={busy || !text.trim()}>
            {busy ? "…" : "Send →"}
          </button>
        </div>
      </div>
      {toast && <div className={cn("toast", "on", toast.tone === "warn" && "warn")}>{toast.msg}</div>}
    </div>
  );
}
