import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { FuelEntry, Trip, DistanceUnit } from "./types";
import { metersToUnit, mpsToUnitSpeed, unitLabel, formatHours } from "./geo";
import {
  summarizeTrips,
  summarizeFuel,
  irsDeduction,
  type DateRange,
} from "./reports";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ReportInput {
  trips: Trip[];
  fuel: FuelEntry[];
  range: DateRange;
  unit: DistanceUnit;
  irsRatePerMile: number;
  title: string;
}

function fmt(d: number) {
  return format(d, "yyyy-MM-dd HH:mm");
}

function tripRows(trips: Trip[], unit: DistanceUnit) {
  return trips
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((t) => [
      format(t.startTime, "yyyy-MM-dd"),
      format(t.startTime, "HH:mm"),
      format(t.endTime, "HH:mm"),
      metersToUnit(t.distanceMeters, unit).toFixed(1),
      formatHours(t.durationSec, 2),
      mpsToUnitSpeed(t.avgSpeed, unit).toFixed(0),
      mpsToUnitSpeed(t.maxSpeed, unit).toFixed(0),
      t.category,
      t.startAddress ?? "",
      t.endAddress ?? "",
    ]);
}

function fuelRows(fuel: FuelEntry[]) {
  return fuel
    .slice()
    .sort((a, b) => a.date - b.date)
    .map((f) => [
      format(f.date, "yyyy-MM-dd"),
      f.station ?? "",
      f.gallons.toFixed(2),
      f.pricePerGallon.toFixed(3),
      f.totalPrice.toFixed(2),
    ]);
}

const TRIP_HEADERS = [
  "Date",
  "Start",
  "End",
  "Distance",
  "Hours",
  "Avg",
  "Max",
  "Category",
  "From",
  "To",
];
const FUEL_HEADERS = ["Date", "Station", "Gallons", "$/gal", "Total $"];

/**
 * Sanitize a value against CSV/spreadsheet formula-injection (CWE-1236).
 * Cells beginning with = + - @ TAB CR are interpreted as formulas by
 * Excel, Google Sheets, Numbers, LibreOffice — including DDE/HYPERLINK
 * payloads that can exfiltrate data or launch commands. We defang by
 * prefixing a single quote, which every spreadsheet treats as a literal
 * string escape and strips on display.
 */
export function sanitizeSpreadsheetCell(v: string): string {
  if (v.length === 0) return v;
  const first = v.charCodeAt(0);
  // = + - @ \t \r
  if (first === 0x3d || first === 0x2b || first === 0x2d || first === 0x40 || first === 0x09 || first === 0x0d) {
    return "'" + v;
  }
  return v;
}

function csvEscape(v: string) {
  const safe = sanitizeSpreadsheetCell(v);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function exportCSV(input: ReportInput) {
  const { trips, fuel, range, unit } = input;
  const inTrips = trips.filter((t) => t.startTime >= range.start && t.startTime <= range.end);
  const inFuel = fuel.filter((f) => f.date >= range.start && f.date <= range.end);
  const ts = summarizeTrips(inTrips);
  const fs = summarizeFuel(inFuel);

  const lines: string[][] = [];
  lines.push([input.title]);
  lines.push([`${fmt(range.start)} — ${fmt(range.end)}`]);
  lines.push([]);
  lines.push(["Summary"]);
  lines.push(["Business " + unitLabel(unit), metersToUnit(ts.businessMeters, unit).toFixed(1)]);
  lines.push(["Personal " + unitLabel(unit), metersToUnit(ts.personalMeters, unit).toFixed(1)]);
  lines.push(["Driving hours", formatHours(ts.durationSec, 2)]);
  lines.push(["Trips", String(ts.tripCount)]);
  lines.push(["Fuel gallons", fs.gallons.toFixed(2)]);
  lines.push(["Fuel cost $", fs.cost.toFixed(2)]);
  lines.push([
    "Est. IRS deduction $",
    irsDeduction(ts.businessMeters, input.irsRatePerMile).toFixed(2),
  ]);
  lines.push([]);
  lines.push(["Trips"]);
  lines.push(TRIP_HEADERS);
  tripRows(inTrips, unit).forEach((r) => lines.push(r));
  lines.push([]);
  lines.push(["Fuel"]);
  lines.push(FUEL_HEADERS);
  fuelRows(inFuel).forEach((r) => lines.push(r));

  const csv = lines.map((row) => row.map((c) => csvEscape(String(c))).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName(input, "csv"));
}

/** Excel export via SpreadsheetML-compatible HTML table (opens natively in Excel/Sheets). */
export function exportExcel(input: ReportInput) {
  const { trips, fuel, range, unit } = input;
  const inTrips = trips.filter((t) => t.startTime >= range.start && t.startTime <= range.end);
  const inFuel = fuel.filter((f) => f.date >= range.start && f.date <= range.end);
  const ts = summarizeTrips(inTrips);
  const fs = summarizeFuel(inFuel);

  const esc = (v: unknown) =>
    sanitizeSpreadsheetCell(String(v)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const table = (headers: string[], rows: (string | number)[][]) =>
    `<table border="1"><thead><tr>${headers
      .map((h) => `<th>${esc(h)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;

  const summary = table(
    ["Metric", "Value"],
    [
      [`Business ${unitLabel(unit)}`, metersToUnit(ts.businessMeters, unit).toFixed(1)],
      [`Personal ${unitLabel(unit)}`, metersToUnit(ts.personalMeters, unit).toFixed(1)],
      ["Driving hours", formatHours(ts.durationSec, 2)],
      ["Trips", ts.tripCount],
      ["Fuel gallons", fs.gallons.toFixed(2)],
      ["Fuel cost $", fs.cost.toFixed(2)],
      ["Est. IRS deduction $", irsDeduction(ts.businessMeters, input.irsRatePerMile).toFixed(2)],
    ],
  );

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>
    <h2>${esc(input.title)}</h2><p>${esc(fmt(range.start))} — ${esc(fmt(range.end))}</p>
    <h3>Summary</h3>${summary}
    <h3>Trips</h3>${table(TRIP_HEADERS, tripRows(inTrips, unit))}
    <h3>Fuel</h3>${table(FUEL_HEADERS, fuelRows(inFuel))}
    </body></html>`;

  triggerDownload(
    new Blob([html], { type: "application/vnd.ms-excel" }),
    fileName(input, "xls"),
  );
}

export function exportPDF(input: ReportInput) {
  const { trips, fuel, range, unit } = input;
  const inTrips = trips.filter((t) => t.startTime >= range.start && t.startTime <= range.end);
  const inFuel = fuel.filter((f) => f.date >= range.start && f.date <= range.end);
  const ts = summarizeTrips(inTrips);
  const fs = summarizeFuel(inFuel);

  const doc = new jsPDF();
  const orange: [number, number, number] = [214, 122, 33];

  doc.setFontSize(18);
  doc.text("MileTrack — " + input.title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${fmt(range.start)}  —  ${fmt(range.end)}`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [["Summary", ""]],
    body: [
      [`Business ${unitLabel(unit)}`, metersToUnit(ts.businessMeters, unit).toFixed(1)],
      [`Personal ${unitLabel(unit)}`, metersToUnit(ts.personalMeters, unit).toFixed(1)],
      ["Driving hours", formatHours(ts.durationSec, 2)],
      ["Total trips", String(ts.tripCount)],
      ["Fuel gallons", fs.gallons.toFixed(2)],
      ["Fuel cost", "$" + fs.cost.toFixed(2)],
      ["Est. IRS deduction", "$" + irsDeduction(ts.businessMeters, input.irsRatePerMile).toFixed(2)],
    ],
    theme: "striped",
    headStyles: { fillColor: orange },
  });

  autoTable(doc, {
    head: [TRIP_HEADERS],
    body: tripRows(inTrips, unit),
    theme: "grid",
    styles: { fontSize: 7 },
    headStyles: { fillColor: orange },
    columnStyles: { 8: { cellWidth: 30 }, 9: { cellWidth: 30 } },
  });

  if (inFuel.length) {
    autoTable(doc, {
      head: [FUEL_HEADERS],
      body: fuelRows(inFuel),
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: orange },
    });
  }

  doc.save(fileName(input, "pdf"));
}

function fileName(input: ReportInput, ext: string): string {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `miletrack-${slug}-${format(input.range.start, "yyyyMMdd")}.${ext}`;
}
