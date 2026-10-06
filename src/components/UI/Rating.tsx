export function ratingColors(value: number) {
  return value >= 100
    ? ["#fbbf24", "#000"]
    : value >= 95
      ? ["#000", "#facc15"]
      : value >= 85
        ? ["#a21caf", "#fdf4ff"]
        : value >= 75
          ? ["#3b82f6", "#eff6ff"]
          : value >= 65
            ? ["#84cc16", "#1a2e05"]
            : value >= 55
              ? ["#facc15", "#422006"]
              : ["#475569", "#f8fafc"];
}
export default function Rating({ value }: { value?: number }) {
  const [background, color] = ratingColors(value ?? 0);
  return (
    <span
      className="rating"
      style={value === undefined ? undefined : { background, color }}
    >
      {value ?? "—"}
    </span>
  );
}
