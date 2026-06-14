import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { EditableAvatar } from "@/components/EditableAvatar";

const mockPick = jest.fn();
jest.mock("@/lib/usePhotoUpload", () => ({
  usePhotoUpload: () => ({ pickAndUpload: mockPick, busy: false }),
}));

beforeEach(() => mockPick.mockReset());

describe("EditableAvatar", () => {
  it("muestra el avatar (inicial) y el botón de cambiar foto", () => {
    render(<EditableAvatar name="María" url={null} onUploaded={jest.fn()} />);
    expect(screen.getByLabelText("Cambiar foto")).toBeOnTheScreen();
    expect(screen.getByText("M")).toBeOnTheScreen();
  });

  it("al subir una foto llama onUploaded con el photoId", async () => {
    mockPick.mockResolvedValue({ photoId: "stor_9", uri: "file://x.jpg" });
    const onUploaded = jest.fn(async () => undefined);
    render(<EditableAvatar name="Ana" url={null} onUploaded={onUploaded} />);
    fireEvent.press(screen.getByLabelText("Cambiar foto"));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("stor_9"));
  });

  it("muestra un preview optimista de la foto recién elegida", async () => {
    mockPick.mockResolvedValue({ photoId: "stor_9", uri: "file://nueva.jpg" });
    const onUploaded = jest.fn(async () => undefined);
    render(<EditableAvatar name="Ana" url={null} onUploaded={onUploaded} />);
    fireEvent.press(screen.getByLabelText("Cambiar foto"));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.getByTestId("avatar-image").props.source).toEqual([
      { uri: "file://nueva.jpg" },
    ]);
  });

  it("si el usuario cancela (null), no llama onUploaded", async () => {
    mockPick.mockResolvedValue(null);
    const onUploaded = jest.fn(async () => undefined);
    render(<EditableAvatar name="Ana" url={null} onUploaded={onUploaded} />);
    fireEvent.press(screen.getByLabelText("Cambiar foto"));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
