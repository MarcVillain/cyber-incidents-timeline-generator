import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CENSOR_BAR, Masker, defaultPrivacyRules, foldTerm, maskDiagram, type PrivacyRules } from "../../src/core/anonymize.js";
import { Disclosure, FuzzyLevel, NodeKind, SensitiveCategory, Side } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { INCIDENT_TITLE, createService, person } from "../support/fixtures.js";

const PERSON = "Alice Martin";
const COMPANY = "Contoso Bank";
const COMPANY_TYPO = "Contosso Bank";
const COMPANY_TWO_TYPOS = "Kontosso Bank";
const COMPANY_GLUED = "ContosoBank";
const COMPANY_ACCENTED = "Contöso Bank";
const SENTINEL = "Wolfenstein";
const STEP_AT = "2026-01-12T08:00:00";
const PERSON_ALIAS = "Person-1";
const COMPANY_ALIAS = "Org-1";

async function diagramWith(names: { person?: string; company?: string; description?: string }): Promise<Diagram> {
    const { service } = createService();
    const incident = await service.createIncident({ title: INCIDENT_TITLE });
    if (names.person) await service.createNode(incident.id, person(names.person));
    if (names.company) await service.createNode(incident.id, { name: names.company, kind: NodeKind.Company, side: Side.Victim });
    await service.createStep(incident.id, { title: "Step", timestamp: STEP_AT, description: names.description ?? null });
    return service.getDiagram(incident.id);
}

function rules(patch: Partial<PrivacyRules> = {}): PrivacyRules {
    return { ...defaultPrivacyRules(), ...patch };
}

function masked(diagram: Diagram, text: string, patch: Partial<PrivacyRules> = {}, mode = Disclosure.Anonymized): string {
    return new Masker(diagram, rules(patch)).mask(text, mode);
}

describe("Masker", () => {
    it("gives a name the same alias in every field, and catches the parts of a person's name", async () => {
        const diagram = await diagramWith({ person: PERSON, description: `${PERSON} reset the password` });
        const masker = new Masker(diagram, rules());
        const copy = maskDiagram(diagram, masker, Disclosure.Anonymized);
        assert.equal(copy.nodes[0]?.name, PERSON_ALIAS);
        assert.equal(copy.steps[0]?.description, `${PERSON_ALIAS} reset the password`);
        assert.equal(masker.mask("Martin called the desk", Disclosure.Anonymized), `${PERSON_ALIAS} called the desk`);
    });

    it("numbers aliases in the order of the diagram, whatever is masked first", async () => {
        const diagram = await diagramWith({ person: PERSON, company: COMPANY });
        const first = new Masker(diagram, rules());
        const second = new Masker(diagram, rules());
        assert.equal(first.mask(COMPANY, Disclosure.Anonymized), second.mask(COMPANY, Disclosure.Anonymized));
        assert.equal(second.mask(`${COMPANY} and ${PERSON}`, Disclosure.Anonymized), `${COMPANY_ALIAS} and ${PERSON_ALIAS}`);
    });

    it("detects addresses, hashes, accounts and hosts without being told about them", async () => {
        const diagram = await diagramWith({});
        const cases: readonly [string, string][] = [
            ["Beacon to 10.0.0.12", "Beacon to IP-1"],
            ["Beacon to fe80::1ff:fe23:4567:890a", "Beacon to IP-1"],
            ["Mail from j.doe@example.org", "Mail from Email-1"],
            ["Payload at https://evil.example.net/a?b=1.", "Payload at URL-1."],
            ["Hash 44d88612fea8a8f36de82e1278abb02f", "Hash Hash-1"],
            ["Logon as CORP\\jdoe", "Logon as User-1"],
            ["Resolved dc01.corp.example.com", "Resolved Host-1"],
            ["Resolved example.com", "Resolved Domain-1"]
        ];
        cases.forEach(([input, expected]) => assert.equal(masked(diagram, input), expected));
        assert.equal(masked(diagram, "Opened invoice.pdf at 10:30:00"), "Opened invoice.pdf at 10:30:00");
    });

    it("censors every name with a bar of one length, whatever the length of the name", async () => {
        const diagram = await diagramWith({ person: "Bo Li", company: "Contoso International Holdings" });
        const text = masked(diagram, "Bo Li of Contoso International Holdings", {}, Disclosure.Censored);
        assert.equal(text, `${CENSOR_BAR} of ${CENSOR_BAR}`);
    });

    it("leaves revealed kinds and names as written, and keeps a protected name inside a revealed one", async () => {
        const diagram = await diagramWith({ person: PERSON, company: "Acme" });
        assert.equal(masked(diagram, `${PERSON} at Acme`, { revealed: [SensitiveCategory.Organization] }), `${PERSON_ALIAS} at Acme`);
        assert.equal(masked(diagram, `${PERSON} at Acme`, { revealedTerms: [foldTerm(PERSON)] }), `${PERSON} at ${COMPANY_ALIAS}`);
        assert.equal(masked(diagram, "Visit acme.com", { revealed: [SensitiveCategory.Domain] }), `Visit ${COMPANY_ALIAS}.com`);
    });

    it("widens the match with the fuzzy level", async () => {
        const diagram = await diagramWith({ company: COMPANY });
        const exact = { fuzzy: FuzzyLevel.Exact };
        assert.equal(masked(diagram, "contoso-bank", exact), COMPANY_ALIAS);
        assert.equal(masked(diagram, COMPANY_TYPO, exact), COMPANY_TYPO);
        [COMPANY_TYPO, COMPANY_GLUED, COMPANY_ACCENTED].forEach(variant => assert.equal(masked(diagram, variant), COMPANY_ALIAS));
        assert.equal(masked(diagram, COMPANY_TWO_TYPOS), COMPANY_TWO_TYPOS);
        assert.equal(masked(diagram, COMPANY_TWO_TYPOS, { fuzzy: FuzzyLevel.Aggressive }), COMPANY_ALIAS);
    });

    it("lists near misses for review, and follows the decision taken on them", async () => {
        const diagram = await diagramWith({ company: COMPANY, description: `Wire sent by ${COMPANY_TWO_TYPOS}` });
        const misses = new Masker(diagram, rules()).nearMisses;
        assert.deepEqual(misses.map(miss => [miss.text, miss.category]), [[COMPANY_TWO_TYPOS, SensitiveCategory.Organization]]);

        assert.equal(new Masker(diagram, rules({ ignored: [COMPANY_TWO_TYPOS] })).nearMisses.length, 0);
        const confirmed = new Masker(diagram, rules({ confirmed: [COMPANY_TWO_TYPOS] }));
        assert.equal(confirmed.nearMisses.length, 0);
        assert.equal(confirmed.mask(COMPANY_TWO_TYPOS, Disclosure.Anonymized), COMPANY_ALIAS);
    });

    it("protects text added by hand and uses the prefixes chosen", async () => {
        const diagram = await diagramWith({ company: COMPANY });
        const patch = { terms: [{ text: "Project Falcon", category: SensitiveCategory.Other }], prefixes: { [SensitiveCategory.Organization]: "Company" } };
        assert.equal(masked(diagram, `${COMPANY} runs Project Falcon`, patch), "Company-1 runs Redacted-1");
    });

    it("lists the names it protects, revealed or not", async () => {
        const diagram = await diagramWith({ person: PERSON, company: COMPANY });
        const listed = new Masker(diagram, rules({ revealed: [SensitiveCategory.Person] })).protectedTerms;
        assert.deepEqual(listed.map(term => [term.text, term.revealed]), [[PERSON, true], [COMPANY, false]]);
    });
});

describe("maskDiagram", () => {
    it("masks every free text field and keeps everything else", async () => {
        const { service } = createService();
        const incident = await service.createIncident({
            title: `${SENTINEL} breach`, referenceId: SENTINEL, scope: SENTINEL, classifications: [SENTINEL], externalId: SENTINEL, metadata: { owner: SENTINEL }
        });
        const node = await service.createNode(incident.id, {
            name: SENTINEL, kind: NodeKind.Company, side: Side.Victim, description: SENTINEL, identifier: SENTINEL, role: SENTINEL, externalId: SENTINEL, metadata: { owner: SENTINEL }
        });
        const other = await service.createNode(incident.id, person(PERSON));
        const step = await service.createStep(incident.id, {
            title: SENTINEL, timestamp: STEP_AT, description: SENTINEL, evidenceSource: SENTINEL, tags: [SENTINEL], externalId: SENTINEL, metadata: { owner: SENTINEL }
        });
        await service.createLink(incident.id, { sourceNodeId: node.id, targetNodeId: other.id, label: SENTINEL, stepId: step.id, metadata: { owner: SENTINEL } });
        const diagram = await service.getDiagram(incident.id);

        const masker = new Masker(diagram, rules());
        for (const mode of [Disclosure.Anonymized, Disclosure.Censored]) {
            const copy = maskDiagram(diagram, masker, mode);
            assert.ok(!JSON.stringify(copy).includes(SENTINEL), `${mode} leaks the name`);
            assert.deepEqual(copy.nodes.map(entry => entry.id), diagram.nodes.map(entry => entry.id));
            assert.equal(copy.steps[0]?.timestamp, STEP_AT);
        }
        assert.equal(maskDiagram(diagram, masker, Disclosure.Full), diagram);
        assert.ok(JSON.stringify(diagram).includes(SENTINEL));
    });
});
