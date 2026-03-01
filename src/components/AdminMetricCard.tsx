"use client";

import { Line, LineChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type MetricPoint = {
  label: string;
  value: number;
};

type MetricRow = {
  label: string;
  value: string;
  tone?: "default" | "muted";
};

export default function AdminMetricCard({
  title,
  description,
  seriesLabel,
  seriesColor,
  points,
  rows,
}: {
  title: string;
  description: string;
  seriesLabel: string;
  seriesColor: string;
  points: MetricPoint[];
  rows: MetricRow[];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ChartContainer
          className="h-28 w-full"
          config={{
            metric: { label: seriesLabel, color: seriesColor },
          }}
        >
          <LineChart data={points} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(label) => String(label)} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-metric)"
              strokeWidth={3}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ChartContainer>

        <div className="space-y-2 text-sm">
          {rows.map((row) => (
            <div
              key={`${title}-${row.label}`}
              className={`flex items-center justify-between gap-3 ${
                row.tone === "muted" ? "text-muted-foreground" : ""
              }`}
            >
              <span>{row.label}</span>
              <span className="font-medium text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
