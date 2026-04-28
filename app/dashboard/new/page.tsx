"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TONES = [
  { value: "friendly", label: "Vennlig" },
  { value: "energetic", label: "Energisk" },
  { value: "professional", label: "Profesjonell" },
  { value: "calm", label: "Rolig" },
];

const MUSIC_STYLES = [
  { value: "upbeat", label: "Upbeat" },
  { value: "minimal", label: "Minimal" },
  { value: "cinematic", label: "Cinematisk" },
];

const SERVICES = [
  { value: "reforhandle", label: "Reforhandle" },
  { value: "singlepicker", label: "SinglePicker" },
  { value: "custom", label: "Egendefinert" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    productName: "",
    headline: "",
    bodyCopy: "",
    cta: "",
    tone: "friendly",
    service: "reforhandle",
    voiceover: true,
    music: true,
    musicStyle: "upbeat",
    formats: ["16:9", "9:16", "1:1"] as string[],
  });

  function toggle(format: string) {
    setForm((f) => ({
      ...f,
      formats: f.formats.includes(format)
        ? f.formats.filter((x) => x !== format)
        : [...f.formats, format],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Simulate processing delay for MVP
    await new Promise((r) => setTimeout(r, 800));

    // In production this would POST to /api/campaigns
    // For MVP we redirect back to dashboard with success message
    router.push("/dashboard?created=1");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-zinc-500 hover:text-white text-sm transition-colors"
        >
          ← Tilbake
        </Link>
        <span className="text-zinc-700">/</span>
        <h1 className="text-xl font-bold text-white">Ny kampanje</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Basic info */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-white text-sm uppercase tracking-widest text-zinc-400">
            Grunninfo
          </h2>

          <Field label="Kampanjenavn">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Reforhandle Vår 2026"
              className={inputClass}
            />
          </Field>

          <Field label="Tjeneste">
            <select
              value={form.service}
              onChange={(e) =>
                setForm((f) => ({ ...f, service: e.target.value }))
              }
              className={inputClass}
            >
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Produktnavn">
            <input
              required
              value={form.productName}
              onChange={(e) =>
                setForm((f) => ({ ...f, productName: e.target.value }))
              }
              placeholder="Reforhandle"
              className={inputClass}
            />
          </Field>
        </div>

        {/* Copy */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-sm uppercase tracking-widest text-zinc-400">
            Innhold
          </h2>

          <Field label={`Headline (maks 40 tegn) — ${form.headline.length}/40`}>
            <input
              required
              maxLength={40}
              value={form.headline}
              onChange={(e) =>
                setForm((f) => ({ ...f, headline: e.target.value }))
              }
              placeholder="Spar tusenvis på strøm og internett"
              className={inputClass}
            />
          </Field>

          <Field
            label={`Body copy (maks 125 tegn) — ${form.bodyCopy.length}/125`}
          >
            <textarea
              required
              maxLength={125}
              value={form.bodyCopy}
              onChange={(e) =>
                setForm((f) => ({ ...f, bodyCopy: e.target.value }))
              }
              placeholder="Vi forhandler abonnementene dine — du betaler bare for resultater."
              rows={3}
              className={inputClass + " resize-none"}
            />
          </Field>

          <Field label="Call to action">
            <input
              required
              value={form.cta}
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
              placeholder="Start gratis"
              className={inputClass}
            />
          </Field>

          <Field label="Tone">
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tone: t.value }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    form.tone === t.value
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Media options */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-sm uppercase tracking-widest text-zinc-400">
            Media
          </h2>

          <div className="flex gap-4">
            <Toggle
              label="Voiceover"
              checked={form.voiceover}
              onChange={(v) => setForm((f) => ({ ...f, voiceover: v }))}
            />
            <Toggle
              label="Bakgrunnsmusikk"
              checked={form.music}
              onChange={(v) => setForm((f) => ({ ...f, music: v }))}
            />
          </div>

          {form.music && (
            <Field label="Musikk-stil">
              <div className="flex flex-wrap gap-2">
                {MUSIC_STYLES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, musicStyle: m.value }))
                    }
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                      form.musicStyle === m.value
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Formater">
            <div className="flex gap-2">
              {(["16:9", "9:16", "1:1"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => toggle(fmt)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    form.formats.includes(fmt)
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <button
          type="submit"
          disabled={loading || form.formats.length === 0}
          className="rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition-colors"
        >
          {loading ? "Starter produksjon..." : "Start produksjon"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
        checked
          ? "bg-violet-600 border-violet-600 text-white"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          checked ? "border-white bg-white" : "border-zinc-500"
        }`}
      >
        {checked && (
          <span className="w-2 h-2 rounded-full bg-violet-600 block" />
        )}
      </span>
      {label}
    </button>
  );
}
