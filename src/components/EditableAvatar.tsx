import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { Avatar } from "@/components/Avatar";

/**
 * Avatar con botón para cambiar la foto de perfil. Encapsula la subida al storage
 * de Convex y el patch del participante, así que basta el `personalToken`.
 * Lo usan tanto la vista personal Clásica como la de Progol (Mi panel).
 *
 * `ringClassName` decora el avatar (p. ej. `gold-ring` para el campeón en la Clásica).
 */
export function EditableAvatar({
  name,
  url,
  size = 48,
  personalToken,
  ringClassName,
}: {
  name: string;
  url?: string | null;
  size?: number;
  personalToken: string;
  ringClassName?: string;
}) {
  const { upload } = usePhotoUpload();
  const updatePhoto = useMutation(api.participants.updateParticipantPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function changePhoto(file: File) {
    setSaving(true);
    try {
      const photoId = await upload(file);
      // Si updatePhoto falla tras subir, el blob queda huérfano (costo mínimo);
      // mismo tradeoff del patrón de subida en Join/Home.
      await updatePhoto({ personalToken, photoId });
      toast.success("Foto actualizada");
    } catch {
      toast.error("No se pudo actualizar la foto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <div className={ringClassName}>
        <Avatar name={name} url={url} size={size} />
      </div>
      {saving && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
          <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={saving}
        aria-label="Cambiar foto"
        className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-opacity disabled:opacity-60 before:absolute before:inset-[-10px] before:content-['']"
      >
        <span className="text-[0.7rem] leading-none">📷</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void changePhoto(f);
          e.target.value = ""; // permite re-elegir el mismo archivo
        }}
      />
    </div>
  );
}
