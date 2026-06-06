import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { Shell } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FLAGS = ["🇲🇽", "🇧🇷", "🇦🇷", "🇫🇷", "🇪🇸", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🇩🇪", "🇵🇹", "🇳🇱", "🇺🇸", "🇨🇦", "🇯🇵"];

export default function Home() {
  const create = useMutation(api.quinielas.createQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [n, setN] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [assignMode, setAssignMode] = useState<"on_join" | "on_reveal">(
    "on_join",
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || n < 2) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await create({
        name,
        prizeText: prize,
        numParticipants: n,
        photoId: photoId as Id<"_storage"> | undefined,
        assignMode,
      });
      nav(`/q/${res.quinielaId}/admin/${res.adminToken}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || uploading || !name.trim() || n < 2;

  return (
    <Shell className="flex min-h-svh flex-col justify-center">
      <div className="animate-rise">
        {/* Hero */}
        <header className="grain bg-pitch relative mb-6 overflow-hidden rounded-3xl border border-border px-6 py-8 text-center [background:linear-gradient(160deg,oklch(0.3_0.06_174/0.7),oklch(0.24_0.04_166/0.4))]">
          <div className="mb-3 flex justify-center gap-1 text-2xl">
            {FLAGS.slice(0, 6).map((f, i) => (
              <span key={i}>{f}</span>
            ))}
          </div>
          <p className="text-xs font-bold tracking-[0.22em] text-gold uppercase">
            Mundial 2026
          </p>
          <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">
            Quiniela Mundial
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu quiniela, reparte equipos al azar y que gane el dueño del
            campeón. 🏆
          </p>
        </header>

        {/* Form */}
        <form
          className="grain relative flex flex-col gap-5 rounded-3xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre de la quiniela</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quiniela de la oficina"
              maxLength={60}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prize">Premio</Label>
            <Input
              id="prize"
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              placeholder="$5,000 / La gloria eterna"
              maxLength={60}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="n">Número de participantes</Label>
            <Input
              id="n"
              type="number"
              inputMode="numeric"
              min={2}
              max={48}
              value={n}
              onChange={(e) =>
                setN(
                  Math.max(
                    2,
                    Math.min(48, Math.floor(Number(e.target.value) || 0)),
                  ),
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Entre 2 y 48 · los 48 equipos se reparten entre ustedes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Reparto de equipos</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    v: "on_join",
                    title: "Al unirse",
                    sub: "Cada quien recibe sus equipos al inscribirse.",
                  },
                  {
                    v: "on_reveal",
                    title: "Sorteo en vivo 🎲",
                    sub: "Nadie recibe equipos hasta que des click. Más emoción.",
                  },
                ] as const
              ).map((o) => {
                const active = assignMode === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setAssignMode(o.v)}
                    aria-pressed={active}
                    className={
                      "rounded-2xl border px-3 py-2.5 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30")
                    }
                  >
                    <div className="text-sm font-bold text-foreground">
                      {o.title}
                    </div>
                    <div className="mt-0.5 text-[0.7rem] leading-snug">
                      {o.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="photo">Foto (opcional)</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={disabled}
            className="glow-primary h-12 rounded-2xl text-base font-bold"
          >
            {busy ? "Creando…" : "⚽ Crear quiniela"}
          </Button>
        </form>
      </div>
    </Shell>
  );
}
