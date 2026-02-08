export type BusyBlock = { start: string; end: string };

export type AvailabilitySlot = {
  start: string;
  end: string;
  state: "free" | "busy";
  confidenceLevel: "medium";
};

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function buildAvailabilityFromBusy(input: {
  busy: BusyBlock[];
  startDate: Date;
  days: number;
  slotMinutes?: number;
}): Record<string, AvailabilitySlot[]> {
  const slotMinutes = input.slotMinutes ?? 30;
  const slotsPerDay = Math.ceil((24 * 60) / slotMinutes);
  const busyRanges = input.busy.map((block) => ({
    start: new Date(block.start),
    end: new Date(block.end),
  }));
  const result: Record<string, AvailabilitySlot[]> = {};

  for (let i = 0; i < input.days; i += 1) {
    const dayStart = new Date(input.startDate);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + i);
    const dayKey = formatDateKey(dayStart);
    const daySlots: AvailabilitySlot[] = [];

    for (let slot = 0; slot < slotsPerDay; slot += 1) {
      const slotStart = new Date(dayStart.getTime() + slot * slotMinutes * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60 * 1000);
      const isBusy = busyRanges.some((range) => overlaps(slotStart, slotEnd, range.start, range.end));
      daySlots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        state: isBusy ? "busy" : "free",
        confidenceLevel: "medium",
      });
    }

    result[dayKey] = daySlots;
  }

  return result;
}
