import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DropIntent, canDrop, intentAt, targetFor } from "../../src/ui/rail-drag.js";

// A company holding a clerk who holds a laptop, and a server standing on its own.
const NODES = [
    { id: 1, parentId: null },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 2 },
    { id: 4, parentId: null }
];

describe("where a record may be dropped", () => {
    it("takes a loose record into a group", () => {
        assert.equal(canDrop(NODES, 4, 1), true);
    });

    it("takes a record out of its group", () => {
        assert.equal(canDrop(NODES, 2, null), true);
    });

    it("moves a record from one group to another", () => {
        assert.equal(canDrop(NODES, 3, 1), true);
    });

    it("refuses to place a record inside itself", () => {
        assert.equal(canDrop(NODES, 1, 1), false);
    });

    it("refuses to place a record inside something it already holds", () => {
        assert.equal(canDrop(NODES, 1, 2), false, "a company cannot be filed under its own clerk");
        assert.equal(canDrop(NODES, 1, 3), false, "nor under the laptop of its own clerk");
    });

    it("refuses a drop that lands where the record already is", () => {
        assert.equal(canDrop(NODES, 2, 1), false);
        assert.equal(canDrop(NODES, 4, null), false);
    });

    it("refuses to move a record the diagram does not hold", () => {
        assert.equal(canDrop(NODES, 99, 1), false);
    });
});

describe("what a drop between rows means", () => {
    const row = { top: 100, height: 40 };

    it("puts the record inside the row it lands in the middle of", () => {
        assert.equal(intentAt(120, row), DropIntent.Inside);
    });

    it("puts the record beside the row it lands at the top or bottom of", () => {
        assert.equal(intentAt(102, row), DropIntent.Before);
        assert.equal(intentAt(138, row), DropIntent.After);
    });

    it("leaves the middle the larger target, because inside is the commoner answer", () => {
        const inside = [...Array(row.height).keys()].filter(offset => intentAt(row.top + offset, row) === DropIntent.Inside);
        assert.ok(inside.length > row.height / 2, `only ${inside.length} of ${row.height} pixels drop inside`);
    });

    it("keeps an edge a person can hit on a row too short to divide in three", () => {
        const thin = { top: 0, height: 9 };
        assert.equal(intentAt(1, thin), DropIntent.Before);
        assert.equal(intentAt(8, thin), DropIntent.After);
    });

    it("joins what a row belongs to when dropped beside it, and the row itself when dropped into it", () => {
        const member = { id: 2, parentId: 1 };
        assert.equal(targetFor(DropIntent.Inside, member), 2);
        assert.equal(targetFor(DropIntent.Before, member), 1);
        assert.equal(targetFor(DropIntent.After, member), 1);
    });

    it("sends a record dropped beside a loose row to the top level", () => {
        assert.equal(targetFor(DropIntent.Before, { id: 4, parentId: null }), null);
    });
});
