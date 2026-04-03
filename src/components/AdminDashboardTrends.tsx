"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type TrendPoint = {
  label: string;
  matches: number;
  messages: number;
  shifts: number;
};

export default function AdminDashboardTrends({
  data,
}: {
  data: TrendPoint[];
}) {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    setLastUpdated(Date.now());

    const intervalId = window.setInterval(() => {
      setLastUpdated(Date.now());
      router.refresh();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Trends</CardTitle>
        <CardDescription>
          Auto-refresh every 30 seconds. This is near real-time and updates on each refresh.
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          Last refresh: {lastUpdated == null ? "Syncing..." : new Date(lastUpdated).toLocaleTimeString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChartContainer
          className="min-h-[280px] w-full"
          config={{
            matches: { label: "Matches", color: "#2ec4b6" },
            messages: { label: "Messages", color: "#1d4ed8" },
            shifts: { label: "Shifts", color: "#f59e0b" },
          }}
        >
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="matches" stroke="var(--color-matches)" strokeWidth={3} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="messages" stroke="var(--color-messages)" strokeWidth={3} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="shifts" stroke="var(--color-shifts)" strokeWidth={3} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
