import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog } from "../../src/core/catalog.js";
import { FuzzyLevel, SensitiveCategory, Side } from "../../src/core/enums.js";
import { Icon } from "../../src/core/icon.js";
import { ThemeToken } from "../../src/core/theme-token.js";
import { loadAppCatalog, loadAppSettings } from "../../src/ui/app.js";
import { CanvasMode } from "../../src/ui/canvas-mode.js";
import { ViewPicker } from "../../src/ui/view-picker.js";
import { Preferences } from "../../src/ui/preferences.js";
import { RelabeledTimelineApi } from "../../src/ui/relabeled-api.js";
import {
    SettingsGroup, catalogEntries, defaultSettings, iconCollisions, keyFor, parseSettings, serializeSettings,
    settingsCatalog, settingsTokens
} from "../../src/ui/settings.js";
import { ColorScheme } from "../../src/ui/theme-detection.js";
import type { KeyValueStorage } from "../../src/storage/browser-storage-store.js";
import { seededService } from "../support/fixtures.js";

const PREFERENCE_KEY = "settings-test";
const ATTACKER_LABEL = "Adversary";
const RED = "#ff0000";
const WHITE = "#ffffff";
const LOCALE = "fr-FR";
const MILESTONE = { key: "first-access", label: "First access" };
const PRIVATE_TERM = "Project Falcon";
const PRIVATE_PREFIX = "Company";

class MapStorage implements KeyValueStorage {
    readonly entries = new Map<string, string>();

    getItem(key: string): string | null {
        return this.entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.entries.set(key, value);
    }
}

function customised(): ReturnType<typeof defaultSettings> {
    const settings = defaultSettings();
    settings.colors[ColorScheme.Light][ThemeToken.SideAttacker] = RED;
    settings.entries.set(SettingsGroup.Sides, new Map([[Side.Attacker, { label: ATTACKER_LABEL, icon: Icon.Skull }]]));
    settings.milestones = [MILESTONE];
    settings.canvasMode = CanvasMode.Continuous;
    settings.viewPicker = ViewPicker.Menu;
    settings.locale = LOCALE;
    settings.privacy = {
        fuzzy: FuzzyLevel.Aggressive,
        prefixes: { [SensitiveCategory.Organization]: PRIVATE_PREFIX },
        revealed: [SensitiveCategory.Hash],
        revealedTerms: [PRIVATE_TERM.toLowerCase()],
        terms: [{ text: PRIVATE_TERM, category: SensitiveCategory.Other }],
        confirmed: [PRIVATE_TERM],
        ignored: [PRIVATE_TERM],
        maskPanels: true
    };
    return settings;
}

describe("settings", () => {
    it("survives a round trip through JSON", () => {
        const settings = customised();
        assert.deepEqual(parseSettings(JSON.parse(serializeSettings(settings))), settings);
    });

    it("drops each part that does not hold up and keeps the rest", () => {
        const parsed = parseSettings({
            colors: { light: { [ThemeToken.Accent]: "red; background: url(x)", [ThemeToken.Good]: RED } },
            entries: { sides: { [Side.Attacker]: { label: ATTACKER_LABEL, icon: "not-an-icon" } }, unknownGroup: {} },
            impactScale: { unassessed: { level: "bad key!", label: "x", color: RED }, levels: [] },
            milestones: [MILESTONE, MILESTONE],
            pageSize: { width: 10, height: 10 },
            canvasMode: "sideways",
            viewPicker: "carousel",
            locale: "not a locale at all",
            durationUnits: { minutes: "m", hours: "h" },
            privacy: {
                fuzzy: "Psychic",
                prefixes: { [SensitiveCategory.Person]: PRIVATE_PREFIX, Planet: PRIVATE_PREFIX, [SensitiveCategory.Team]: " " },
                revealed: [SensitiveCategory.Email, "Planet"],
                terms: [{ text: PRIVATE_TERM, category: SensitiveCategory.Other }, { text: "", category: SensitiveCategory.Other }, { text: PRIVATE_TERM, category: "Planet" }],
                ignored: [PRIVATE_TERM, 42],
                maskPanels: "yes"
            }
        });

        assert.deepEqual(parsed.colors[ColorScheme.Light], { [ThemeToken.Good]: RED });
        assert.deepEqual(parsed.entries.get(SettingsGroup.Sides)?.get(Side.Attacker), { label: ATTACKER_LABEL, icon: null });
        assert.equal(parsed.entries.size, 1);
        assert.equal(parsed.impactScale, null);
        assert.equal(parsed.milestones, null);
        assert.equal(parsed.pageSize, null);
        assert.equal(parsed.canvasMode, null);
        assert.equal(parsed.viewPicker, null);
        assert.equal(parsed.locale, null);
        assert.equal(parsed.durationUnits, null);
        assert.deepEqual(parsed.privacy, {
            ...defaultSettings().privacy,
            prefixes: { [SensitiveCategory.Person]: PRIVATE_PREFIX },
            revealed: [SensitiveCategory.Email],
            terms: [{ text: PRIVATE_TERM, category: SensitiveCategory.Other }],
            ignored: [PRIVATE_TERM]
        });
    });

    it("keeps a stored list the catalog accepts and drops one it does not", () => {
        const defaults = buildCatalog();
        const parsed = parseSettings({
            vocabulary: {
                audiences: [...defaults.audiences, { value: "legal", label: "Legal" }],
                sides: defaults.sides.filter(entry => entry.side !== Side.Unknown),
                confidences: [{ value: "not a key", label: "Broken" }]
            }
        });
        assert.deepEqual(parsed.vocabulary.audiences?.map(entry => entry.value), ["Executive", "Technical", "legal"]);
        assert.equal(parsed.vocabulary.sides, undefined);
        assert.equal(parsed.vocabulary.confidences, undefined);
        assert.ok(settingsCatalog(parsed).audiences.some(entry => entry.value === "legal"));
    });

    it("keeps a tactic landing in a phase added in the same settings", () => {
        const defaults = buildCatalog();
        const phase = { phase: "staging", label: "Staging", icon: Icon.Archive };
        const parsed = parseSettings({
            vocabulary: {
                attackTactics: [...defaults.attackTactics, { tactic: "stage", label: "Stage", icon: Icon.Archive, attackId: null, killChainPhase: phase.phase }],
                killChainPhases: [...defaults.killChainPhases, phase]
            }
        });
        assert.equal(settingsCatalog(parsed).attackTactics.at(-1)?.killChainPhase, phase.phase);
    });

    it("reads defaults from anything that is not settings", () => {
        assert.deepEqual(parseSettings(null), defaultSettings());
        assert.deepEqual(parseSettings([1, 2]), defaultSettings());
    });

    it("builds a catalog carrying the words, icons and milestones chosen", () => {
        const catalog = settingsCatalog(customised());
        const attacker = catalog.sides.find(entry => entry.side === Side.Attacker);
        assert.equal(attacker?.label, ATTACKER_LABEL);
        assert.equal(attacker?.icon, Icon.Skull);
        assert.deepEqual(catalog.milestones, [MILESTONE]);
        assert.deepEqual(catalog.nodeKinds, buildCatalog().nodeKinds);
    });

    it("never gives an icon to a list drawn without one", () => {
        const settings = defaultSettings();
        const [first] = buildCatalog().confidences;
        assert.ok(first);
        settings.entries.set(SettingsGroup.Confidences, new Map([[first.value, { label: ATTACKER_LABEL, icon: Icon.Skull }]]));
        const [relabeled] = settingsCatalog(settings).confidences;
        assert.equal(relabeled?.label, ATTACKER_LABEL);
        assert.equal(relabeled !== undefined && "icon" in relabeled, false);
    });

    it("names the entries of a list that share an icon", () => {
        const settings = defaultSettings();
        settings.entries.set(SettingsGroup.Sides, new Map([[Side.Victim, { label: null, icon: Icon.ThreatActor }]]));
        const clashes = iconCollisions(catalogEntries(settingsCatalog(settings), SettingsGroup.Sides));
        assert.deepEqual([...clashes.keys()].sort(), [Side.Attacker, Side.Victim].sort());
        assert.equal(iconCollisions(catalogEntries(buildCatalog(), SettingsGroup.Sides)).size, 0);
    });

    it("sets a colour and the soft fill that follows it, for one scheme only", () => {
        const settings = customised();
        const light = settingsTokens(settings, ColorScheme.Light, () => WHITE);
        assert.equal(light.get(ThemeToken.SideAttacker), RED);
        assert.ok(light.get(ThemeToken.SurfaceAttacker)?.startsWith("rgb("));
        assert.equal(settingsTokens(settings, ColorScheme.Dark, () => WHITE).size, 0);
    });

    it("makes keys that are plain identifiers and never taken twice", () => {
        assert.equal(keyFor("Very High!", new Set()), "very-high");
        assert.equal(keyFor("High", new Set(["high"])), "high-2");
        assert.equal(keyFor("!!!", new Set()), "entry");
    });

    it("relabels a catalog it does not own and leaves writes to its owner", async () => {
        const { service, incident } = await seededService();
        const api = new RelabeledTimelineApi(service, customised);

        const attacker = (await api.getCatalog()).sides.find(entry => entry.side === Side.Attacker);
        assert.equal(attacker?.label, ATTACKER_LABEL);
        assert.equal((await api.getDiagram(incident.id)).catalog.sides.find(entry => entry.side === Side.Attacker)?.icon, Icon.Skull);
        assert.deepEqual((await api.getCatalog()).impactScale, (await service.getCatalog()).impactScale);
        assert.deepEqual((await api.getCatalog()).milestones, []);

        await api.updateIncident(incident.id, { title: ATTACKER_LABEL });
        assert.equal((await service.getIncident(incident.id)).title, ATTACKER_LABEL);
    });

    it("is kept with the preferences and read back by a host before mounting", () => {
        const storage = new MapStorage();
        new Preferences(storage, PREFERENCE_KEY).setSettings(customised());

        assert.deepEqual(new Preferences(storage, PREFERENCE_KEY).settings, customised());
        assert.deepEqual(loadAppSettings(storage, PREFERENCE_KEY), customised());
        assert.equal(loadAppCatalog(storage, PREFERENCE_KEY).sides.find(entry => entry.side === Side.Attacker)?.label, ATTACKER_LABEL);
    });
});
