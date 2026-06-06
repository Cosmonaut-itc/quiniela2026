import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useState } from "react";

export function usePhotoUpload() {
  const generate = useMutation(api.quinielas.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File): Promise<Id<"_storage">> {
    setUploading(true);
    try {
      const url = await generate();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Falló la subida (${res.status})`);
      const { storageId } = await res.json();
      if (!storageId) throw new Error("La respuesta de subida no incluyó storageId");
      return storageId as Id<"_storage">;
    } finally {
      setUploading(false);
    }
  }
  return { upload, uploading };
}
