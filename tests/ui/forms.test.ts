import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { select, tagChips } from "../../src/ui/forms.js";
import { IconSet } from "../../src/ui/icons/icon-set.js";
import { DEFAULT_STRINGS } from "../../src/ui/strings.js";
import { installDom, syntheticEvent } from "../support/dom.js";

installDom();

const SHORT = ["Alpha", "Bravo", "Charlie"];
const LONG = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India"];
const NOTHING_LIKE_IT = "zzz";
const RANSOMWARE = "ransomware";
const PHISHING = "phishing";
const NEW_TAG = "lateral movement";

function choicesOf(labels: readonly string[]): { value: string; label: string }[] {
    return labels.map(label => ({ value: label.toLowerCase(), label }));
}

function searchBox(root: HTMLElement): HTMLInputElement {
    const input = root.querySelector<HTMLInputElement>(".tlg-combo-search");
    assert.ok(input);
    return input;
}

function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(syntheticEvent("input"));
}

function press(input: HTMLInputElement, key: string): void {
    input.dispatchEvent(syntheticEvent("keydown", { key }));
}

function optionsOf(root: HTMLElement): string[] {
    return [...root.querySelectorAll(".tlg-combo-option")].map(option => option.textContent ?? "");
}

describe("a picker over a short list", () => {
    it("looks like every other picker, without a search box", () => {
        const control = select("alpha", choicesOf(SHORT), () => undefined);
        assert.equal(control.className, "tlg-combo");
        assert.equal(control.querySelector(".tlg-combo-search"), null);
        assert.deepEqual(optionsOf(control), SHORT);
    });
});

describe("a picker over a long list", () => {
    it("can be searched, and reports the choice made", () => {
        let chosen: string | null = null;
        const control = select("alpha", choicesOf(LONG), value => { chosen = value; });
        assert.equal(control.className, "tlg-combo");

        const toggle = control.querySelector("button");
        assert.ok(toggle);
        assert.equal(toggle.textContent, "Alpha");
        toggle.dispatchEvent(syntheticEvent("click"));
        assert.equal(toggle.getAttribute("aria-expanded"), "true");

        const search = searchBox(control);
        type(search, "hot");
        assert.deepEqual(optionsOf(control), ["Hotel"]);

        press(search, "Enter");
        assert.equal(chosen, "hotel");
        assert.equal(toggle.textContent, "Hotel");
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
    });

    it("says so when nothing matches", () => {
        const control = select("alpha", choicesOf(LONG), () => undefined);
        type(searchBox(control), NOTHING_LIKE_IT);
        assert.deepEqual(optionsOf(control), []);
        assert.equal(control.querySelector(".tlg-combo-empty")?.textContent, DEFAULT_STRINGS.forms.noMatch);
    });

    it("offers the empty choice when the field may hold nothing", () => {
        const control = select<string>(null, choicesOf(LONG), () => undefined, { allowEmpty: true, emptyLabel: DEFAULT_STRINGS.forms.none });
        assert.equal(control.querySelector("button")?.textContent, DEFAULT_STRINGS.forms.none);
        assert.equal(optionsOf(control).length, LONG.length + 1);
    });
});

describe("tags", () => {
    it("offers what the timeline already uses, without what is already on the record", () => {
        const control = tagChips([RANSOMWARE], [RANSOMWARE, PHISHING], () => undefined, new IconSet());
        const search = searchBox(control);
        search.dispatchEvent(syntheticEvent("focus"));
        assert.deepEqual(optionsOf(control), [], "nothing is offered before a letter is typed");

        type(search, "p");
        assert.deepEqual(optionsOf(control), [PHISHING]);
    });

    it("adds a tag that was offered, and one nobody has written yet", () => {
        const saved: string[][] = [];
        const control = tagChips([RANSOMWARE], [RANSOMWARE, PHISHING], values => saved.push(values), new IconSet());

        const search = searchBox(control);
        type(search, "phi");
        press(search, "ArrowDown");
        press(search, "Enter");
        assert.deepEqual(saved.at(-1), [RANSOMWARE, PHISHING]);

        const again = searchBox(control);
        type(again, NEW_TAG);
        press(again, "Enter");
        assert.deepEqual(saved.at(-1), [RANSOMWARE, PHISHING, NEW_TAG]);
    });

    it("removes a tag from its chip", () => {
        const saved: string[][] = [];
        const control = tagChips([RANSOMWARE, PHISHING], [], values => saved.push(values), new IconSet());
        const remove = control.querySelector<HTMLButtonElement>(".tlg-chip-remove");
        assert.ok(remove);
        remove.dispatchEvent(syntheticEvent("click"));
        assert.deepEqual(saved.at(-1), [PHISHING]);
    });
});
