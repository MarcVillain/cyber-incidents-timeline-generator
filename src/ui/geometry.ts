// Layout maths shared by the renderers: time scales, chunking into pages and simple packing.

const MILLISECONDS_PER_MINUTE = 60000;
const DEFAULT_MINIMUM_SPAN_MINUTES = 15;

export interface TimeScale {
    at(date: Date | null): number;
    start: Date | null;
    end: Date | null;
    collapsed: boolean;
}

/**
 * Maps a set of moments onto a pixel range. When everything happened within a few minutes a plain
 * linear scale collapses the diagram, so the scale then puts everything in the middle.
 */
export function timeScale(dates: readonly (Date | null)[], from: number, to: number, minimumSpanMinutes = DEFAULT_MINIMUM_SPAN_MINUTES): TimeScale {
    const stamps = dates.filter((date): date is Date => date !== null).map(date => date.getTime());
    const middle = (from + to) / 2;
    if (stamps.length === 0) {
        return { at: () => middle, start: null, end: null, collapsed: true };
    }

    const min = Math.min(...stamps);
    const max = Math.max(...stamps);
    const span = max - min;

    if (span < minimumSpanMinutes * MILLISECONDS_PER_MINUTE) {
        return { at: () => middle, start: new Date(min), end: new Date(max), collapsed: true };
    }

    return {
        collapsed: false,
        start: new Date(min),
        end: new Date(max),
        at(date: Date | null): number {
            if (!date) return from;
            return from + ((date.getTime() - min) / span) * (to - from);
        }
    };
}

/**
 * Ticks for a time axis, chosen so the labels stay readable at slide size.
 */
export function timeTicks(scale: TimeScale, count: number): Date[] {
    if (!scale.start || !scale.end || scale.collapsed) return [];
    const from = scale.start.getTime();
    const step = (scale.end.getTime() - from) / (count - 1);
    return Array.from({ length: count }, (_, index) => new Date(from + step * index));
}

/**
 * Splits a list into pages of at most perPage items, never leaving an empty page.
 *
 * The load is spread evenly once the number of pages is known, so fifteen items over a capacity of
 * fourteen become eight and seven rather than a full slide followed by one lonely card.
 */
export function paginate<TItem>(items: readonly TItem[], perPage: number): TItem[][] {
    if (items.length === 0) return [[]];

    const pageCount = Math.max(1, Math.ceil(items.length / perPage));
    const balanced = Math.ceil(items.length / pageCount);

    const pages: TItem[][] = [];
    for (let index = 0; index < items.length; index += balanced) {
        pages.push(items.slice(index, index + balanced));
    }
    return pages;
}

export interface Weighted {
    weight: number;
}

/**
 * Splits groups into pages while keeping the members of a group together, so a company or a lane never
 * gets cut in half across two slides.
 */
export function paginateGroups<TGroup extends Weighted>(groups: readonly TGroup[], capacityPerPage: number): TGroup[][] {
    const pages: TGroup[][] = [];
    let current: TGroup[] = [];
    let used = 0;

    groups.forEach(entry => {
        const cost = Math.max(1, entry.weight);
        if (used + cost > capacityPerPage && current.length > 0) {
            pages.push(current);
            current = [];
            used = 0;
        }
        current.push(entry);
        used += cost;
    });

    if (current.length > 0 || pages.length === 0) {
        pages.push(current);
    }
    return pages;
}

export function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

/**
 * Spreads overlapping positions apart along one axis, keeping the given minimum gap. Used so cards
 * hanging off a timeline never sit on top of each other.
 */
export function spread(positions: readonly number[], minimumGap: number, lower: number, upper: number): number[] {
    const sorted = positions.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    let cursor = lower;

    sorted.forEach(entry => {
        entry.value = Math.max(entry.value, cursor);
        cursor = entry.value + minimumGap;
    });

    if (cursor - minimumGap > upper) {
        let ceiling = upper;
        for (let index = sorted.length - 1; index >= 0; index -= 1) {
            const entry = sorted[index];
            if (!entry) continue;
            entry.value = Math.min(entry.value, ceiling);
            ceiling = entry.value - minimumGap;
        }
    }

    const result = new Array<number>(positions.length).fill(lower);
    sorted.forEach(entry => {
        result[entry.index] = clamp(entry.value, lower, upper);
    });
    return result;
}

export interface Span {
    start: number;
    end: number;
    row: number;
}

/**
 * Assigns each item the first row where it does not overlap anything already there, so a crowded lane
 * grows downwards instead of stacking labels on top of each other. Reports when the rows ran out, which
 * is the caller's cue to shrink the items and try again.
 */
export function packIntoRows(items: Span[], gap: number, maxRows: number): { rows: number; overflowed: boolean } {
    const rows: Span[][] = [];
    let overflowed = false;

    items.forEach(item => {
        let index = rows.findIndex(row => row.every(placed => item.start >= placed.end + gap || item.end + gap <= placed.start));
        if (index === -1) {
            if (rows.length >= maxRows) {
                index = rows.reduce((best, row, position) => (row.length < (rows[best]?.length ?? 0) ? position : best), 0);
                overflowed = true;
            } else {
                rows.push([]);
                index = rows.length - 1;
            }
        }
        rows[index]?.push(item);
        item.row = index;
    });

    return { rows: Math.max(1, rows.length), overflowed };
}
