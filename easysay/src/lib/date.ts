const dayMs = 24 * 60 * 60 * 1000;

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftLocalDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days, 12));
}

export function localWeekKey(date = new Date()): string {
  const day = date.getDay() || 7;
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - day + 1,
    12
  );
  return localDateKey(monday);
}

export function addLocalDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * dayMs).toISOString();
}
