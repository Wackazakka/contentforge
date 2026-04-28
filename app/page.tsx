import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight text-white">
          Content<span className="text-violet-500">Forge</span>
        </span>
        <Link
          href="/login"
          className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
        >
          Logg inn →
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-24">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 text-sm text-violet-400 mb-8">
          MVP — Beta
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight mb-6">
          Profesjonelt annonse­materiell på{" "}
          <span className="text-violet-500">sekunder</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-xl mb-10">
          Gi en brief — få ferdige video­annonser og artikler i alle social
          media-formater. Ingen designkompetanse nødvendig.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/login"
            className="rounded-full bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3 text-base transition-colors"
          >
            Kom i gang
          </Link>
          <a
            href="#features"
            className="rounded-full border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium px-8 py-3 text-base transition-colors"
          >
            Se funksjoner
          </a>
        </div>

        {/* Services */}
        <p className="mt-12 text-xs text-zinc-600 uppercase tracking-widest">
          Tjenester som bruker ContentForge
        </p>
        <div className="mt-4 flex gap-6 items-center text-zinc-500 font-semibold text-sm">
          <span>Reforhandle</span>
          <span className="text-zinc-700">·</span>
          <span>SinglePicker</span>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="border-t border-zinc-800 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-white mb-12">
            Alt du trenger for innholdsproduksjon
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: "🎬",
                title: "Video-annonser",
                desc: "DALL-E 3 bilder + ffmpeg Ken Burns animasjoner. Produserer 16:9, 9:16 og 1:1.",
              },
              {
                icon: "📝",
                title: "Artikler & copy",
                desc: "AI-generert tekst tilpasset tone og målgruppe. Klar til publisering.",
              },
              {
                icon: "✅",
                title: "Godkjennings­flyt",
                desc: "Innebygd Paperclip-workflow. Gjennomgå og godkjenn innhold før publisering.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 px-6 text-center text-xs text-zinc-600">
        ContentForge © {new Date().getFullYear()} — Wackazakka
      </footer>
    </div>
  );
}
