import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDrop } from "../../src/ui/rail-drag.js";

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
