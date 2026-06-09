// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks en la frontera de I/O: la subida al storage, la mutation de Convex y los
// toasts. `vi.hoisted` garantiza que existan antes de que corran las factories de
// `vi.mock` (que vitest sube al tope del archivo).
const { uploadMock, updatePhotoMock, toastSuccess, toastError } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  updatePhotoMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/usePhotoUpload", () => ({
  usePhotoUpload: () => ({ upload: uploadMock, uploading: false }),
}));
vi.mock("convex/react", () => ({ useMutation: () => updatePhotoMock }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { EditableAvatar } from "./EditableAvatar";

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}
function selectFile() {
  const file = new File(["x"], "foto.png", { type: "image/png" });
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

describe("EditableAvatar", () => {
  beforeEach(() => {
    uploadMock.mockReset().mockResolvedValue("photo_123");
    updatePhotoMock.mockReset().mockResolvedValue({ ok: true });
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("ofrece un botón para cambiar la foto y un input de imagen", () => {
    render(<EditableAvatar name="Ana" url={null} personalToken="tok" />);
    expect(screen.getByRole("button", { name: "Cambiar foto" })).toBeDefined();
    expect(fileInput().accept).toBe("image/*");
  });

  it("sube el archivo elegido y lo guarda con el personalToken", async () => {
    render(<EditableAvatar name="Ana" url={null} personalToken="tok-123" />);
    selectFile();
    await waitFor(() =>
      expect(updatePhotoMock).toHaveBeenCalledWith({ personalToken: "tok-123", photoId: "photo_123" }),
    );
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("avisa con error y no guarda si la subida falla", async () => {
    uploadMock.mockReset().mockRejectedValue(new Error("boom"));
    render(<EditableAvatar name="Ana" url={null} personalToken="tok" />);
    selectFile();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(updatePhotoMock).not.toHaveBeenCalled();
  });

  it("deshabilita el botón mientras se sube la foto", async () => {
    let resolveUpload!: (v: string) => void;
    uploadMock.mockReset().mockReturnValue(new Promise<string>((r) => { resolveUpload = r; }));
    render(<EditableAvatar name="Ana" url={null} personalToken="tok" />);
    const btn = screen.getByRole("button", { name: "Cambiar foto" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    selectFile();
    await waitFor(() => expect(btn.disabled).toBe(true));
    resolveUpload("photo_123");
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
