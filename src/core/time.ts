import type { WallClock } from "./models.js";

const ZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/;
const MILLISECONDS_PER_HOUR = 3600000;
const MILLISECONDS_PER_MINUTE = 60000;

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

/**
 * The moment halfway between two others. It falls on a whole minute because forms edit minutes, and
 * never before the first moment so it keeps its place after it.
 */
export function momentBetween(from: Date, to: Date): Date {
    const halfway = (from.getTime() + to.getTime()) / 2;
    const minute = Math.floor(halfway / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;
    return new Date(Math.max(from.getTime(), minute));
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

/** The dates on a slide read the same everywhere until a host asks for its own locale. */
export const DEFAULT_LOCALE = "en-GB";

const MINUTES_PER_HOUR = 60;
const HOURS_SHOWN_AS_HOURS = 48;
const HOURS_PER_DAY = 24;

/**
 * Dates and durations in one locale. Built once and carried, rather than read from a global, so two
 * workspaces on one page can speak different languages.
 */
export class TimeFormats {
    readonly locale: string;
    private readonly date: Intl.DateTimeFormat;
    private readonly time: Intl.DateTimeFormat;
    private readonly dateShort: Intl.DateTimeFormat;
    private readonly units: DurationUnits;

    constructor(locale: string = DEFAULT_LOCALE, units: DurationUnits = DEFAULT_DURATION_UNITS) {
        this.locale = locale;
        this.date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });
        this.time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
        this.dateShort = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
        this.units = units;
    }

    formatDate(date: Date | null): string {
        return date ? this.date.format(date) : "";
    }

    formatDateShort(date: Date | null): string {
        return date ? this.dateShort.format(date) : "";
    }

    formatTime(date: Date | null): string {
        return date ? this.time.format(date) : "";
    }

    formatDateTime(date: Date | null): string {
        return date ? `${this.date.format(date)} ${this.time.format(date)}` : "";
    }

    formatDuration(hours: number | null): string | null {
        if (hours === null) return null;
        if (hours < 1) return `${Math.round(hours * MINUTES_PER_HOUR)}${this.units.minutes}`;
        if (hours < HOURS_SHOWN_AS_HOURS) return `${Math.round(hours * 10) / 10}${this.units.hours}`;
        return `${Math.round(hours / HOURS_PER_DAY)}${this.units.days}`;
    }

    formatMoment(moment: Moment): string {
        if (!moment.at) return "";
        return moment.timeKnown ? this.formatDateTime(moment.at) : this.formatDate(moment.at);
    }
}

/** The suffixes a duration is written with, which no Intl format covers. */
export interface DurationUnits {
    minutes: string;
    hours: string;
    days: string;
}

export const DEFAULT_DURATION_UNITS: DurationUnits = { minutes: "min", hours: "h", days: "d" };

const DEFAULT_FORMATS = new TimeFormats();

export function formatDate(date: Date | null): string {
    return DEFAULT_FORMATS.formatDate(date);
}

export function formatDateShort(date: Date | null): string {
    return DEFAULT_FORMATS.formatDateShort(date);
}

export function formatTime(date: Date | null): string {
    return DEFAULT_FORMATS.formatTime(date);
}

export function formatDateTime(date: Date | null): string {
    return DEFAULT_FORMATS.formatDateTime(date);
}

export function formatDuration(hours: number | null): string | null {
    return DEFAULT_FORMATS.formatDuration(hours);
}

export interface Moment {
    at: Date | null;
    timeKnown: boolean;
}

/**
 * How a step announces when it happened: the day alone when nobody recorded a time.
 */
export function formatMoment(moment: Moment): string {
    return DEFAULT_FORMATS.formatMoment(moment);
}
