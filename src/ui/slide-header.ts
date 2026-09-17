// What the title block of every slide says. The workspace builds a default from the incident, and a host
// can rewrite any part of it, or add its own facts, through a single callback.

import type { RepresentationInfo } from "../core/catalog.js";
import type { Incident } from "../core/models.js";
import type { DiagramStore } from "./diagram-store.js";
import type { Strings } from "./strings.js";
import type { Palette } from "./theme.js";

const CLASSIFICATION_SEPARATOR = "  /  ";
const KICKER_SEPARATOR = "   |   ";

/**
 * The rating shown under the reference, with the scale of every level drawn beneath it.
 */
export interface SlideImpact {
    /** A level of the configured impact scale, which places the marker on the scale. */
    level: string;
    label: string;
    color: string;
    showScale: boolean;
}

/**
 * A small fact set on the right of the header, such as a business or a regulatory rating.
 */
export interface SlideDetail {
    label: string;
    value: string;
    /** The colour of the value; null draws it in the normal ink. */
    color: string | null;
}

export interface SlideHeader {
    /** The rule across the top of the slide; null leaves it out. */
    accentColor: string | null;
    /** The small uppercase line above the title. */
    kicker: string;
    title: string;
    /** The line under the title; null leaves it out. */
    subtitle: string | null;
    /** The identifier in the top right corner; null leaves it out. */
    reference: string | null;
    impact: SlideImpact | null;
    details: SlideDetail[];
}

export interface SlideHeaderContext {
    incident: Incident;
    /** Lookups into the diagram and its catalog, such as the label of an impact level. */
    store: DiagramStore;
    /** Resolved colours, including palette.impactColor(level). */
    palette: Palette;
    representation: RepresentationInfo;
    page: number;
    pageCount: number;
    /** What the representation says about this slide, such as the dates it covers. */
    viewSubtitle: string | null;
    /** The words of the interface, so a rewritten header speaks the same language as the rest. */
    strings: Strings;
}

/**
 * Receives the header the workspace would draw and returns the one to draw. Return the header untouched to
 * keep the default, or spread it and replace only what differs.
 */
export type SlideHeaderCustomizer = (header: SlideHeader, context: SlideHeaderContext) => SlideHeader;

export function defaultSlideHeader(context: SlideHeaderContext): SlideHeader {
    const { incident, store, palette, representation, viewSubtitle } = context;
    const level = store.impactLevel(incident.impact);
    const assessed = level !== null && store.isAssessed(incident.impact);

    return {
        accentColor: palette.impactColor(incident.impact),
        kicker: [representation.label.toUpperCase(), incident.scope, viewSubtitle].filter(Boolean).join(KICKER_SEPARATOR),
        title: incident.title,
        subtitle: incident.classifications.length > 0 ? incident.classifications.join(CLASSIFICATION_SEPARATOR) : null,
        reference: incident.referenceId ?? `#${incident.id}`,
        impact: assessed ? {
            level: incident.impact,
            label: `${level.label.toUpperCase()} ${context.strings.slide.impactSuffix}`,
            color: palette.impactColor(incident.impact),
            showScale: true
        } : null,
        details: []
    };
}
