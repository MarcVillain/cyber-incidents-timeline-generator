// The rules of name protection as the settings keep them: read back from stored or imported JSON, and
// edited in a tab of the settings dialog. The view setting and the review live in the workspace.

import { DEFAULT_CENSOR_LENGTHS, DEFAULT_PREFIXES, MAX_CENSOR_LENGTH, MAX_PREFIX_LENGTH, MAX_TERM_LENGTH, defaultPrivacyRules, type ManualTerm, type PrivacyRules } from "../core/anonymize.js";
import { FuzzyExampleReason, FuzzyLevel, SensitiveCategory, enumValues, isEnumValue } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { h } from "./dom.js";
import { button, checkbox, field, row, select, textInput, type Choice } from "./forms.js";
import type { IconSet } from "./icons/icon-set.js";
import type { Strings } from "./strings.js";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
    return typeof value === "string" && value.trim() !== "" && value.length <= max;
}

function texts(value: unknown, max: number): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => isText(entry, max)))] : [];
}

const LENGTH_SEPARATOR = ",";

/** A way a name may be written, and the lowest sensitivity that still catches it. */
export interface FuzzyExample {
    mention: string;
    reason: FuzzyExampleReason;
    caughtFrom: FuzzyLevel;
}

export const FUZZY_EXAMPLE_NAME = "Contoso Bank";

// Checked against the masker by the tests, so what the tab promises is what gets masked
export const FUZZY_EXAMPLES: readonly FuzzyExample[] = [
    { mention: "CONTOSO-BANK", reason: FuzzyExampleReason.Case, caughtFrom: FuzzyLevel.Exact },
    { mention: "Cont\u00f6so Bank", reason: FuzzyExampleReason.Accent, caughtFrom: FuzzyLevel.Normal },
    { mention: "ContosoBank", reason: FuzzyExampleReason.Glued, caughtFrom: FuzzyLevel.Normal },
    { mention: "Contosso Bank", reason: FuzzyExampleReason.Typo, caughtFrom: FuzzyLevel.Normal },
    { mention: "Kontosso Bank", reason: FuzzyExampleReason.Typos, caughtFrom: FuzzyLevel.Aggressive }
];

const FUZZY_ORDER: readonly FuzzyLevel[] = [FuzzyLevel.Exact, FuzzyLevel.Normal, FuzzyLevel.Aggressive];

export function catchesAt(example: FuzzyExample, level: FuzzyLevel): boolean {
    return FUZZY_ORDER.indexOf(level) >= FUZZY_ORDER.indexOf(example.caughtFrom);
}

/** Whole lengths a bar can take, once each and shortest first, or null when none holds up. */
function censorLengths(values: readonly unknown[]): number[] | null {
    const lengths = values.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= 1 && entry <= MAX_CENSOR_LENGTH);
    return lengths.length > 0 ? [...new Set(lengths)].sort((left, right) => left - right) : null;
}

function parseTerm(value: unknown): ManualTerm[] {
    if (!isRecord(value) || !isText(value["text"], MAX_TERM_LENGTH) || !isEnumValue(SensitiveCategory, value["category"])) return [];
    return [{ text: value["text"].trim(), category: value["category"] }];
}

/**
 * Reads the rules from stored or imported JSON. A part that does not hold up falls back on its own, and
 * anything missing stays protected.
 */
export function parsePrivacy(value: unknown): PrivacyRules {
    const rules = defaultPrivacyRules();
    if (!isRecord(value)) return rules;
    if (isEnumValue(FuzzyLevel, value["fuzzy"])) rules.fuzzy = value["fuzzy"];
    const prefixes = value["prefixes"];
    if (isRecord(prefixes)) {
        for (const [category, prefix] of Object.entries(prefixes)) {
            if (isEnumValue(SensitiveCategory, category) && isText(prefix, MAX_PREFIX_LENGTH)) rules.prefixes[category] = prefix.trim();
        }
    }
    const revealed = value["revealed"];
    rules.revealed = Array.isArray(revealed) ? [...new Set(revealed.filter((entry): entry is SensitiveCategory => isEnumValue(SensitiveCategory, entry)))] : [];
    rules.revealedTerms = texts(value["revealedTerms"], MAX_TERM_LENGTH);
    const terms = value["terms"];
    rules.terms = Array.isArray(terms) ? terms.flatMap(parseTerm) : [];
    rules.confirmed = texts(value["confirmed"], MAX_TERM_LENGTH);
    rules.ignored = texts(value["ignored"], MAX_TERM_LENGTH);
    rules.maskPanels = value["maskPanels"] === true;
    const lengths = value["censorLengths"];
    rules.censorLengths = (Array.isArray(lengths) ? censorLengths(lengths) : null) ?? [...DEFAULT_CENSOR_LENGTHS];
    return rules;
}

export interface PrivacyEditorOptions {
    rules: PrivacyRules;
    strings: Strings;
    icons: IconSet;
    onChange(rules: PrivacyRules): void;
}

function section(heading: string, hint: string | null, content: readonly HTMLElement[]): HTMLElement {
    return h("section", "tlg-settings-section", {}, [h("h3", null, {}, [heading]), hint === null ? null : h("p", "tlg-settings-hint", {}, [hint]), ...content]);
}

function categoryChoices(strings: Strings): Choice<SensitiveCategory>[] {
    return enumValues(SensitiveCategory).map(category => ({ value: category, label: strings.privacy.categories[category] }));
}

/**
 * The sections of the privacy tab. Each change hands back a new set of rules; the dialog keeps the draft.
 */
export function privacySections(options: PrivacyEditorOptions): HTMLElement[] {
    const { strings, icons } = options;
    const words = strings.privacy;
    const forms = { strings: strings.forms };
    let rules = options.rules;
    const commit = (next: PrivacyRules): void => {
        rules = next;
        options.onChange(next);
    };

    const levels: Choice<FuzzyLevel>[] = [
        { value: FuzzyLevel.Exact, label: words.fuzzyExact },
        { value: FuzzyLevel.Normal, label: words.fuzzyNormal },
        { value: FuzzyLevel.Aggressive, label: words.fuzzyAggressive }
    ];
    // Built once and only told the level, so the button pressed keeps the focus
    const levelButtons = levels.map(level => {
        const node = h("button", "tlg-chip-toggle", { type: "button", role: "radio" }, [level.label]);
        node.addEventListener("click", () => {
            commit({ ...rules, fuzzy: level.value });
            paintFuzzy();
        });
        return { level: level.value, node };
    });
    const examples = h("ul", "tlg-privacy-examples", { "aria-live": "polite" });
    const paintFuzzy = (): void => {
        levelButtons.forEach(({ level, node }) => node.setAttribute("aria-checked", String(level === rules.fuzzy)));
        examples.replaceChildren(...FUZZY_EXAMPLES.map(example => {
            const caught = catchesAt(example, rules.fuzzy);
            return h("li", caught ? "tlg-privacy-example is-caught" : "tlg-privacy-example", {}, [
                h("span", "tlg-privacy-term", {}, [example.mention]),
                h("span", "tlg-privacy-kind", {}, [words.exampleReasons[example.reason]]),
                h("span", "tlg-privacy-verdict", {}, [caught ? words.caught : words.missed])
            ]);
        }));
    };
    paintFuzzy();
    const fuzzy = h("div", "tlg-view-setting-choices", { role: "radiogroup", "aria-label": words.fuzzy }, levelButtons.map(entry => entry.node));
    const panels = checkbox(words.maskPanels, rules.maskPanels, value => commit({ ...rules, maskPanels: value }));

    const categories = enumValues(SensitiveCategory).map(category => {
        const name = words.categories[category];
        const protect = checkbox(name, !rules.revealed.includes(category), value => {
            const others = rules.revealed.filter(entry => entry !== category);
            commit({ ...rules, revealed: value ? others : [...others, category] });
        });
        const prefix = textInput(rules.prefixes[category] ?? null, value => {
            const prefixes = { ...rules.prefixes };
            const trimmed = value?.trim() ?? "";
            if (trimmed === "") {
                delete prefixes[category];
            } else {
                prefixes[category] = trimmed;
            }
            commit({ ...rules, prefixes });
        }, DEFAULT_PREFIXES[category]);
        prefix.maxLength = MAX_PREFIX_LENGTH;
        prefix.setAttribute("aria-label", words.prefixOf(name));
        return h("div", "tlg-settings-item tlg-privacy-category", {}, [protect, prefix]);
    });

    const list = h("div", "tlg-settings-list");
    const paintTerms = (): void => {
        if (rules.terms.length === 0) {
            list.replaceChildren(h("p", "tlg-settings-hint", {}, [words.noTerms]));
            return;
        }
        list.replaceChildren(...rules.terms.map((term, index) => {
            const remove = button(icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => {
                commit({ ...rules, terms: rules.terms.filter((_, position) => position !== index) });
                paintTerms();
            }, Icon.Trash);
            remove.setAttribute("aria-label", strings.settings.remove);
            return h("div", "tlg-settings-item tlg-privacy-entry", {}, [
                h("span", "tlg-privacy-term", {}, [term.text]),
                h("span", "tlg-privacy-kind", {}, [words.categories[term.category]]),
                remove
            ]);
        }));
    };
    paintTerms();

    let category = SensitiveCategory.Other;
    const input = h("input", "tlg-input", { type: "text", maxlength: String(MAX_TERM_LENGTH), placeholder: words.addTerm, "aria-label": words.addTerm });
    const kind = select(category, categoryChoices(strings), value => { category = value ?? SensitiveCategory.Other; }, forms);
    kind.classList.add("tlg-privacy-kind-picker");
    kind.querySelector("[data-primary]")?.setAttribute("aria-label", words.termCategory);
    const add = (): void => {
        const text = input.value.trim();
        if (text === "" || rules.terms.some(term => term.text === text)) return;
        commit({ ...rules, terms: [...rules.terms, { text, category }] });
        input.value = "";
        paintTerms();
    };
    input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        add();
    });

    const bars = textInput(rules.censorLengths.join(`${LENGTH_SEPARATOR} `), value => {
        const lengths = censorLengths((value ?? "").split(LENGTH_SEPARATOR).map(entry => Number(entry.trim())));
        if (lengths !== null) commit({ ...rules, censorLengths: lengths });
        bars.value = rules.censorLengths.join(`${LENGTH_SEPARATOR} `);
    }, DEFAULT_CENSOR_LENGTHS.join(`${LENGTH_SEPARATOR} `));

    const summary = h("p", "tlg-settings-hint");
    const paintSummary = (): void => {
        summary.textContent = words.decisionsHint(rules.revealedTerms.length, rules.confirmed.length, rules.ignored.length);
    };
    paintSummary();
    const forget = button(icons, words.forgetDecisions, "tlg-button", () => {
        commit({ ...rules, revealedTerms: [], confirmed: [], ignored: [] });
        paintSummary();
    }, Icon.Undo);

    return [
        section(words.detectionHeading, words.detectionHint, [fuzzy, h("p", "tlg-settings-hint tlg-privacy-example-intro", {}, [words.exampleIntro(FUZZY_EXAMPLE_NAME)]), examples]),
        section(words.censorHeading, words.censorHint, [field(words.censorLengths, bars)]),
        section(words.panelsHeading, words.panelsHint, [panels]),
        section(words.categoriesHeading, words.categoriesHint, [h("div", "tlg-settings-list", {}, categories)]),
        section(words.termsHeading, words.termsHint, [
            list,
            h("div", "tlg-settings-adder tlg-privacy-adder", {}, [input, kind, button(icons, words.addTerm, "tlg-button", add, Icon.Plus)])
        ]),
        section(words.decisionsHeading, null, [summary, row(forget)])
    ];
}
