// Avatar con botón para cambiar la foto desde la galería. Port nativo de
// src/components/EditableAvatar.tsx, pero GENÉRICO: hace pick+upload con
// usePhotoUpload y entrega el photoId por onUploaded; el padre elige la mutación
// (updateParticipantPhoto para el perfil, updateQuinielaPhoto para la quiniela).
//
// RN: cada texto lleva color explícito. El botón 📷 va como ÚLTIMO hijo del View
// relativo (sobre el avatar). `ringClassName` decora el anillo (p. ej.
// "rounded-full border-2 border-gold" para el campeón).
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Id } from "@convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { usePhotoUpload } from "@/lib/usePhotoUpload";

export function EditableAvatar({
  name,
  url,
  size = 48,
  ringClassName,
  onUploaded,
}: {
  name: string;
  url?: string | null;
  size?: number;
  ringClassName?: string;
  onUploaded: (photoId: Id<"_storage">) => Promise<void> | void;
}) {
  const { pickAndUpload, busy } = usePhotoUpload();
  const [saving, setSaving] = useState(false);
  // Preview optimista: muestra la foto recién elegida de inmediato. Es lo que se
  // ve en pantallas sin `url` reactiva (p. ej. Crear quiniela) y da feedback
  // instantáneo en las que sí la tienen, antes de que el round-trip la actualice.
  const [localUri, setLocalUri] = useState<string | null>(null);
  const working = busy || saving;

  async function onPressCamera() {
    const r = await pickAndUpload();
    if (!r) return; // cancelado / sin permiso / fallo (console.warn en el hook)
    setLocalUri(r.uri);
    setSaving(true);
    try {
      await onUploaded(r.photoId);
    } catch (e) {
      console.warn("EditableAvatar: onUploaded falló", e);
      setLocalUri(null); // no se guardó: revierte al `url` real
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="relative shrink-0">
      <View className={ringClassName}>
        <Avatar name={name} url={localUri ?? url} size={size} />
      </View>
      {working && (
        <View className="absolute inset-0 items-center justify-center rounded-full bg-background/60">
          <Text className="font-sans text-xs text-foreground">…</Text>
        </View>
      )}
      {/* Último hijo: el botón pinta sobre el avatar (como el ::after web). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambiar foto"
        disabled={working}
        onPress={onPressCamera}
        className={`absolute -bottom-1 -right-1 size-6 items-center justify-center rounded-full bg-primary ${working ? "opacity-60" : "active:opacity-80"}`}
      >
        <Text className="font-sans text-[0.7rem] leading-none text-primary-foreground">
          📷
        </Text>
      </Pressable>
    </View>
  );
}
