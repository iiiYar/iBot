import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SkillInfo } from "../agent";
import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";

export interface ComposerProps {
  lang: Lang;
  model: string;
  planMode: boolean;
  running: boolean;
  skills: SkillInfo[];
  onSend: (text: string, images: string[]) => void;
  onStop: () => void;
}

export function Composer({ lang, model, planMode, running, skills, onSend, onStop }: ComposerProps) {
  const t = STRINGS[lang];
  const [input, setInput]               = useState("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [slashOpen, setSlashOpen]       = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "0px"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }
  }, [input]);

  const slashQuery   = input.startsWith("/") && !input.includes(" ") ? input.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery !== null ? skills.filter((s) => s.name.toLowerCase().startsWith(slashQuery)) : [];

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;
    onSend(text, attachedImages);
    setInput("");
    setAttachedImages([]);
    setSlashOpen(false);
  }, [input, attachedImages, running, onSend]);

  const addImages = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => setAttachedImages((prev) => [...prev, String(reader.result)]);
      reader.readAsDataURL(file);
    }
  }, []);

  // Expose focus method via ref not needed — parent can call textareaRef directly
  // Export a helper for parent to insert text
  const insertText = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // expose insertText on the DOM node for parent to call
  useEffect(() => {
    const el = textareaRef.current;
    if (el) (el as HTMLTextAreaElement & { insertText?: (t: string) => void }).insertText = insertText;
  }, [insertText]);

  return (
    <footer className="composer-wrap">
      <div className="composer">
        {/* Slash menu */}
        {slashOpen && slashMatches.length > 0 && (
          <div className="slash-menu">
            {slashMatches.map((s) => (
              <button key={s.path} onClick={() => {
                setInput(`/${s.name} `);
                setSlashOpen(false);
                textareaRef.current?.focus();
              }}>
                <span className="slash-name">/{s.name}</span>
                <span className="slash-desc">{s.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Image attachments */}
        {attachedImages.length > 0 && (
          <div className="attach-row">
            {attachedImages.map((src, i) => (
              <div key={i} className="attach-thumb">
                <img src={src} alt="" />
                <button onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          placeholder={t.inputPlaceholder}
          rows={1}
          disabled={running}
          onChange={(e) => {
            setInput(e.target.value);
            setSlashOpen(e.target.value.startsWith("/") && !e.target.value.includes(" "));
          }}
          onKeyDown={(e) => {
            if (slashOpen && slashMatches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              setInput(`/${slashMatches[0].name} `);
              setSlashOpen(false);
              return;
            }
            if (e.key === "Escape") { setSlashOpen(false); return; }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length > 0) { e.preventDefault(); addImages(files); }
          }}
        />

        {/* Bar */}
        <div className="composer-bar">
          <div className="composer-left">
            <button className="mini-chip clickable" title="Attach image"
              onClick={() => fileInputRef.current?.click()}>📎</button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
            <span className="mini-chip" dir="ltr">{model.split("/").pop()}</span>
            {planMode && <span className="mini-chip accent">📋 {t.planMode}</span>}
          </div>
          {running
            ? <button className="send-btn stop" onClick={onStop} title={t.stop}>■</button>
            : <button className="send-btn" onClick={handleSend} disabled={!input.trim()} title={t.send}>↑</button>
          }
        </div>
      </div>
    </footer>
  );
}
