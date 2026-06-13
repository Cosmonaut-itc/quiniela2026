// Port nativo READ-ONLY de src/components/Avatar.tsx. Sin subida de foto
// (EditableAvatar/expo-image-picker quedan fuera de SEN-25): solo muestra la
// imagen si hay `url`, o un círculo con la inicial como fallback.
//
// La web compone el shadcn <Avatar> (rounded-full + bg-muted en el fallback);
// aquí se replica con un <View rounded-full> + <Image> de expo-image (necesita
// width/height EXPLÍCITOS: no hay `size-8` implícito en RN).
//
// ANILLO DE CAMPEÓN (lo dibuja el LLAMADOR, no este componente — la web tampoco
// lo hornea en Avatar): la web aplica `.gold-ring` (src/index.css), un box-shadow
//   0 0 0 1px gold/.55, 0 0 22px -4px gold/.5
// que uniwind no tiene como utility. En nativo replícalo en el caller envolviendo
// el Avatar en un `rounded-full border-2 border-gold` (el halo del segundo
// box-shadow no es reproducible sin shadow nativo; el ring de 1px es la parte
// load-bearing). P. ej.:  <View className="rounded-full border-2 border-gold"><Avatar …/></View>
import { Image } from "expo-image";
import { Text, View } from "react-native";

export function Avatar({
  name,
  url,
  size = 32,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  return (
    <View
      testID="avatar-root"
      className="shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image
          testID="avatar-image"
          source={{ uri: url }}
          contentFit="cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <Text className="font-sans text-sm text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
