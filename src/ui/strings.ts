// Every word the interface says, in one place, so a host can hand the workspace its own language.
// The catalog carries the vocabulary of the domain; this carries the chrome around it.

export interface WorkspaceStrings {
    representations: string;
    records: string;
    recordDetails: string;
    filterRecords: string;
    milestonesOnly: string;
    audience: string;
    audienceEverything: string;
    audienceExecutive: string;
    audienceTechnical: string;
    add: string;
    addFirstRecord: string;
    emptyTitle: string;
    emptyHint: string;
    export: string;
    exportPng: string;
    exportSvg: string;
    exportHtml: string;
    exportPrint: string;
    exportDocument: string;
    zoomIn: string;
    zoomOut: string;
    fitToScreen: string;
    previousSlide: string;
    nextSlide: string;
    slideCounter(page: number, count: number): string;
    undo: string;
    redo: string;
    nothingToUndo: string;
    nothingToRedo: string;
    themeAuto: string;
    themeLight: string;
    themeDark: string;
    recordLabel: string;
    stepLabel: string;
    linkLabel: string;
    undoChange(change: string): string;
    redoChange(change: string): string;
    undone(change: string): string;
    redone(change: string): string;
    undoExpired: string;
    redoExpired: string;
    loadFailed: string;
    saveFailed: string;
    createFailed: string;
    deleteFailed: string;
    exportFailed: string;
    placementFailed: string;
    noRenderer: string;
}

export interface AppStrings {
    title: string;
    incidents: string;
    newIncident: string;
    importDocument: string;
    imported(records: number, steps: number): string;
    openIncident: string;
    details: string;
    incidentDetails: string;
    noIncidentsTitle: string;
    noIncidentsBody: string;
    noIncidentsHint: string;
    noMatchTitle: string;
    incidentTitle: string;
    incidentTitleHint: string;
    reference: string;
    referenceHint: string;
    impact: string;
    scope: string;
    scopeHint: string;
    classifications: string;
    save: string;
    cancel: string;
    delete: string;
    deleteIncident: string;
    deleteWarning: string;
    keepIt: string;
    requestFailed: string;
    themeAuto: string;
    themeLight: string;
    themeDark: string;
}

export interface RailStrings {
    parties: string;
    partiesHint: string;
    resources: string;
    groups: string;
    steps: string;
    relationships: string;
    step: string;
    relationship: string;
    whatHappened: string;
    newStep: string;
    needTwoRecords: string;
    keepIt: string;
}

export interface InspectorStrings {
    close: string;
    delete: string;
    keepIt: string;
    addRecord: string;
    name: string;
    kind: string;
    side: string;
    belongsTo: string;
    identifier: string;
    identifierHint: string;
    role: string;
    roleHint: string;
    criticality: string;
    compromised: string;
    notes: string;
    whatHappened: string;
    when: string;
    until: string;
    outcome: string;
    performedBy: string;
    performedOn: string;
    nobodyRecorded: string;
    nothingRecorded: string;
    attackTactic: string;
    technique: string;
    techniqueHint: string;
    responsePhase: string;
    severity: string;
    confidence: string;
    audience: string;
    evidenceSource: string;
    evidenceSourceHint: string;
    milestone: string;
    namedMilestone: string;
    tags: string;
    alsoInvolved: string;
    relationship: string;
    from: string;
    to: string;
    label: string;
    labelHint: string;
    none: string;
    nothing: string;
}

export interface FormStrings {
    none: string;
    tagsHint: string;
    timeHint: string;
}

export interface DeckStrings {
    previous: string;
    next: string;
    print: string;
}

export interface SlideStrings {
    impactSuffix: string;
    incident: string;
    whatHappened: string;
    response: string;
    recordTrail: string;
    patientZero: string;
}

/** The settings the built in representations offer from the toolbar. */
export interface OptionStrings {
    density: string;
    densityComfortable: string;
    densityCompact: string;
    densityStacked: string;
    densityRows: string;
    detail: string;
    detailDetailed: string;
    layout: string;
    layoutBands: string;
    layoutNetwork: string;
    labels: string;
    labelsShown: string;
    labelsHidden: string;
    compare: string;
    compareBreakdown: string;
    compareAgainstTarget: string;
    compareAgainstHistory: string;
    compareCauses: string;
}

/** What the representations write on the scene itself: legends, column headings and empty states. */
export interface SceneStrings {
    emptyTimelineTitle: string;
    emptyTimelineHint: string;
    emptyGraphTitle: string;
    emptyGraphHint: string;
    emptySwimlanesTitle: string;
    emptySwimlanesHint: string;
    emptyDuelTitle: string;
    emptyDuelHint: string;
    emptyKillChainTitle: string;
    emptyKillChainHint: string;
    emptyFlowTitle: string;
    emptyFlowHint: string;
    emptyMatrixTitle: string;
    emptyMatrixHint: string;
    emptyEvidenceTitle: string;
    emptyEvidenceHint: string;
    emptyBlastRadiusTitle: string;
    emptyBlastRadiusHint: string;
    emptyDiamondTitle: string;
    emptyDiamondHint: string;
    noPartyRecorded: string;
    noSourceRecorded: string;
    nothingRecorded: string;
    when: string;
    who: string;
    whatHappened: string;
    onWhat: string;
    stage: string;
    action: string;
    assetTouched: string;
    ledTo: string;
    observed: string;
    adversary: string;
    capability: string;
    infrastructure: string;
    victim: string;
    dwellTime: string;
    timeUndetected: string;
    beforeAnyoneKnew: string;
    timeToDetect: string;
    timeToContain: string;
    timeToRecover: string;
    detect: string;
    contain: string;
    eradicate: string;
    recover: string;
    incidentSpan: string;
    responseSpan: string;
    notEnoughDates: string;
    noSequence: string;
    objective: string;
    objectiveCaption: string;
    usually: string;
    noObjective: string;
    noHistory: string;
    noLostTime: string;
    recordAttackAndResponse: string;
    nothingNoticed: string;
    incidentSpanHint: string;
    responseSpanHint: string;
    investigationsClosed: string;
    investigationsFailed(count: number): string;
    unseenRange(from: string, to: string): string;
    benchmarkCaption(count: number, scope: string | null): string;
    compromised: string;
    reachedNotCompromised: string;
    untouched: string;
    unattributed: string;
    somethingRecorded: string;
    recordedRelationship: string;
    investigations: string;
    knownAndWorked: string;
}

/** The written account of the narrative slide, assembled from the records rather than written by hand. */
export interface NarrativeStrings {
    nothingRecorded: string;
    firstAction(title: string, moment: string, parties: string): string;
    byAgainst(source: string, target: string): string;
    by(source: string): string;
    against(target: string): string;
    attackerActions(count: number, tactics: readonly string[]): string;
    dwell(duration: string): string;
    responseActions(count: number, phases: readonly string[]): string;
    compromisedRecords(count: number, named: readonly string[], more: boolean): string;
    stoppedAttempts(count: number): string;
}

export interface Strings {
    workspace: WorkspaceStrings;
    app: AppStrings;
    rail: RailStrings;
    inspector: InspectorStrings;
    forms: FormStrings;
    deck: DeckStrings;
    slide: SlideStrings;
    options: OptionStrings;
    scene: SceneStrings;
    narrative: NarrativeStrings;
}

/** A host replaces whole groups or single entries; anything left out keeps the English below. */
export type StringsOverride = { [Group in keyof Strings]?: Partial<Strings[Group]> };

export const DEFAULT_STRINGS: Strings = {
    workspace: {
        representations: "Representations",
        records: "Records",
        recordDetails: "Record details",
        filterRecords: "Filter records",
        milestonesOnly: "Milestones only",
        audience: "Audience",
        audienceEverything: "Everything",
        audienceExecutive: "Executive",
        audienceTechnical: "Technical",
        add: "Add",
        addFirstRecord: "Add the first record",
        emptyTitle: "No incident diagram yet",
        emptyHint: "Add the parties, the machines they touched and what happened, and every view builds itself.",
        export: "Export",
        exportPng: "PNG, one file per slide",
        exportSvg: "SVG, one file per slide",
        exportHtml: "Interactive HTML",
        exportPrint: "Print or save as PDF",
        exportDocument: "Timeline file, to open elsewhere",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fitToScreen: "Fit to screen",
        previousSlide: "Previous slide",
        nextSlide: "Next slide",
        slideCounter: (page, count) => `Slide ${page} of ${count}`,
        undo: "Undo",
        redo: "Redo",
        nothingToUndo: "Nothing to undo",
        nothingToRedo: "Nothing to redo",
        themeAuto: "Theme follows the page, switch to light",
        themeLight: "Light theme, switch to dark",
        themeDark: "Dark theme, switch to following the page",
        recordLabel: "record",
        stepLabel: "step",
        linkLabel: "link",
        undoChange: change => `Undo ${change}`,
        redoChange: change => `Redo ${change}`,
        undone: change => `Undid the ${change} change.`,
        redone: change => `Redid the ${change} change.`,
        undoExpired: "That change can no longer be undone.",
        redoExpired: "That change can no longer be redone.",
        loadFailed: "The incident diagram could not be loaded.",
        saveFailed: "The change could not be saved, reloading the diagram.",
        createFailed: "The record could not be created.",
        deleteFailed: "The record could not be deleted.",
        exportFailed: "The export could not be produced.",
        placementFailed: "The new position could not be saved.",
        noRenderer: "No renderer is available."
    },
    app: {
        title: "Incident timelines",
        incidents: "Incidents",
        newIncident: "New incident",
        importDocument: "Open a timeline file",
        imported: (records, steps) => `Imported ${records} record(s) and ${steps} step(s).`,
        openIncident: "Open the incident",
        details: "Details",
        incidentDetails: "Incident details",
        noIncidentsTitle: "No incidents yet",
        noIncidentsBody: "Incidents appear here once they are recorded.",
        noIncidentsHint: "Give the incident a title to start its timeline. Everything else can be filled in later.",
        noMatchTitle: "No incidents to show",
        incidentTitle: "Title",
        incidentTitleHint: "What happened, in a few words",
        reference: "Reference",
        referenceHint: "Ticket or case number",
        impact: "Impact",
        scope: "Scope",
        scopeHint: "Organisation or business unit",
        classifications: "Classifications",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        deleteIncident: "Delete the incident and its timeline",
        deleteWarning: "This cannot be undone.",
        keepIt: "Keep it",
        requestFailed: "The request could not be completed.",
        themeAuto: "Theme follows the system, switch to light",
        themeLight: "Light theme, switch to dark",
        themeDark: "Dark theme, switch to following the system"
    },
    rail: {
        parties: "Parties",
        partiesHint: "People and organisations",
        resources: "Resources",
        groups: "Groups",
        steps: "Steps",
        relationships: "Relationships",
        step: "Step",
        relationship: "Relationship",
        whatHappened: "What happened",
        newStep: "New step",
        needTwoRecords: "Add at least two records before linking them.",
        keepIt: "Keep it"
    },
    inspector: {
        close: "Close",
        delete: "Delete",
        keepIt: "Keep it",
        addRecord: "Add a record",
        name: "Name",
        kind: "Kind",
        side: "Side",
        belongsTo: "Belongs to",
        identifier: "Identifier",
        identifierHint: "Hostname, address, hash",
        role: "Role",
        roleHint: "What it is for",
        criticality: "Criticality",
        compromised: "Compromised",
        notes: "Notes",
        whatHappened: "What happened",
        when: "When",
        until: "Until",
        outcome: "Outcome",
        performedBy: "Performed by",
        performedOn: "Performed on",
        nobodyRecorded: "Nobody recorded",
        nothingRecorded: "Nothing recorded",
        attackTactic: "ATT&CK tactic",
        technique: "Technique",
        techniqueHint: "T1566.001",
        responsePhase: "Response phase",
        severity: "Severity",
        confidence: "Confidence",
        audience: "Audience",
        evidenceSource: "Evidence source",
        evidenceSourceHint: "EDR, SIEM, user report",
        milestone: "Milestone",
        namedMilestone: "Named milestone",
        tags: "Tags",
        alsoInvolved: "Also involved",
        relationship: "Relationship",
        from: "From",
        to: "To",
        label: "Label",
        labelHint: "Wording on the edge",
        none: "None",
        nothing: "Nothing"
    },
    forms: {
        none: "None",
        tagsHint: "Comma separated",
        timeHint: "Time, may be left empty"
    },
    deck: {
        previous: "Previous",
        next: "Next",
        print: "Print"
    },
    slide: {
        impactSuffix: "IMPACT",
        incident: "INCIDENT",
        whatHappened: "WHAT HAPPENED",
        response: "RESPONSE",
        recordTrail: "RECORD TRAIL",
        patientZero: "PATIENT ZERO"
    },
    options: {
        density: "Density",
        densityComfortable: "Comfortable",
        densityCompact: "Compact",
        densityStacked: "Stacked",
        densityRows: "Rows",
        detail: "Detail",
        detailDetailed: "Detailed",
        layout: "Layout",
        layoutBands: "Bands",
        layoutNetwork: "Network",
        labels: "Labels",
        labelsShown: "Labels shown",
        labelsHidden: "Labels hidden",
        compare: "Compare",
        compareBreakdown: "Where the time went",
        compareAgainstTarget: "Against target",
        compareAgainstHistory: "Against our history",
        compareCauses: "What let it run"
    },
    scene: {
        emptyTimelineTitle: "No steps recorded yet",
        emptyTimelineHint: "Add what happened and the timeline draws itself.",
        emptyGraphTitle: "Nothing to connect yet",
        emptyGraphHint: "Add the parties and the machines they own to build the map.",
        emptySwimlanesTitle: "No steps recorded yet",
        emptySwimlanesHint: "Say who did what and the lanes appear.",
        emptyDuelTitle: "No attacker or defender steps yet",
        emptyDuelHint: "Mark a step as an attacker or a defender action to build this view.",
        emptyKillChainTitle: "No attacker steps classified yet",
        emptyKillChainHint: "Give a step an ATT&CK tactic and it lands in its phase.",
        emptyFlowTitle: "No actions recorded yet",
        emptyFlowHint: "Each step becomes an action, and the assets it touched hang below it.",
        emptyMatrixTitle: "No techniques recorded yet",
        emptyMatrixHint: "Give a step an ATT&CK tactic and a technique to fill the matrix.",
        emptyEvidenceTitle: "No evidence recorded yet",
        emptyEvidenceHint: "Name the source a step came from, such as EDR or a user report.",
        emptyBlastRadiusTitle: "No starting point yet",
        emptyBlastRadiusHint: "Mark what the attacker reached first, and the spread draws from there.",
        emptyDiamondTitle: "Nothing to place yet",
        emptyDiamondHint: "Add the parties and the tooling, and each one lands on its vertex.",
        noPartyRecorded: "No party recorded",
        noSourceRecorded: "No source recorded",
        nothingRecorded: "Nothing recorded",
        when: "When",
        who: "Who",
        whatHappened: "What happened",
        onWhat: "On what",
        stage: "Stage",
        action: "Action",
        assetTouched: "Asset touched",
        ledTo: "Led to",
        observed: "Observed",
        adversary: "Adversary",
        capability: "Capability",
        infrastructure: "Infrastructure",
        victim: "Victim",
        dwellTime: "Dwell time",
        timeUndetected: "Time undetected",
        beforeAnyoneKnew: "Before anyone knew",
        timeToDetect: "Time to detect",
        timeToContain: "Time to contain",
        timeToRecover: "Time to recover",
        detect: "Detect",
        contain: "Contain",
        eradicate: "Eradicate",
        recover: "Recover",
        incidentSpan: "Incident span",
        responseSpan: "Response span",
        notEnoughDates: "Not enough dates to measure",
        noSequence: "The recorded dates do not form a sequence yet.",
        objective: "Objective",
        objectiveCaption: "Against a default objective, until this team records targets of its own",
        usually: "Usually",
        noObjective: "No objective applies until the response has a detection recorded.",
        noHistory: "No earlier incident of this scope has a detection step to compare against.",
        noLostTime: "Nothing in the record is marked as failed, so there is no lost time to attribute.",
        recordAttackAndResponse: "Record when the attacker acted and when the response noticed.",
        nothingNoticed: "nothing was ever noticed",
        incidentSpanHint: "first attacker action to the last thing the response did",
        responseSpanHint: "from the first time anyone noticed",
        investigationsClosed: "every one of them closed out",
        investigationsFailed: count => `${count} of them left the threat in place`,
        unseenRange: (from, to) => `${from} to ${to}`,
        benchmarkCaption: (count, scope) => `Middle of the last ${count} incident(s)${scope ? ` of ${scope}` : ""}`,
        compromised: "Compromised",
        reachedNotCompromised: "Reached, not compromised",
        untouched: "Untouched",
        unattributed: "Unattributed",
        somethingRecorded: "Something recorded",
        recordedRelationship: "Recorded relationship",
        investigations: "Investigations",
        knownAndWorked: "Known and being worked"
    },
    narrative: {
        nothingRecorded: "Nothing has been recorded for this incident yet.",
        firstAction: (title, moment, parties) => `The first recorded action, ${title}, happened on ${moment}${parties}.`,
        byAgainst: (source, target) => `, by ${source} against ${target}`,
        by: source => `, by ${source}`,
        against: target => `, against ${target}`,
        attackerActions: (count, tactics) => {
            const across = tactics.length > 0 ? ` across ${tactics.length} tactic(s): ${tactics.join(", ")}` : "";
            return `${count} attacker action(s) were recorded${across}.`;
        },
        dwell: duration => `The intrusion went unnoticed for ${duration} before it was detected.`,
        responseActions: (count, phases) => `The response took ${count} recorded action(s)${phases.length > 0 ? `, covering ${phases.join(", ")}` : ""}.`,
        compromisedRecords: (count, named, more) => `${count} record(s) are marked as compromised: ${named.join(", ")}${more ? " and others" : ""}.`,
        stoppedAttempts: count => `${count} attempt(s) were blocked or failed.`
    }
};

/**
 * The defaults with the host's words written over them, one group at a time, so a host may replace a
 * single label without restating the rest.
 */
export function buildStrings(override: StringsOverride = {}): Strings {
    return {
        workspace: { ...DEFAULT_STRINGS.workspace, ...override.workspace },
        app: { ...DEFAULT_STRINGS.app, ...override.app },
        rail: { ...DEFAULT_STRINGS.rail, ...override.rail },
        inspector: { ...DEFAULT_STRINGS.inspector, ...override.inspector },
        forms: { ...DEFAULT_STRINGS.forms, ...override.forms },
        deck: { ...DEFAULT_STRINGS.deck, ...override.deck },
        slide: { ...DEFAULT_STRINGS.slide, ...override.slide },
        options: { ...DEFAULT_STRINGS.options, ...override.options },
        scene: { ...DEFAULT_STRINGS.scene, ...override.scene },
        narrative: { ...DEFAULT_STRINGS.narrative, ...override.narrative }
    };
}
