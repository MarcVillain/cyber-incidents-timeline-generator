import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { censorBar } from "../../src/core/anonymize.js";

const CENSOR_BAR = censorBar(8);
import { measure, text } from "../../src/ui/svg.js";
import { installDom } from "../support/dom.js";

installDom();

const SIZE = 9;

describe("svg text", () => {
    it("holds every censor bar to the width the layout reserved for it", () => {
        const node = text(`Sent by ${CENSOR_BAR} to ${CENSOR_BAR}`, 0, 0, { "font-size": SIZE, "letter-spacing": 0.8 });
        const bars = [...node.querySelectorAll("tspan")];
        assert.equal(bars.length, 2);
        bars.forEach(bar => {
            assert.equal(bar.textContent, CENSOR_BAR);
            assert.equal(bar.getAttribute("textLength"), String(measure(CENSOR_BAR, SIZE)));
            assert.equal(bar.getAttribute("lengthAdjust"), "spacingAndGlyphs");
        });
        assert.equal(node.textContent, `Sent by ${CENSOR_BAR} to ${CENSOR_BAR}`);
    });

    it("writes plain text as it is", () => {
        const node = text("Plain", 0, 0);
        assert.equal(node.querySelector("tspan"), null);
        assert.equal(node.textContent, "Plain");
    });
});
