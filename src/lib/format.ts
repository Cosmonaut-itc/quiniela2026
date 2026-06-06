export function whenLabel(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}
