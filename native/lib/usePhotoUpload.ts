// Subida de foto en nativo: galería (expo-image-picker) → Convex storage.
// Espejo del contrato de src/lib/usePhotoUpload.ts (web), adaptado a RN: en RN no
// hay objeto File; se obtiene el blob del uri local con fetch y se hace POST a la
// upload URL de Convex. pickAndUpload() devuelve { photoId, uri } (uri = preview
// local) o null si el usuario cancela / niega permiso / falla la subida.
import { useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type UploadResult = { photoId: Id<"_storage">; uri: string };

export function usePhotoUpload() {
  const generate = useMutation(api.quinielas.generateUploadUrl);
  const [busy, setBusy] = useState(false);

  async function pickAndUpload(): Promise<UploadResult | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    // mediaTypes: ['images'] — MediaTypeOptions está deprecado en SDK 56.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const url = await generate();
      const blob = await (await fetch(asset.uri)).blob();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
        body: blob,
      });
      if (!res.ok) throw new Error(`Falló la subida (${res.status})`);
      const { storageId } = await res.json();
      if (!storageId) throw new Error("La respuesta de subida no incluyó storageId");
      return { photoId: storageId as Id<"_storage">, uri: asset.uri };
    } catch (e) {
      // Sin toast nativo (mismo patrón que predict): se registra y no revienta.
      console.warn("usePhotoUpload: la subida falló", e);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { pickAndUpload, busy };
}
