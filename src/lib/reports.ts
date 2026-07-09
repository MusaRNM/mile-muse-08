import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
} from "date-fns";
import type { FuelEntry, Trip } from "./types";
import { metersToUnit } from "./geo";
import type { DistanceUnit } from "./types";

export interface DateRange {
  start: number;
  end: number;
}

export type RangeKey = "today" | "week" | "month" | "year";

export function getRange(key: RangeKey, now = new Date()): DateRange {
  switch (key) {
    case "today":
      return { start: startOfDay(now).getTime(), end: endOfDay(now).getTime() };
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }).getTime(),
        end: endOfWeek(now, { weekStartsOn: 1 }).getTime(),
      };
    case "month":
      return { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() };
    case "year":
      return { start: startOfYear(now).getTime(), end: endOfYear(now).getTime() };
  }
}

export function inRange(t: number, range: DateRange): boolean {
  return t >= range.start && t <= range.end;
}

export interface TripSummary {
  businessMeters: number;
  personalMeters: number;
  unclassifiedMeters: number;
  totalMeters: number;
  durationSec: number;
  businessDurationSec: number;
  tripCount: number;
}

export function summarizeTrips(trips: Trip[], range?: DateRange): TripSummary {
  const filtered = range ? trips.filter((t) => inRange(t.startTime, range)) : trips;
  const s: TripSummary = {
    businessMeters: 0,
    personalMeters: 0,
    unclassifiedMeters: 0,
    totalMeters: 0,
    durationSec: 0,
    businessDurationSec: 0,
    tripCount: filtered.length,
  };
  for (const t of filtered) {
    s.totalMeters += t.distanceMeters;
    s.durationSec += t.durationSec;
    if (t.category === "business") {
      s.businessMeters += t.distanceMeters;
      s.businessDurationSec += t.durationSec;
    } else if (t.category === "personal") {
      s.personalMeters += t.distanceMeters;
    } else {
      s.unclassifiedMeters += t.distanceMeters;
    }
  }
  return s;
}

export interface FuelSummary {
  gallons: number;
  cost: number;
  entryCount: number;
  avgPricePerGallon: number;
}

export function summarizeFuel(fuel: FuelEntry[], range?: DateRange): FuelSummary {
  const filtered = range ? fuel.filter((f) => inRange(f.date, range)) : fuel;
  let gallons = 0;
  let cost = 0;
  for (const f of filtered) {
    gallons += f.gallons;
    cost += f.totalPrice;
  }
  return {
    gallons,
    cost,
    entryCount: filtered.length,
    avgPricePerGallon: gallons > 0 ? cost / gallons : 0,
  };
}

/** Business deduction estimate using the IRS standard mileage rate. */
export function irsDeduction(businessMeters: number, ratePerMile: number): number {
  return metersToUnit(businessMeters, "mi") * ratePerMile;
}

/** Average miles per gallon and cost per mile, when data allows. */
export function efficiencyStats(
  totalMeters: number,
  fuel: FuelSummary,
  unit: DistanceUnit,
) {
  const miles = metersToUnit(totalMeters, "mi");
  const distanceInUnit = metersToUnit(totalMeters, unit);
  return {
    mpg: fuel.gallons > 0 ? miles / fuel.gallons : null,
    costPerUnit: distanceInUnit > 0 ? fuel.cost / distanceInUnit : null,
  };
}

/** Daily mileage series (business vs personal) for charts. */
export function dailySeries(trips: Trip[], range: DateRange, unit: DistanceUnit) {
  const days = eachDayOfInterval({ start: range.start, end: range.end });
  return days.map((day) => {
    const dayRange = {
      start: startOfDay(day).getTime(),
      end: endOfDay(day).getTime(),
    };
    const s = summarizeTrips(trips, dayRange);
    return {
      label: format(day, days.length > 10 ? "d" : "EEE"),
      fullLabel: format(day, "MMM d"),
      business: +metersToUnit(s.businessMeters, unit).toFixed(1),
      personal: +metersToUnit(s.personalMeters, unit).toFixed(1),
    };
  });
}

/** Monthly mileage series for the year view. */
export function monthlySeries(trips: Trip[], range: DateRange, unit: DistanceUnit) {
  const months = eachMonthOfInterval({ start: range.start, end: range.end });
  return months.map((month) => {
    const mRange = {
      start: startOfMonth(month).getTime(),
      end: endOfMonth(month).getTime(),
    };
    const s = summarizeTrips(trips, mRange);
    return {
      label: format(month, "MMM"),
      fullLabel: format(month, "MMMM yyyy"),
      business: +metersToUnit(s.businessMeters, unit).toFixed(1),
      personal: +metersToUnit(s.personalMeters, unit).toFixed(1),
    };
  });
}

/** Monthly fuel spend series for the year view. */
export function monthlyFuelSeries(fuel: FuelEntry[], range: DateRange) {
  const months = eachMonthOfInterval({ start: range.start, end: range.end });
  return months.map((month) => {
    const mRange = {
      start: startOfMonth(month).getTime(),
      end: endOfMonth(month).getTime(),
    };
    const s = summarizeFuel(fuel, mRange);
    return { label: format(month, "MMM"), cost: +s.cost.toFixed(2) };
  });
}
