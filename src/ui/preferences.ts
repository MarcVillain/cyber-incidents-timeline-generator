import { Representation, isEnumValue } from "../core/enums.js";
import type { KeyValueStorage } from "../storage/browser-storage-store.js";
import { ThemeMode } from "./theme-mode.js";

type OptionChoices = Map<string, string>;

export function defaultPreferenceStorage(): KeyValueStorage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

function readJson(raw: string | null): unknown {
    if (raw === null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * What an analyst last chose: the representation on screen and the settings of each. Kept per browser
 * and never required, so a sandbox that refuses storage simply forgets.
 */
export class Preferences {
    private readonly storage: KeyValueStorage | null;
    private readonly key: string;
    private readonly options = new Map<Representation, OptionChoices>();
    representation: Representation | null = null;
    theme: ThemeMode | null = null;

    constructor(storage: KeyValueStorage | null, key: string) {
        this.storage = storage;
        this.key = key;
        this.load();
    }

    private read(suffix: string): string | null {
        try {
            return this.storage?.getItem(`${this.key}-${suffix}`) ?? null;
        } catch {
            return null;
        }
    }

    private write(suffix: string, value: string): void {
        try {
            this.storage?.setItem(`${this.key}-${suffix}`, value);
        } catch {
            // A refused write only means the choice is not remembered next time
        }
    }

    private load(): void {
        const view = this.read("view");
        this.representation = isEnumValue(Representation, view) ? view : null;
        const theme = this.read("theme");
        this.theme = isEnumValue(ThemeMode, theme) ? theme : null;

        const stored = readJson(this.read("options"));
        if (typeof stored !== "object" || stored === null) return;
        for (const [representation, choices] of Object.entries(stored)) {
            if (!isEnumValue(Representation, representation) || typeof choices !== "object" || choices === null) continue;
            const map: OptionChoices = new Map();
            for (const [option, value] of Object.entries(choices)) {
                if (typeof value === "string") map.set(option, value);
            }
            this.options.set(representation, map);
        }
    }

    choices(representation: Representation): ReadonlyMap<string, string> {
        return this.options.get(representation) ?? new Map();
    }

    setRepresentation(representation: Representation): void {
        this.representation = representation;
        this.write("view", representation);
    }

    setTheme(theme: ThemeMode): void {
        this.theme = theme;
        this.write("theme", theme);
    }

    setChoice(representation: Representation, option: string, value: string): void {
        const map = this.options.get(representation) ?? new Map<string, string>();
        map.set(option, value);
        this.options.set(representation, map);

        const serializable: Record<string, Record<string, string>> = {};
        this.options.forEach((choices, key) => {
            serializable[key] = Object.fromEntries(choices);
        });
        this.write("options", JSON.stringify(serializable));
    }
}
