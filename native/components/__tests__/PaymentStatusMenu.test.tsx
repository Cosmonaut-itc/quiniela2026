import { fireEvent, render, screen } from "@testing-library/react-native";
import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";

describe("PaymentStatusMenu", () => {
  it("trigger 'Pendiente' cuando no ha pagado", () => {
    render(<PaymentStatusMenu paid={false} method={null} onSelect={jest.fn()} />);
    expect(screen.getByLabelText("Estado de pago")).toBeOnTheScreen();
    expect(screen.getByText("Pendiente")).toBeOnTheScreen();
  });

  it("trigger '✓ Efectivo' cuando pagó en efectivo", () => {
    render(<PaymentStatusMenu paid method="efectivo" onSelect={jest.fn()} />);
    expect(screen.getByText("✓ Efectivo")).toBeOnTheScreen();
  });

  it("abrir el menú y elegir 'Transferencia' llama onSelect", () => {
    const onSelect = jest.fn();
    render(<PaymentStatusMenu paid={false} method={null} onSelect={onSelect} />);
    fireEvent.press(screen.getByLabelText("Estado de pago"));
    fireEvent.press(screen.getByText("Transferencia"));
    expect(onSelect).toHaveBeenCalledWith("transferencia");
  });

  it("disabled → no abre el menú", () => {
    render(<PaymentStatusMenu paid={false} method={null} disabled onSelect={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("Estado de pago"));
    // El item "Transferencia" no aparece porque el menú no abrió.
    expect(screen.queryByText("Transferencia")).toBeNull();
  });
});
