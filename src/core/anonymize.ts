// Finds the names an incident holds wherever its free text mentions them, and replaces them for a view or
// an export that must not give them away. Records are never changed: a masked copy of the diagram is drawn.

import { Disclosure, FuzzyLevel, NodeCategory, NodeKind, SensitiveCategory, isEnumValue } from "./enums.js";
import type { Diagram, DiagramNode } from "./models.js";

/** Text to protect that no record holds as a name, such as the codename of a project. */
export interface ManualTerm {
    text: string;
    category: SensitiveCategory;
}

/**
 * What a viewer chose to protect and how. Everything is protected unless revealed here.
 */
export interface PrivacyRules {
    fuzzy: FuzzyLevel;
    /** Alias prefixes replacing the default of their category. */
    prefixes: Partial<Record<SensitiveCategory, string>>;
    /** Kinds of names shown as written. */
    revealed: SensitiveCategory[];
    /** Names shown as written, by their folded form. */
    revealedTerms: string[];
    terms: ManualTerm[];
    /** Near misses confirmed as mentions of the name they resemble, as they were written. */
    confirmed: string[];
    /** Near misses dismissed, as they were written. */
    ignored: string[];
    /** Whether the record list and the details are masked too, which leaves them read only. */
    maskPanels: boolean;
    /** The only lengths a censor bar takes. A name gets the closest, so a bar tells roughly how long it was. */
    censorLengths: number[];
}

/** A name the masker protects, or would were it not revealed. */
export interface ProtectedTerm {
    key: string;
    text: string;
    category: SensitiveCategory;
    revealed: boolean;
}

/** A mention just too far from a protected name to be caught, left for the viewer to decide. */
export interface NearMiss {
    key: string;
    text: string;
    term: string;
    category: SensitiveCategory;
}

export const DEFAULT_PREFIXES: Readonly<Record<SensitiveCategory, string>> = {
    [SensitiveCategory.Organization]: "Org",
    [SensitiveCategory.Person]: "Person",
    [SensitiveCategory.Team]: "Team",
    [SensitiveCategory.ThreatActor]: "Actor",
    [SensitiveCategory.Asset]: "Asset",
    [SensitiveCategory.Capability]: "Tool",
    [SensitiveCategory.Account]: "Account",
    [SensitiveCategory.Ip]: "IP",
    [SensitiveCategory.Email]: "Email",
    [SensitiveCategory.Hostname]: "Host",
    [SensitiveCategory.Domain]: "Domain",
    [SensitiveCategory.Url]: "URL",
    [SensitiveCategory.Hash]: "Hash",
    [SensitiveCategory.Username]: "User",
    [SensitiveCategory.Other]: "Redacted"
};

export const DEFAULT_CENSOR_LENGTHS: readonly number[] = [4, 8, 12];
export const MAX_CENSOR_LENGTH = 40;
export const CENSOR_GLYPH = "\u2588";
export const MAX_PREFIX_LENGTH = 20;
export const MAX_TERM_LENGTH = 120;

// A one letter name would mask every article in the text
const MIN_TERM_LENGTH = 2;
// Parts of a person's name are protected on their own, since a report rarely repeats the full name
const PERSON_PART_MIN_LENGTH = 3;
const NORMAL_TYPO_MIN_LENGTH = 5;
const AGGRESSIVE_MIN_LENGTH = 4;
const AGGRESSIVE_LENGTH_PER_TYPO = 4;
const AGGRESSIVE_MAX_TYPOS = 2;
// Short names sit two letters away from too many ordinary words to be worth reviewing
const NEAR_MISS_MIN_LENGTH = 6;
const HOSTNAME_MIN_LABELS = 3;

// Marks stay inside the word, so a name typed with decomposed accents is still one word
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
const COMBINING_MARK = /\p{M}/gu;

// Names with a dot that are files rather than domains
const FILE_EXTENSIONS: ReadonlySet<string> = new Set([
    "bat", "bin", "cmd", "csv", "dat", "dll", "doc", "docm", "docx", "exe", "gif", "gz", "htm", "html", "iso", "jar", "jpeg",
    "jpg", "js", "json", "lnk", "log", "msi", "pdf", "png", "ps1", "py", "rar", "sh", "sys", "tar", "tmp", "txt", "vbs",
    "xls", "xlsm", "xlsx", "xml", "zip"
]);

interface Detector {
    pattern: RegExp;
    categoryOf(found: string): SensitiveCategory | null;
}

const always = (category: SensitiveCategory) => (): SensitiveCategory => category;

function hostOrDomain(found: string): SensitiveCategory | null {
    const labels = found.split(".");
    const last = labels[labels.length - 1]?.toLowerCase() ?? "";
    if (FILE_EXTENSIONS.has(last)) return null;
    return labels.length >= HOSTNAME_MIN_LABELS ? SensitiveCategory.Hostname : SensitiveCategory.Domain;
}

const DETECTORS: readonly Detector[] = [
    { pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, categoryOf: always(SensitiveCategory.Email) },
    { pattern: /\b(?:https?|ftp):\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/gi, categoryOf: always(SensitiveCategory.Url) },
    { pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, categoryOf: always(SensitiveCategory.Ip) },
    // A lookahead stands where a lookbehind would, since Safari before 16.4 refuses the whole module over one
    { pattern: /(?:\b|(?=::))(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?)(?![\w:])/gi, categoryOf: always(SensitiveCategory.Ip) },
    { pattern: /\b(?:[a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})\b/gi, categoryOf: always(SensitiveCategory.Hash) },
    { pattern: /\b[\w.-]+\\[\w.$-]+/g, categoryOf: always(SensitiveCategory.Username) },
    { pattern: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi, categoryOf: hostOrDomain }
];

const KIND_CATEGORIES: Readonly<Record<NodeKind, SensitiveCategory>> = {
    [NodeKind.Person]: SensitiveCategory.Person,
    [NodeKind.Team]: SensitiveCategory.Team,
    [NodeKind.Company]: SensitiveCategory.Organization,
    [NodeKind.ThreatActor]: SensitiveCategory.ThreatActor,
    [NodeKind.Vendor]: SensitiveCategory.Organization,
    [NodeKind.Authority]: SensitiveCategory.Organization,
    [NodeKind.Workstation]: SensitiveCategory.Asset,
    [NodeKind.Server]: SensitiveCategory.Asset,
    [NodeKind.Account]: SensitiveCategory.Account,
    [NodeKind.Mailbox]: SensitiveCategory.Account,
    [NodeKind.File]: SensitiveCategory.Asset,
    [NodeKind.Application]: SensitiveCategory.Asset,
    [NodeKind.Network]: SensitiveCategory.Asset,
    [NodeKind.CloudService]: SensitiveCategory.Asset,
    [NodeKind.Credential]: SensitiveCategory.Account,
    [NodeKind.Database]: SensitiveCategory.Asset,
    [NodeKind.Device]: SensitiveCategory.Asset,
    [NodeKind.Malware]: SensitiveCategory.Capability,
    [NodeKind.Tool]: SensitiveCategory.Capability,
    [NodeKind.Exploit]: SensitiveCategory.Capability,
    [NodeKind.C2Server]: SensitiveCategory.Hostname,
    [NodeKind.Domain]: SensitiveCategory.Domain,
    [NodeKind.IpAddress]: SensitiveCategory.Ip,
    [NodeKind.Infrastructure]: SensitiveCategory.Asset
};

export function defaultPrivacyRules(): PrivacyRules {
    return {
        fuzzy: FuzzyLevel.Normal, prefixes: {}, revealed: [], revealedTerms: [], terms: [], confirmed: [], ignored: [], maskPanels: false,
        censorLengths: [...DEFAULT_CENSOR_LENGTHS]
    };
}

/** The bar standing for a name of this length. Halfway between two lengths, the longer one hides more. */
export function censorBar(length: number, lengths: readonly number[] = DEFAULT_CENSOR_LENGTHS): string {
    // A host handing no lengths at all still gets bars rather than names
    const offered = lengths.length > 0 ? lengths : DEFAULT_CENSOR_LENGTHS;
    const closest = offered.reduce((best, candidate) => {
        const gap = Math.abs(candidate - length) - Math.abs(best - length);
        return gap < 0 || (gap === 0 && candidate > best) ? candidate : best;
    });
    return CENSOR_GLYPH.repeat(closest);
}

function stripAccents(text: string): string {
    return text.normalize("NFD").replace(COMBINING_MARK, "");
}

/** The form names are compared and remembered by: lower case, without accents or punctuation. */
export function foldTerm(text: string): string {
    return words(stripAccents(text.toLowerCase())).map(token => token.text).join(" ");
}

interface Token {
    text: string;
    start: number;
    end: number;
}

function words(text: string): Token[] {
    return Array.from(text.matchAll(WORD), match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

function levenshtein(left: string, right: string): number {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
        const current = [row];
        for (let column = 1; column <= right.length; column += 1) {
            const substitution = (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
            current.push(Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, substitution));
        }
        previous = current;
    }
    return previous[right.length] ?? 0;
}

function typoBudget(level: FuzzyLevel, length: number): number {
    switch (level) {
        case FuzzyLevel.Exact:
            return 0;
        case FuzzyLevel.Normal:
            return length >= NORMAL_TYPO_MIN_LENGTH ? 1 : 0;
        case FuzzyLevel.Aggressive:
            return length >= AGGRESSIVE_MIN_LENGTH ? Math.min(AGGRESSIVE_MAX_TYPOS, Math.floor(length / AGGRESSIVE_LENGTH_PER_TYPO)) : 0;
    }
}

function categoryOfNode(node: DiagramNode): SensitiveCategory {
    if (isEnumValue(NodeKind, node.kind)) return KIND_CATEGORIES[node.kind];
    return node.category === NodeCategory.Actor ? SensitiveCategory.Organization : SensitiveCategory.Asset;
}

/** The category of a pattern spanning the whole text, if one does. */
function patternCategory(text: string): SensitiveCategory | null {
    for (const detector of DETECTORS) {
        for (const match of text.matchAll(detector.pattern)) {
            if (match.index === 0 && match[0].length === text.length) return detector.categoryOf(match[0]);
        }
    }
    return null;
}

interface Term {
    /** What alias and reveal go by, shared by every form of one name. */
    key: string;
    category: SensitiveCategory;
    /** The words compared, in the form the fuzzy level reads them. */
    tokens: string[];
    compared: string;
    budget: number;
    /** Whether a mention just out of reach is offered for review. Not for a single part of a name, which is too often an ordinary word. */
    reviewed: boolean;
}

interface Span {
    start: number;
    end: number;
    key: string;
    text: string;
    category: SensitiveCategory;
}

function overlaps(left: Span, right: Span): boolean {
    return left.start < right.end && right.start < left.end;
}

/** The longest of overlapping spans wins, so a mail address is masked whole rather than around a name. */
function resolve(spans: readonly Span[]): Span[] {
    const kept: Span[] = [];
    [...spans]
        .sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start)
        .forEach(span => {
            if (!kept.some(other => overlaps(other, span))) kept.push(span);
        });
    return kept.sort((left, right) => left.start - right.start);
}

/**
 * Masks the text of one incident under a set of rules. Built from the whole diagram, so a name gets the
 * same alias in every field, every view and every export.
 */
export class Masker {
    private readonly level: FuzzyLevel;
    private readonly rules: PrivacyRules;
    private readonly terms: Term[] = [];
    private readonly revealed: ReadonlySet<SensitiveCategory>;
    private readonly revealedTerms: ReadonlySet<string>;
    private readonly ignored: ReadonlySet<string>;
    private readonly aliases = new Map<string, string>();
    private readonly counters = new Map<string, number>();
    private readonly found = new Map<string, ProtectedTerm>();
    private readonly misses = new Map<string, NearMiss>();

    constructor(diagram: Diagram, rules: PrivacyRules) {
        this.level = rules.fuzzy;
        this.rules = rules;
        this.revealed = new Set(rules.revealed);
        this.revealedTerms = new Set(rules.revealedTerms);
        this.ignored = new Set(rules.ignored.map(foldTerm));

        if (diagram.incident.scope !== null) this.addTerm(diagram.incident.scope, SensitiveCategory.Organization);
        diagram.nodes.forEach(node => {
            const category = categoryOfNode(node);
            this.addTerm(node.name, category);
            if (category === SensitiveCategory.Person) {
                const key = foldTerm(node.name);
                words(node.name).filter(part => part.text.length >= PERSON_PART_MIN_LENGTH).forEach(part => this.addForm(part.text, key, category, false));
            }
            if (node.identifier !== null && patternCategory(node.identifier) === null) this.addTerm(node.identifier, category);
        });
        rules.terms.forEach(term => this.addTerm(term.text, term.category));
        rules.confirmed.forEach(text => this.addConfirmed(text));

        // Read once in the order of the diagram, so aliases are numbered the same whichever view asks first
        maskDiagram(diagram, this, Disclosure.Anonymized);
    }

    /** Every name met so far, revealed or not, in the order first met. */
    get protectedTerms(): readonly ProtectedTerm[] {
        return [...this.found.values()];
    }

    get nearMisses(): readonly NearMiss[] {
        return [...this.misses.values()];
    }

    mask(text: string, mode: Disclosure): string {
        if (mode === Disclosure.Full) return text;
        let masked = "";
        let cursor = 0;
        for (const span of this.spans(text)) {
            masked += text.slice(cursor, span.start) + (mode === Disclosure.Censored ? censorBar(span.end - span.start, this.rules.censorLengths) : this.alias(span));
            cursor = span.end;
        }
        return masked + text.slice(cursor);
    }

    private addTerm(text: string, category: SensitiveCategory): void {
        this.addForm(text, foldTerm(text), category);
    }

    private addForm(text: string, key: string, category: SensitiveCategory, reviewed = true): void {
        const tokens = this.tokensOf(text);
        const compared = this.joined(tokens);
        if (compared.replace(/ /g, "").length < MIN_TERM_LENGTH) return;
        if (this.terms.some(term => term.compared === compared)) return;
        this.terms.push({ key, category, tokens, compared, budget: typoBudget(this.level, compared.length), reviewed: reviewed && compared.length >= NEAR_MISS_MIN_LENGTH });
    }

    /** A confirmed near miss is one more form of the name it resembles most, and shares its alias. */
    private addConfirmed(text: string): void {
        const compared = this.joined(this.tokensOf(text));
        const closest = this.terms
            .map(term => ({ term, distance: levenshtein(term.compared, compared) }))
            .sort((left, right) => left.distance - right.distance)[0]?.term;
        this.addForm(text, closest?.key ?? foldTerm(text), closest?.category ?? SensitiveCategory.Other);
    }

    private tokensOf(text: string): string[] {
        return words(text).map(token => this.formOf(token.text));
    }

    private formOf(word: string): string {
        const lowered = word.toLowerCase();
        return this.level === FuzzyLevel.Exact ? lowered : stripAccents(lowered);
    }

    // Exact keeps the word boundaries; the other levels join the words, so ACME Corp also catches AcmeCorp
    private joined(tokens: readonly string[]): string {
        return tokens.join(this.level === FuzzyLevel.Exact ? " " : "");
    }

    private alias(span: Span): string {
        const known = this.aliases.get(span.key);
        if (known !== undefined) return known;
        const prefix = this.rules.prefixes[span.category] ?? DEFAULT_PREFIXES[span.category];
        const count = (this.counters.get(prefix) ?? 0) + 1;
        this.counters.set(prefix, count);
        const alias = `${prefix}-${count}`;
        this.aliases.set(span.key, alias);
        return alias;
    }

    private isRevealed(span: Span): boolean {
        return this.revealed.has(span.category) || this.revealedTerms.has(span.key);
    }

    private spans(text: string): Span[] {
        const candidates: Span[] = [];
        DETECTORS.forEach(detector => {
            for (const match of text.matchAll(detector.pattern)) {
                const category = detector.categoryOf(match[0]);
                if (category === null) continue;
                candidates.push({ start: match.index, end: match.index + match[0].length, key: foldTerm(match[0]), text: match[0], category });
            }
        });

        const misses: { span: Span; term: Term }[] = [];
        const tokens = words(text);
        const forms = tokens.map(token => this.formOf(token.text));
        this.terms.forEach(term => {
            this.windowsOf(term).forEach(size => {
                for (let first = 0; first + size <= tokens.length; first += 1) {
                    const candidate = this.joined(forms.slice(first, first + size));
                    if (Math.abs(candidate.length - term.compared.length) > term.budget + 1) continue;
                    const distance = levenshtein(candidate, term.compared);
                    const start = tokens[first]?.start ?? 0;
                    const end = tokens[first + size - 1]?.end ?? start;
                    const span = { start, end, key: term.key, text: text.slice(start, end), category: term.category };
                    if (distance <= term.budget) {
                        candidates.push(span);
                    } else if (distance === term.budget + 1 && term.reviewed) {
                        misses.push({ span, term });
                    }
                }
            });
        });

        const kept = resolve(candidates);
        kept.forEach(span => {
            if (!this.found.has(span.key)) this.found.set(span.key, { key: span.key, text: span.text, category: span.category, revealed: this.isRevealed(span) });
        });
        misses.forEach(({ span, term }) => {
            const key = foldTerm(span.text);
            if (kept.some(other => overlaps(other, span)) || this.ignored.has(key) || this.misses.has(key)) return;
            this.misses.set(key, { key, text: span.text, term: this.found.get(term.key)?.text ?? term.key, category: term.category });
        });
        // Revealed names are dropped only now, so a protected name inside a revealed one stays protected
        return resolve(candidates.filter(span => !this.isRevealed(span)));
    }

    /** Window sizes worth comparing: the name's own word count, and one either side when words may be glued. */
    private windowsOf(term: Term): number[] {
        const size = term.tokens.length;
        if (this.level === FuzzyLevel.Exact) return [size];
        return [size - 1, size, size + 1].filter(candidate => candidate >= 1);
    }
}

/**
 * A copy of the diagram with every free text field masked. Identifiers, keys, times and the vocabulary are
 * kept, so every view draws the same shapes. Host metadata is dropped, since nothing here can read it.
 */
export function maskDiagram(diagram: Diagram, masker: Masker, mode: Disclosure): Diagram {
    if (mode === Disclosure.Full) return diagram;
    const text = (value: string): string => masker.mask(value, mode);
    const optional = (value: string | null): string | null => (value === null ? null : text(value));
    const { incident } = diagram;
    return {
        ...diagram,
        incident: {
            ...incident,
            title: text(incident.title),
            referenceId: optional(incident.referenceId),
            scope: optional(incident.scope),
            classifications: incident.classifications.map(text),
            externalId: optional(incident.externalId),
            metadata: null
        },
        nodes: diagram.nodes.map(node => ({
            ...node,
            name: text(node.name),
            description: optional(node.description),
            identifier: optional(node.identifier),
            role: optional(node.role),
            externalId: optional(node.externalId),
            metadata: null
        })),
        steps: diagram.steps.map(step => ({
            ...step,
            title: text(step.title),
            description: optional(step.description),
            evidenceSource: optional(step.evidenceSource),
            tags: step.tags.map(text),
            externalId: optional(step.externalId),
            metadata: null
        })),
        links: diagram.links.map(link => ({ ...link, label: optional(link.label), metadata: null })),
        benchmark: { ...diagram.benchmark, scope: optional(diagram.benchmark.scope) }
    };
}
