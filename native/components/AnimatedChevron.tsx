// Chevron `▾` compartido por las secciones colapsables (PlayerRow,
// PlayersTable). La web usa lucide ChevronDown + `group-data-[panel-open]:
// rotate-180`; uniwind 1.9.0 NO compila transition-*/group-data-*, y
// lucide-react-native no es dependencia, así que se porta como un `▾` <Text>
// rotado por react-native-reanimated (sí es dep).
//
// Interfaz: recibe `open: boolean` y posee su propia animación. No hace falta que
// el caller cree/gestione un SharedValue. El ángulo objetivo se deriva de `open`
// (-180° abierto → chevron apunta arriba, igual que rotate-180 web; 0° cerrado),
// y `withTiming` se invoca DENTRO del worklet de useAnimatedStyle, así la rotación
// la rige el estado `open` sin un setState-en-effect ni shared values manuales.
import { Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

const ChevronText = Animated.createAnimatedComponent(Text);

export function AnimatedChevron({
  open,
  className = "",
  testID,
}: {
  open: boolean;
  className?: string;
  testID?: string;
}) {
  // El worklet lee `open` y anima hacia el ángulo objetivo con withTiming; al
  // cambiar `open` (desde el handler de press del caller) re-evalúa y reanima.
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${withTiming(open ? -180 : 0, { duration: 200 })}deg` }],
  }));
  return (
    <ChevronText testID={testID} style={style} className={`font-sans ${className}`}>
      ▾
    </ChevronText>
  );
}
