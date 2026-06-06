import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  const create = useMutation(api.quinielas.createQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [n, setN] = useState(10);
  const [file, setFile] = useState<File | null>(null);
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
        photoId: photoId as any,
      });
      nav(`/q/${res.quinielaId}/admin/${res.adminToken}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || uploading || !name.trim() || n < 2;

  return (
    <div className="min-h-svh bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Mundial 2026
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Crear quiniela · Mundial 2026
          </h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Nueva quiniela</CardTitle>
            <CardDescription>
              Define los datos y reparte el acceso a tus participantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nombre</Label>
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
                  placeholder="La gloria eterna"
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
                <p className="text-xs text-muted-foreground">Entre 2 y 48.</p>
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

              <Button type="submit" size="lg" disabled={disabled}>
                {busy ? "Creando…" : "Crear quiniela"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
