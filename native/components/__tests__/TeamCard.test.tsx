/**
 * TeamFlag + TeamCard (SEN-25, Tarea B). Espejo de src/components/TeamCard.tsx.
 * - TeamFlag: emoji → <Text> sin imagen; URL http → <Image source.uri == flag>.
 * - TeamCard: equipo vivo (badge "Vivo", sin tachado, opacidad llena) vs
 *   eliminado (badge "Fuera", nombre tachado, card opacity-45); próximo/último
 *   se muestran/ocultan según nextMatch/lastResult.
 */
import { render, screen } from "@testing-library/react-native";
import type { PersonalData } from "@convex/types";

import { TeamCard, TeamFlag } from "@/components/TeamCard";

type Team = PersonalData["teams"][number];

const team = (over: Partial<Team> = {}): Team => ({
  team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  alive: true,
  group: "A",
  nextMatch: null,
  lastResult: null,
  ...over,
});

describe("TeamFlag", () => {
  it("emoji → renderiza <Text>, sin <Image>", () => {
    render(<TeamFlag flag="🇲🇽" name="México" />);
    expect(screen.getByText("🇲🇽")).toBeOnTheScreen();
    expect(screen.queryByTestId("team-flag-image")).toBeNull();
  });

  it("URL http → renderiza <Image> con source.uri == flag", () => {
    const url = "https://example.com/escudo.png";
    render(<TeamFlag flag={url} name="Club" />);
    const img = screen.getByTestId("team-flag-image");
    expect(img).toBeOnTheScreen();
    // expo-image normaliza `source` a un array de fuentes.
    expect(img.props.source).toEqual([{ uri: url }]);
  });
});

describe("TeamCard", () => {
  it("equipo vivo → badge Vivo, sin tachado, opacidad llena", () => {
    render(<TeamCard t={team({ alive: true })} />);
    expect(screen.getByText(/Vivo/)).toBeOnTheScreen();
    expect(screen.queryByText("Fuera")).toBeNull();

    const name = screen.getByTestId("team-name");
    const nameStyle = name.props.className ?? "";
    expect(nameStyle).not.toContain("line-through");

    const card = screen.getByTestId("team-card");
    const cardClass = card.props.className ?? "";
    expect(cardClass).not.toContain("opacity-45");
  });

  it("equipo eliminado → badge Fuera, nombre tachado, card opacity-45", () => {
    render(<TeamCard t={team({ alive: false })} />);
    expect(screen.getByText("Fuera")).toBeOnTheScreen();
    expect(screen.queryByText(/Vivo/)).toBeNull();

    const name = screen.getByTestId("team-name");
    expect(name.props.className ?? "").toContain("line-through");

    const card = screen.getByTestId("team-card");
    expect(card.props.className ?? "").toContain("opacity-45");
  });

  it("muestra Grupo y nombre del equipo", () => {
    render(<TeamCard t={team({ group: "B" })} />);
    expect(screen.getByText("México")).toBeOnTheScreen();
    expect(screen.getByText(/Grupo B/)).toBeOnTheScreen();
  });

  it("nextMatch presente → línea Próximo: con rival y dueño", () => {
    render(
      <TeamCard
        t={team({
          nextMatch: {
            opponent: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
            opponentOwner: "Ana",
            kickoffAt: 1_700_000_000_000,
          },
        })}
      />,
    );
    expect(screen.getByText(/Próximo:/)).toBeOnTheScreen();
    expect(screen.getByText(/Brasil/)).toBeOnTheScreen();
    expect(screen.getByText(/de Ana/)).toBeOnTheScreen();
  });

  it("nextMatch null → no hay línea Próximo:", () => {
    render(<TeamCard t={team({ nextMatch: null })} />);
    expect(screen.queryByText(/Próximo:/)).toBeNull();
  });

  it("lastResult presente → línea Último:", () => {
    render(<TeamCard t={team({ lastResult: "Ganó 2-1" })} />);
    expect(screen.getByText(/Último:/)).toBeOnTheScreen();
    expect(screen.getByText(/Ganó 2-1/)).toBeOnTheScreen();
  });

  it("lastResult null → no hay línea Último:", () => {
    render(<TeamCard t={team({ lastResult: null })} />);
    expect(screen.queryByText(/Último:/)).toBeNull();
  });
});
