import { renderHook, act } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { usePhotoUpload } from "@/lib/usePhotoUpload";

const mockGenerate = jest.fn(async () => "https://upload.convex/abc");
jest.mock("convex/react", () => ({ useMutation: () => mockGenerate }));

const okFetch = (storageId: string | null) =>
  jest.fn(async (input: unknown) => {
    if (typeof input === "string" && input.startsWith("file://")) {
      return { blob: async () => new Blob(["x"]) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ storageId }) } as unknown as Response;
  });

beforeEach(() => {
  mockGenerate.mockClear();
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://foto.jpg", mimeType: "image/jpeg" }],
  });
});

describe("usePhotoUpload", () => {
  it("sube la foto elegida y devuelve { photoId, uri }", async () => {
    global.fetch = okFetch("stor_123") as typeof fetch;
    const { result } = renderHook(() => usePhotoUpload());
    let out: Awaited<ReturnType<typeof result.current.pickAndUpload>> = null;
    await act(async () => { out = await result.current.pickAndUpload(); });
    expect(out).toEqual({ photoId: "stor_123", uri: "file://foto.jpg" });
    expect(mockGenerate).toHaveBeenCalled();
  });

  it("devuelve null si el usuario cancela el picker", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { result } = renderHook(() => usePhotoUpload());
    let out: unknown = "x";
    await act(async () => { out = await result.current.pickAndUpload(); });
    expect(out).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("devuelve null si se deniega el permiso", async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const { result } = renderHook(() => usePhotoUpload());
    let out: unknown = "x";
    await act(async () => { out = await result.current.pickAndUpload(); });
    expect(out).toBeNull();
  });

  it("devuelve null (sin lanzar) si la subida falla", async () => {
    global.fetch = jest.fn(async (input: unknown) => {
      if (typeof input === "string" && input.startsWith("file://"))
        return { blob: async () => new Blob(["x"]) } as unknown as Response;
      return { ok: false, status: 500 } as unknown as Response;
    }) as typeof fetch;
    const { result } = renderHook(() => usePhotoUpload());
    let out: unknown = "x";
    await act(async () => { out = await result.current.pickAndUpload(); });
    expect(out).toBeNull();
  });
});
