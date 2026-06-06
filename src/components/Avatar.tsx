import {
  Avatar as A,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

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
    <A style={{ width: size, height: size }}>
      {url ? <AvatarImage src={url} /> : null}
      <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </A>
  );
}
