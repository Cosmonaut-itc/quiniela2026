import "../global.css";
// Cada peso se importa por su subpath para que Metro empaquete SOLO esos TTF
// (el índice del paquete hace require de todos los pesos). Pesos = los que usa
// la web: Bricolage 500/600/700/800 (headings) y Sora 400/500/600/700 (body).
import { BricolageGrotesque_500Medium } from "@expo-google-fonts/bricolage-grotesque/500Medium";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { Sora_400Regular } from "@expo-google-fonts/sora/400Regular";
import { Sora_500Medium } from "@expo-google-fonts/sora/500Medium";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { ConvexProvider } from "convex/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { convex } from "@/lib/convex";

// A nivel módulo (no dentro del componente, llegaría tarde): mantiene visible
// el splash nativo hasta que las fuentes estén listas.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  useEffect(() => {
    // También con error se oculta el splash: mejor caer al font del sistema
    // que dejar la app colgada en el splash.
    if (fontsError) {
      console.warn("Fuentes no cargaron; se usa el font del sistema:", fontsError);
    }
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <ConvexProvider client={convex}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0d1f1a" } }} />
    </ConvexProvider>
  );
}
