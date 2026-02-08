import type { GoogleCalendarEvent } from "../hooks/useGoogleCalendar";

export type AvailabilityState = "free" | "busy";
export type ConfidenceLevel = "low" | "medium" | "high";

export type AvailabilitySlot = {
  start: string;
  end: string;
  state: AvailabilityState;
  confidenceLevel: ConfidenceLevel;
};

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value: string): Date {
  return new Date(value);
}

function buildEventRange(event: GoogleCalendarEvent): { start: Date; end: Date } {
  if (event.isAllDay) {
    const startDate = new Date(`${event.start}T00:00:00`);
    const endDate = event.end ? new Date(`${event.end}T00:00:00`) : new Date(startDate);
    if (!event.end) {
      endDate.setDate(endDate.getDate() + 1);
    }
    return { start: startDate, end: endDate };
  }
  const start = toDate(event.start);
  const end = event.end ? toDate(event.end) : new Date(start.getTime() + 60 * 60 * 1000);
  if (end <= start) {
    return { start, end: new Date(start.getTime() + 15 * 60 * 1000) };
  }
  return { start, end };
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function buildAvailabilitySlots(input: {
  events: GoogleCalendarEvent[];
  startDate: Date;
  days: number;
  slotMinutes?: number;
}): Record<string, AvailabilitySlot[]> {
  const slotMinutes = input.slotMinutes ?? 30;
  const slotsPerDay = Math.ceil((24 * 60) / slotMinutes);
  const eventRanges = input.events.map(buildEventRange);
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
      const isBusy = eventRanges.some((range) => overlaps(slotStart, slotEnd, range.start, range.end));
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
