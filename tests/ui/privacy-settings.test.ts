import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultPrivacyRules, type PrivacyRules } from "../../src/core/anonymize.js";
import { FuzzyLevel, SensitiveCategory } from "../../src/core/enums.js";
import { IconSet } from "../../src/ui/icons/icon-set.js";
import { privacySections } from "../../src/ui/privacy-settings.js";
import { DEFAULT_STRINGS } from "../../src/ui/strings.js";
import { chooseOption, fieldNamed, installDom, syntheticEvent } from "../support/dom.js";

installDom();

const WORDS = DEFAULT_STRINGS.privacy;
const CODENAME = "Project Falcon";
const PREFIX = "Company";

function editor(rules: PrivacyRules = defaultPrivacyRules()): { root: HTMLElement; latest: () => PrivacyRules } {
    let latest = rules;
    const root = document.createElement("div");
    root.append(...privacySections({ rules, strings: DEFAULT_STRINGS, icons: new IconSet(), onChange: next => { latest = next; } }));
    return { root, latest: () => latest };
}

function checkboxNamed(root: HTMLElement, label: string): HTMLInputElement {
    const found = [...root.querySelectorAll(".tlg-check")].find(entry => entry.querySelector("label")?.textContent === label)?.querySelector("input");
    assert.ok(found instanceof HTMLInputElement);
    return found;
}

function inputNamed(root: HTMLElement, label: string): HTMLInputElement {
    const found = root.querySelector(`input[aria-label="${label}"]`);
    assert.ok(found instanceof HTMLInputElement);
    return found;
}

function change(input: HTMLInputElement, update: () => void): void {
    update();
    input.dispatchEvent(syntheticEvent("change"));
}

describe("privacy settings", () => {
    it("protects every kind of name until one is unticked, and names its aliases", () => {
        const { root, latest } = editor();
        const people = WORDS.categories[SensitiveCategory.Person];
        const box = checkboxNamed(root, people);
        assert.equal(box.checked, true);
        change(box, () => { box.checked = false; });
        assert.deepEqual(latest().revealed, [SensitiveCategory.Person]);

        const prefix = inputNamed(root, WORDS.prefixOf(WORDS.categories[SensitiveCategory.Organization]));
        change(prefix, () => { prefix.value = PREFIX; });
        assert.deepEqual(latest().prefixes, { [SensitiveCategory.Organization]: PREFIX });
        change(prefix, () => { prefix.value = ""; });
        assert.deepEqual(latest().prefixes, {});
    });

    it("adds text to protect under a kind, and removes it", () => {
        const { root, latest } = editor();
        chooseOption(fieldNamed(root, WORDS.termCategory), WORDS.categories[SensitiveCategory.Organization]);
        const input = inputNamed(root, WORDS.addTerm);
        input.value = CODENAME;
        input.dispatchEvent(syntheticEvent("keydown", { key: "Enter" }));
        assert.deepEqual(latest().terms, [{ text: CODENAME, category: SensitiveCategory.Organization }]);
        assert.ok(root.textContent?.includes(CODENAME));

        root.querySelector<HTMLButtonElement>(".tlg-settings-list .tlg-button-icon")?.click();
        assert.deepEqual(latest().terms, []);
    });

    it("sets the sensitivity and the masking of the panels, and forgets the review decisions", () => {
        const { root, latest } = editor({ ...defaultPrivacyRules(), revealedTerms: [CODENAME], confirmed: [CODENAME], ignored: [CODENAME] });
        chooseOption(fieldNamed(root, WORDS.fuzzy), WORDS.fuzzyAggressive);
        assert.equal(latest().fuzzy, FuzzyLevel.Aggressive);
        const panels = checkboxNamed(root, WORDS.maskPanels);
        change(panels, () => { panels.checked = true; });
        assert.equal(latest().maskPanels, true);

        const forget = [...root.querySelectorAll("button")].find(node => node.textContent?.includes(WORDS.forgetDecisions));
        forget?.click();
        assert.deepEqual([latest().revealedTerms, latest().confirmed, latest().ignored], [[], [], []]);
        assert.equal(latest().fuzzy, FuzzyLevel.Aggressive);
    });
});
