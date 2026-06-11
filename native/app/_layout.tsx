import "../global.css";
import { Stack } from "expo-router";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0d1f1a" } }} />
    </ConvexProvider>
  );
}
