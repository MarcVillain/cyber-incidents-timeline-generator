// The browser entry point: the domain, the stores that run in a page, the HTTP client and the workspace.
// Server pieces live under "cyber-incidents-timeline-generator/server" so a browser bundle never pulls in Node modules.

export * from "./core/index.js";
export * from "./storage/memory-store.js";
export * from "./storage/browser-storage-store.js";
export * from "./storage/http-api.js";
export * from "./storage/sourced-store.js";
export { mountTimeline, CanvasMode, ThemeMode, type TimelineHandle, type TimelineOptions, type TimelineState } from "./ui/workspace.js";
export { mountTimelineApp, type TimelineAppHandle, type TimelineAppOptions } from "./ui/app.js";
export { IncidentFieldType, checkIncidentFields, fieldValue, withFieldValues, type IncidentFieldChoice, type IncidentFieldDef, type IncidentFieldValue } from "./ui/incident-fields.js";
export { ColorScheme, detectPageTheme, watchPageTheme, type ThemeDetector } from "./ui/theme-detection.js";
export {
    DEFAULT_STRINGS, buildStrings,
    type AppStrings, type DeckStrings, type FormStrings, type InspectorStrings, type NarrativeStrings,
    type OptionStrings, type RailStrings, type SceneStrings, type SlideStrings, type Strings,
    type StringsOverride, type WorkspaceStrings
} from "./ui/strings.js";
export { Access, RecordAction, type TimelinePermissions } from "./ui/panels.js";
export { ExportFormat, exportDocumentFile, standaloneHtml, serialize } from "./ui/export.js";
export { IconSet } from "./ui/icons/icon-set.js";
export { DiagramStore, StoreChange, type TimelineStep, type Selection, type StepFilters } from "./ui/diagram-store.js";
export { Palette, defaultTokenResolver, elementTokenResolver, type TokenResolver } from "./ui/theme.js";
export { PAGE_WIDTH, PAGE_HEIGHT, DEFAULT_PAGE_SIZE, type PageSize } from "./ui/viewport.js";
export { CONTENT, contentArea, pageSize, withPageSize, frame, placeholder, sideLegend, LegendStroke, type LegendEntry } from "./ui/chrome.js";
export { defaultSlideHeader, type SlideDetail, type SlideHeader, type SlideHeaderContext, type SlideHeaderCustomizer, type SlideImpact } from "./ui/slide-header.js";
export * from "./ui/renderers/index.js";
