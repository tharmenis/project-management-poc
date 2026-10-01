/**
 * Converts decimal hours to an ISO 8601 duration, which is what OpenProject
 * expects for a time entry: 1.5 -> "PT1H30M", 2 -> "PT2H", 0.25 -> "PT15M".
 */
export function hoursToIso8601(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const parts = `${wholeHours > 0 ? `${wholeHours}H` : ""}${minutes > 0 ? `${minutes}M` : ""}`;
  return `PT${parts || "0M"}`;
}
