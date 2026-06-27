"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "text" | "voice" | "image";
type Toast = { msg: string; tone: "ok" | "warn" } | null;

function labelFor(p?: string): string {
  if (p === "office") return "Office";
  if (p === "personal_dev") return "Personal Dev";
  if (p === "personal_life") return "Personal Life";
  return "your ledger";
}

/**
 * Pinned multi-modal capture bar (FR29): text, voice (MediaRecorder -> STT),
 * and image (upload -> Blob + Vision). All funnel through classify -> ledger.
 */
export function CaptureBar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function flash(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  }

  function handleResult(data: { filed?: boolean; classification?: { portfolio?: string }; error?: string }, res: Response) {
    if (!res.ok) {
      flash({ msg: data.error ?? "Capture failed — try again", tone: "warn" });
      return;
    }
    if (data.filed) {
      flash({ msg: `Filed to ${labelFor(data.classification?.portfolio)}`, tone: "ok" });
      router.refresh();
    } else {
      flash({ msg: "Looks like a thought — not filed (use Consult)", tone: "warn" });
    }
  }

  async function sendText() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, source: "text" }),
      });
      const data = await res.json();
      if (res.ok && data.filed) setText("");
      handleResult(data, res);
    } catch {
      flash({ msg: "Capture failed — try again", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  async function postForm(url: string, form: FormData) {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", body: form });
      const data = await res.json();
      handleResult(data, res);
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
        <div className="modes">
          {(["text", "voice", "image"] as const).map((m) => (
            <button
              key={m}
              className={cn("modebtn", mode === m && "on")}
              onClick={() => setMode(m)}
            >
              {m === "text" ? "⌨ Text" : m === "voice" ? "🎙 Voice" : "📷 Image"}
            </button>
          ))}
          <span className="modehint">capture · classify · file</span>
        </div>

        {mode === "text" && (
          <div className="capbox">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="Capture anything — a task, a note, a situation…"
              aria-label="Capture input"
            />
            <button className="send" onClick={sendText} disabled={busy || !text.trim()}>
              {busy ? "…" : "Send →"}
            </button>
          </div>
        )}

        {mode === "voice" && (
          <div className="capbox">
            <span style={{ flex: 1, color: "var(--muted)", fontSize: 14 }}>
              {recording ? "● Recording… tap stop when done" : busy ? "Transcribing…" : "Tap record and speak your note"}
            </span>
            <button
              className="send"
              onClick={toggleRecording}
              disabled={busy}
              style={recording ? { background: "var(--red)" } : undefined}
            >
              {recording ? "■ Stop" : "🎙 Record"}
            </button>
          </div>
        )}

        {mode === "image" && (
          <div className="capbox">
            <span style={{ flex: 1, color: "var(--muted)", fontSize: 14 }}>
              {busy ? "Reading image…" : "Upload a photo or screenshot (itinerary, bill, whiteboard)"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onImagePicked}
            />
            <button className="send" onClick={() => fileRef.current?.click()} disabled={busy}>
              📷 Choose
            </button>
          </div>
        )}
      </div>
      {toast && <div className={cn("toast", "on", toast.tone === "warn" && "warn")}>{toast.msg}</div>}
    </div>
  );
}
