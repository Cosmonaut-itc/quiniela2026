import { useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { GroupsView } from "@/components/GroupsView";
import { BracketView } from "@/components/BracketView";
import { Shell, BottomNav } from "@/components/Shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-4 h-9 w-full rounded-lg" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </Shell>
  );
}

export default function Mundial() {
  const { id } = useParams();
  const data = useQuery(api.mundial.getMundial, { quinielaId: id as Id<"quinielas"> });

  if (data === undefined) return <LoadingState />;

  return (
    <Shell bottomNav={<BottomNav id={id!} active="mundial" />}>
      <header className="mb-1 flex items-center gap-2">
        <span className="text-2xl">🌍</span>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">
          Mundial 2026
        </h1>
      </header>
      <p className="mb-4 text-sm text-muted-foreground">
        Cada equipo lleva la cara de su dueño.
      </p>

      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="h-10 w-full rounded-xl bg-muted/60 p-1">
          <TabsTrigger
            value="grupos"
            className="rounded-lg text-sm font-semibold data-active:bg-primary data-active:text-primary-foreground"
          >
            Grupos
          </TabsTrigger>
          <TabsTrigger
            value="bracket"
            className="rounded-lg text-sm font-semibold data-active:bg-primary data-active:text-primary-foreground"
          >
            Bracket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-4">
          <GroupsView groups={data.groups} />
        </TabsContent>
        <TabsContent value="bracket" className="mt-4">
          <BracketView bracket={data.bracket} />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
