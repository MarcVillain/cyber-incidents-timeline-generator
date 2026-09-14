import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, canonicalKeyOf, checkImpactScale, diamondVertexOf, killChainPhaseOf } from "../../src/core/catalog.js";
import { AttackTactic, DiamondVertex, KillChainPhase, NodeKind, Representation, Side, enumValues } from "../../src/core/enums.js";
import { Icon } from "../../src/core/icon.js";
import { ICON_SHAPES } from "../../src/ui/icons/shapes.js";

describe("catalog", () => {
    it("covers every value of every enum it describes", () => {
        const catalog = buildCatalog();
        assert.equal(catalog.nodeKinds.length, enumValues(NodeKind).length);
        assert.equal(catalog.sides.length, enumValues(Side).length);
        assert.equal(catalog.attackTactics.length, enumValues(AttackTactic).length);
        assert.equal(catalog.representations.length, enumValues(Representation).length);
    });

    it("only names icons that exist", () => {
        const catalog = buildCatalog();
        const named = [
            ...catalog.nodeKinds.map(entry => entry.icon),
            ...catalog.sides.map(entry => entry.icon),
            ...catalog.attackTactics.map(entry => entry.icon),
            ...catalog.representations.map(entry => entry.icon)
        ];
        const known = new Set<string>(enumValues(Icon));
        named.forEach(icon => assert.ok(known.has(icon), `${icon} is not a built in icon`));
        enumValues(Icon).forEach(icon => {
            assert.ok(ICON_SHAPES[icon].length > 0, `${icon} has no shape`);
            ICON_SHAPES[icon].forEach(path => assert.doesNotMatch(path, /undefined|NaN/, `${icon} has a broken path`));
        });
    });

    it("hands out copies that can be changed without touching the defaults", () => {
        const first = buildCatalog();
        const firstSide = first.sides[0];
        assert.ok(firstSide);
        firstSide.label = "Changed";
        assert.notEqual(buildCatalog().sides[0]?.label, "Changed");
    });

    it("takes a custom impact scale and refuses one that could not be stored", () => {
        const scale = {
            unassessed: { level: "Unrated", label: "Unrated", color: "#999999" },
            levels: [{ level: "P3", label: "Minor", color: "#1565c0" }, { level: "P1", label: "Major", color: "--brand-red" }]
        };
        assert.deepEqual(buildCatalog({ impactScale: scale }).impactScale, scale);

        assert.throws(() => checkImpactScale({ ...scale, levels: [] }), /at least one level/);
        assert.throws(() => checkImpactScale({ ...scale, levels: [...scale.levels, { level: "P1", label: "Again", color: "red" }] }), /appears twice/);
        assert.throws(() => checkImpactScale({ ...scale, levels: [{ level: "P 1", label: "Spaced", color: "red" }] }), /letters, digits/);
    });

    it("derives the kill chain phase from the tactic", () => {
        assert.equal(killChainPhaseOf(AttackTactic.InitialAccess), KillChainPhase.Delivery);
        assert.equal(killChainPhaseOf(AttackTactic.None), KillChainPhase.None);
    });

    it("lets the side win over the kind on the diamond model", () => {
        assert.equal(diamondVertexOf(NodeKind.Person, Side.Attacker), DiamondVertex.Adversary);
        assert.equal(diamondVertexOf(NodeKind.Person, Side.Victim), DiamondVertex.Victim);
        assert.equal(diamondVertexOf(NodeKind.Workstation, Side.Attacker), DiamondVertex.Infrastructure);
        assert.equal(diamondVertexOf(NodeKind.ThreatActor, Side.Victim), DiamondVertex.Victim);
    });

    it("builds a canonical key from the identifier before the name", () => {
        assert.equal(canonicalKeyOf(NodeKind.Server, " FS01.Example ", "File server"), "Server:fs01.example");
        assert.equal(canonicalKeyOf(NodeKind.Server, null, "File Server"), "Server:file server");
    });
});
