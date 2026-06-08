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
import { Textarea } from "@/components/ui/textarea";

const FLAGS = ["🇲🇽", "🇧🇷", "🇦🇷", "🇫🇷", "🇪🇸", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🇩🇪", "🇵🇹", "🇳🇱", "🇺🇸", "🇨🇦", "🇯🇵"];

export default function Home() {
  const create = useMutation(api.quinielas.createQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [n, setN] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [assignMode, setAssignMode] = useState<"on_join" | "on_reveal">(
    "on_join",
  );
  const [prizeMode, setPrizeMode] = useState<"fixed" | "per_person">("fixed");
  const [fee, setFee] = useState(200);
  const [gameMode, setGameMode] = useState<"clasica" | "progol">("clasica");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || n < 2) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await create({
        name,
        prizeText: prizeMode === "per_person" ? "" : prize,
        numParticipants: n,
        photoId: photoId as Id<"_storage"> | undefined,
        assignMode,
        prizeMode,
        entryFee: prizeMode === "per_person" ? fee : undefined,
        notes,
        gameMode,
      });
      nav(`/q/${res.quinielaId}/admin/${res.adminToken}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy || uploading || !name.trim() || n < 2 ||
    (prizeMode === "per_person" && fee < 1);

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
            <Label>Modo de juego</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "clasica", title: "Clásica", sub: "Se reparten los 48 equipos; gana el dueño del campeón." },
                  { v: "progol", title: "Progol 🎯", sub: "Cada quien pronostica 1/X/2 por partido; gana quien más acierte." },
                ] as const
              ).map((o) => {
                const active = gameMode === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setGameMode(o.v)}
                    aria-pressed={active}
                    className={
                      "rounded-2xl border px-3 py-2.5 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30")
                    }
                  >
                    <div className="text-sm font-bold text-foreground">{o.title}</div>
                    <div className="mt-0.5 text-[0.7rem] leading-snug">{o.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

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
            <Label htmlFor={prizeMode === "fixed" ? "prize" : "fee"}>Premio</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    v: "fixed",
                    title: "Premio fijo",
                    sub: "Un monto o frase para el dueño del campeón.",
                  },
                  {
                    v: "per_person",
                    title: "Por participación 💰",
                    sub: "Cuota por persona; el bote se arma con quienes confirmen su pago.",
                  },
                ] as const
              ).map((o) => {
                const active = prizeMode === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setPrizeMode(o.v)}
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
            {prizeMode === "fixed" ? (
              <Input
                id="prize"
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="$5,000 / La gloria eterna"
                maxLength={60}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-muted-foreground">$</span>
                <Input
                  id="fee"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={fee}
                  onChange={(e) =>
                    setFee(Math.max(1, Math.floor(Number(e.target.value) || 0)))
                  }
                  placeholder="200"
                />
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  por persona
                </span>
              </div>
            )}
          </div>

          {gameMode === "clasica" && (<>
          <div className="flex flex-col gap-2">
            <Label htmlFor="n">
              {prizeMode === "per_person"
                ? "Máximo de participantes"
                : "Número de participantes"}
            </Label>
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
              {prizeMode === "per_person"
                ? "Tope de gente; el bote refleja a quienes ya pagaron (tú confirmas cada pago). Los 48 equipos se reparten entre ustedes."
                : "Entre 2 y 48 · los 48 equipos se reparten entre ustedes."}
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
          </>)}

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reglas, fecha límite de pago, sede…"
              maxLength={1000}
              rows={3}
            />
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

        {/* Discreet open-source link */}
        <div className="mt-6 flex justify-center">
          <a
            href="https://github.com/Cosmonaut-itc/quiniela2026"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver el código en GitHub"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.27-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8z" />
            </svg>
            Código en GitHub
          </a>
        </div>
      </div>
    </Shell>
  );
}
