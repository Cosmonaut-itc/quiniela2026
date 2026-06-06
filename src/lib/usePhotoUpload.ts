import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useState } from "react";

export function usePhotoUpload() {
  const generate = useMutation(api.quinielas.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File): Promise<string> {
    setUploading(true);
    try {
      const url = await generate();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      return storageId as string;
    } finally {
      setUploading(false);
    }
  }
  return { upload, uploading };
}
