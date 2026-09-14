import type { WallClock } from "./models.js";

const ZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/;
const MILLISECONDS_PER_HOUR = 3600000;

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * Brings any accepted spelling of a moment to YYYY-MM-DDTHH:mm:ss, which sorts correctly as text in
 * every database. A zone suffix is dropped rather than applied, for the reason given on WallClock.
 * Returns null when the value is not a real date.
 */
export function normalizeWallClock(value: string): WallClock | null {
    const match = WALL_CLOCK.exec(value.trim().replace(ZONE_SUFFIX, ""));
    if (!match) return null;

    const [, year, month, day, hours = "00", minutes = "00", seconds = "00"] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
    const consistent = parsed.getFullYear() === Number(year)
        && parsed.getMonth() === Number(month) - 1
        && parsed.getDate() === Number(day)
        && parsed.getHours() === Number(hours)
        && parsed.getMinutes() === Number(minutes);

    return consistent ? `${year}-${month}-${day}T${hours}:${minutes}:${seconds}` : null;
}

export function parseWallClock(value: WallClock | null | undefined): Date | null {
    if (!value) return null;
    const normalized = normalizeWallClock(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatWallClock(date: Date): WallClock {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export interface WallClockParts {
    date: string | null;
    time: string | null;
}

/**
 * Splits a moment into the two halves a form edits. A step whose time is not known keeps a null time
 * rather than pretending it happened at midnight.
 */
export function splitWallClock(date: Date | null, timeKnown: boolean): WallClockParts {
    if (!date) return { date: null, time: null };
    return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        time: timeKnown ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : null
    };
}

export function joinWallClock(date: string, time: string | null): WallClock {
    return `${date}T${time || "00:00"}:00`;
}

export function hoursBetween(from: Date | null, to: Date | null): number | null {
    if (!from || !to || to.getTime() < from.getTime()) return null;
    return (to.getTime() - from.getTime()) / MILLISECONDS_PER_HOUR;
}

export function hoursFromMilliseconds(milliseconds: number): number {
    return milliseconds / MILLISECONDS_PER_HOUR;
}

export function millisecondsFromHours(hours: number): number {
    return hours * MILLISECONDS_PER_HOUR;
}

// The interface is written in English, so the dates on a slide are too, whatever the browser is set to
const LOCALE = "en-GB";
const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
const DATE_FORMAT_SHORT = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short" });

const MINUTES_PER_HOUR = 60;
const HOURS_SHOWN_AS_HOURS = 48;
const HOURS_PER_DAY = 24;

export function formatDate(date: Date | null): string {
    return date ? DATE_FORMAT.format(date) : "";
}

export function formatDateShort(date: Date | null): string {
    return date ? DATE_FORMAT_SHORT.format(date) : "";
}

export function formatTime(date: Date | null): string {
    return date ? TIME_FORMAT.format(date) : "";
}

export function formatDateTime(date: Date | null): string {
    return date ? `${DATE_FORMAT.format(date)} ${TIME_FORMAT.format(date)}` : "";
}

export function formatDuration(hours: number | null): string | null {
    if (hours === null) return null;
    if (hours < 1) return `${Math.round(hours * MINUTES_PER_HOUR)}min`;
    if (hours < HOURS_SHOWN_AS_HOURS) return `${Math.round(hours * 10) / 10}h`;
    return `${Math.round(hours / HOURS_PER_DAY)}d`;
}

export interface Moment {
    at: Date | null;
    timeKnown: boolean;
}

/**
 * How a step announces when it happened: the day alone when nobody recorded a time.
 */
export function formatMoment(moment: Moment): string {
    if (!moment.at) return "";
    return moment.timeKnown ? formatDateTime(moment.at) : formatDate(moment.at);
}
