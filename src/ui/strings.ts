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
    exportXlsx: string;
    exportCsv: string;
    exportMarkdown: string;
    exportClipboard: string;
    copied: string;
    import: string;
    imported(records: number, steps: number): string;
    importFailed: string;
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
    settings: string;
    moveUp(label: string): string;
    moveDown(label: string): string;
    rename(label: string): string;
    milestones: string;
    everyStep: string;
    viewsBefore: string;
    viewsAfter: string;
    resetView: string;
    resetSetting(label: string): string;
}

export interface AppStrings {
    title: string;
    incidents: string;
    newIncident: string;
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
    everyone: string;
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
    timeHint: string;
    searchHint: string;
    noMatch: string;
    addTag: string;
    removeTag: string;
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
    densityDescription: string;
    detailDescription: string;
    layoutDescription: string;
    labelsDescription: string;
    compareDescription: string;
    rows: string;
    rowsDescription: string;
    summary: string;
    summaryDescription: string;
    summaryShown: string;
    summaryHidden: string;
    columns: string;
    columnsDescription: string;
}

/** What the filters shared by every view, the audience and the milestones, do to one of them. */
export interface FilterDescriptions {
    audience: string;
    milestones: string;
}

/** The descriptions of the shared filters, for each built in view and for any other. */
export interface FilterStrings {
    shared: FilterDescriptions;
    sequentialTimeline: FilterDescriptions;
    actorSwimlanes: FilterDescriptions;
    attackerDefender: FilterDescriptions;
    relationshipGraph: FilterDescriptions;
    killChainBoard: FilterDescriptions;
    attackFlow: FilterDescriptions;
    diamondModel: FilterDescriptions;
    attackMatrix: FilterDescriptions;
    blastRadius: FilterDescriptions;
    responseMetrics: FilterDescriptions;
    evidenceTimeline: FilterDescriptions;
    narrative: FilterDescriptions;
}

/** The headings of the timeline table, on the narrative slide and in the tabular exports. */
export interface TableStrings {
    number: string;
    when: string;
    date: string;
    time: string;
    until: string;
    duration: string;
    elapsed: string;
    who: string;
    whoKind: string;
    what: string;
    details: string;
    where: string;
    whereKind: string;
    whereIdentifier: string;
    whereCriticality: string;
    whereCompromised: string;
    involved: string;
    side: string;
    stage: string;
    tactic: string;
    killChain: string;
    responsePhase: string;
    technique: string;
    severity: string;
    confidence: string;
    outcome: string;
    audience: string;
    milestone: string;
    evidence: string;
    tags: string;
    reference: string;
    yes: string;
    no: string;
    everyone: string;
    sinceStart(duration: string): string;
    involvement(name: string, role: string): string;
    /** The name of the worksheet in the spreadsheet export. */
    sheet: string;
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

export interface SettingsStrings {
    open: string;
    title: string;
    tabAppearance: string;
    tabVocabulary: string;
    tabScales: string;
    tabDisplay: string;
    tabBackup: string;
    themeHeading: string;
    themeHint: string;
    themeMode: string;
    auto: string;
    colorsHeading: string;
    colorsHint: string;
    colorsInterface: string;
    colorsParties: string;
    light: string;
    dark: string;
    accent: string;
    positive: string;
    resetColor: string;
    vocabularyHeading: string;
    vocabularyHint: string;
    list: string;
    groupSides: string;
    groupNodeKinds: string;
    groupAttackTactics: string;
    groupKillChainPhases: string;
    groupResponsePhases: string;
    groupOutcomes: string;
    groupLinkKinds: string;
    groupConfidences: string;
    groupInvolvements: string;
    groupAudiences: string;
    groupRepresentations: string;
    iconOf(label: string): string;
    iconClash(labels: readonly string[]): string;
    searchIcons: string;
    impactHeading: string;
    impactHint: string;
    unassessed: string;
    milestonesHeading: string;
    milestonesHint: string;
    noMilestones: string;
    newName: string;
    addLevel: string;
    addMilestone: string;
    moveUp: string;
    moveDown: string;
    remove: string;
    colorOf(label: string): string;
    pagesHeading: string;
    pagesHint: string;
    pageShape: string;
    layout: string;
    layoutSlides: string;
    layoutContinuous: string;
    viewPicker: string;
    viewPickerScroll: string;
    viewPickerMenu: string;
    datesHeading: string;
    datesHint: string;
    dateFormat: string;
    minutes: string;
    hours: string;
    days: string;
    backupHeading: string;
    backupHint: string;
    exportSettings: string;
    importSettings: string;
    imported: string;
    importFailed: string;
    resetHeading: string;
    resetHint: string;
    resetAll: string;
    resetDone: string;
    save: string;
    saveAnyway: string;
    cancel: string;
    inUseWarning: string;
    inUse(label: string, count: number): string;
    usageFailed: string;
    vocabularyEditHint: string;
    addEntry: string;
    resetList: string;
    keptEntry: string;
    usedByTactic: string;
    role: string;
    roleAttacker: string;
    roleDefender: string;
    roleAlly: string;
    roleVictim: string;
    roleNeutral: string;
    entryColor: string;
    category: string;
    categoryActor: string;
    categoryResource: string;
    diamondVertex: string;
    killChainPhase: string;
    stage: string;
    stageNone: string;
    stageDetection: string;
    stageContainment: string;
    stageEradication: string;
    stageRecovery: string;
    meaning: string;
    meaningUnknown: string;
    meaningSucceeded: string;
    meaningFailed: string;
    meaningBlocked: string;
    meaningDetected: string;
    direction: string;
    oneWay: string;
    bothWays: string;
    invalidVocabulary: string;
    entryKey: string;
    entryDetails: string;
    showAdvanced: string;
    meaningOf(label: string): string;
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
    table: TableStrings;
    filters: FilterStrings;
    scene: SceneStrings;
    narrative: NarrativeStrings;
    settings: SettingsStrings;
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
        exportXlsx: "Excel workbook, the timeline as a table",
        exportCsv: "CSV, the timeline as a table",
        exportMarkdown: "Markdown table",
        exportClipboard: "Copy the table, to paste anywhere",
        copied: "The timeline table is on the clipboard.",
        import: "Open a timeline file",
        imported: (records, steps) => `Added ${records} record(s) and ${steps} step(s).`,
        importFailed: "The timeline file could not be read.",
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
        noRenderer: "No renderer is available.",
        settings: "Settings of this view",
        moveUp: label => `Move ${label} up`,
        moveDown: label => `Move ${label} down`,
        rename: label => `Heading shown for ${label}`,
        milestones: "Milestones",
        everyStep: "Every step",
        viewsBefore: "Show the views before",
        viewsAfter: "Show the views after",
        resetView: "Reset to defaults",
        resetSetting: label => `Put ${label} back to its default`
    },
    app: {
        title: "Incident timelines",
        incidents: "Incidents",
        newIncident: "New incident",
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
        everyone: "Everyone, when none is picked",
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
        timeHint: "Time, may be left empty",
        searchHint: "Search",
        noMatch: "Nothing matches",
        addTag: "Add a tag, then press Enter",
        removeTag: "Remove"
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
        compareCauses: "What let it run",
        densityDescription: "How much room each step takes. Compact fits more steps on a slide, Stacked and Rows trade width for height.",
        detailDescription: "Compact names the tactics only. Detailed lists the steps under each one.",
        layoutDescription: "Bands lines the records up by party. Network lets the connections decide where each one sits.",
        labelsDescription: "Writes the kind of each connection on its line. Hide them when the map gets crowded.",
        compareDescription: "What the response times are measured against.",
        rows: "Rows",
        rowsDescription: "Compact rows fit more steps on each slide and in each page of a print.",
        summary: "Summary",
        summaryDescription: "The written account above the table on the first slide. Hiding it leaves the whole slide to the table.",
        summaryShown: "Summary shown",
        summaryHidden: "Summary hidden",
        columns: "Columns",
        columnsDescription: "What the table shows, in order, under the headings you give them. The spreadsheet, CSV, Markdown and copied exports use the same columns."
    },
    filters: {
        shared: {
            audience: "Which steps are drawn: every step, or only those written for executives or for technical readers.",
            milestones: "Draws only the steps marked as milestones."
        },
        sequentialTimeline: {
            audience: "Keeps the blocks written for the chosen readers on the arrow.",
            milestones: "Leaves only the milestone blocks on the arrow, so the story fits fewer slides."
        },
        actorSwimlanes: {
            audience: "Keeps the steps written for the chosen readers in the lanes.",
            milestones: "Leaves only the milestone steps in each lane."
        },
        attackerDefender: {
            audience: "Keeps the moves written for the chosen readers on both sides.",
            milestones: "Shows only the milestone moves of the attacker and the defender."
        },
        relationshipGraph: {
            audience: "Keeps the records touched by steps written for the chosen readers, with the groups holding them.",
            milestones: "Keeps only the records the milestone steps touch."
        },
        killChainBoard: {
            audience: "Places only the attacker steps written for the chosen readers in their phase.",
            milestones: "Places only the milestone steps on the board."
        },
        attackFlow: {
            audience: "Chains only the attacker steps written for the chosen readers.",
            milestones: "Chains only the milestone steps."
        },
        diamondModel: {
            audience: "Keeps the parties and tooling of the steps written for the chosen readers.",
            milestones: "Keeps only what the milestone steps involve."
        },
        attackMatrix: {
            audience: "Marks only the techniques of steps written for the chosen readers.",
            milestones: "Marks only the techniques of milestone steps."
        },
        blastRadius: {
            audience: "Keeps the records reached by steps written for the chosen readers.",
            milestones: "Keeps only the records the milestone steps reach."
        },
        responseMetrics: {
            audience: "Draws only the steps written for the chosen readers.",
            milestones: "Draws only the milestone steps."
        },
        evidenceTimeline: {
            audience: "Keeps the evidence of the steps written for the chosen readers.",
            milestones: "Keeps only the evidence of the milestone steps."
        },
        narrative: {
            audience: "Lists only the steps written for the chosen readers, in the table and in every table export.",
            milestones: "Lists only the milestone steps, in the table and in every table export."
        }
    },
    table: {
        number: "#",
        when: "When",
        date: "Date",
        time: "Time",
        until: "Until",
        duration: "Duration",
        elapsed: "Since start",
        who: "Who",
        whoKind: "Who, kind",
        what: "What happened",
        details: "Details",
        where: "On what",
        whereKind: "Target kind",
        whereIdentifier: "Target identifier",
        whereCriticality: "Target criticality",
        whereCompromised: "Target compromised",
        involved: "Also involved",
        side: "Side",
        stage: "Stage",
        tactic: "Tactic",
        killChain: "Kill chain phase",
        responsePhase: "Response phase",
        technique: "Technique",
        severity: "Severity",
        confidence: "Confidence",
        outcome: "Outcome",
        audience: "Audience",
        milestone: "Milestone",
        evidence: "Evidence source",
        tags: "Tags",
        reference: "Reference",
        yes: "Yes",
        no: "No",
        everyone: "Everyone",
        sinceStart: duration => `T+${duration}`,
        involvement: (name, role) => `${name} (${role})`,
        sheet: "Timeline"
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
    },
    settings: {
        open: "Settings",
        title: "Settings",
        tabAppearance: "Appearance",
        tabVocabulary: "Vocabulary",
        tabScales: "Scales",
        tabDisplay: "Display",
        tabBackup: "Backup",
        themeHeading: "Theme",
        themeHint: "Auto follows the page, then the system. The button beside Settings switches it too.",
        themeMode: "Mode",
        auto: "Auto",
        colorsHeading: "Colours",
        colorsHint: "Pick each colour for the light and the dark theme. Soft backgrounds follow the colour on their own.",
        colorsInterface: "Interface",
        colorsParties: "Parties",
        light: "Light",
        dark: "Dark",
        accent: "Accent",
        positive: "Positive outcome",
        resetColor: "Reset",
        vocabularyHeading: "Names and icons",
        vocabularyHint: "Rename entries and change their icons. A blank name keeps the built in one.",
        list: "List",
        groupSides: "Parties",
        groupNodeKinds: "Record kinds",
        groupAttackTactics: "ATT&CK tactics",
        groupKillChainPhases: "Kill chain phases",
        groupResponsePhases: "Response phases",
        groupOutcomes: "Outcomes",
        groupLinkKinds: "Relationships",
        groupConfidences: "Confidence",
        groupInvolvements: "Involvement",
        groupAudiences: "Audiences",
        groupRepresentations: "Representations",
        iconOf: label => `Icon of ${label}`,
        iconClash: labels => `Same icon as ${labels.join(", ")}`,
        searchIcons: "Search icons",
        impactHeading: "Impact scale",
        impactHint: "The levels incidents, records and steps are rated on, from lowest to highest. The built in levels follow the theme until you pick a colour.",
        unassessed: "Not assessed",
        milestonesHeading: "Milestones",
        milestonesHint: "The moments your reports track, such as the first access or the containment. One step at most holds each.",
        noMilestones: "No milestones yet.",
        newName: "Name",
        addLevel: "Add level",
        addMilestone: "Add milestone",
        moveUp: "Move up",
        moveDown: "Move down",
        remove: "Remove",
        colorOf: label => `Colour of ${label}`,
        pagesHeading: "Pages",
        pagesHint: "How diagrams are sized and cut, on screen and in every export.",
        pageShape: "Page shape",
        layout: "Layout",
        layoutSlides: "Slides",
        layoutContinuous: "One long page",
        viewPicker: "Switching views",
        viewPickerScroll: "A strip that scrolls",
        viewPickerMenu: "A dropdown menu",
        datesHeading: "Dates and durations",
        datesHint: "How dates are written, and the short units durations end with.",
        dateFormat: "Date format",
        minutes: "Minutes",
        hours: "Hours",
        days: "Days",
        backupHeading: "Keep a copy",
        backupHint: "Settings live in this browser only. Export them to a file to keep them safe or to use them in another browser.",
        exportSettings: "Export settings",
        importSettings: "Import settings",
        imported: "Settings loaded from the file. Save to keep them.",
        importFailed: "That file does not hold settings.",
        resetHeading: "Start over",
        resetHint: "Puts every setting back to its built in value. Incidents and their records are not touched.",
        resetAll: "Reset everything",
        resetDone: "Every setting is back to its built in value. Save to keep it.",
        save: "Save",
        saveAnyway: "Save anyway",
        cancel: "Cancel",
        inUseWarning: "Records still use what you removed. They keep their value, drawn as unknown, until someone edits them.",
        inUse: (label, count) => `${label}: ${count} record(s)`,
        usageFailed: "The records could not be checked for what you removed.",
        vocabularyEditHint: "Add, rename, reorder and remove entries, and say what each one means for the views. A list you never touch follows the package.",
        addEntry: "Add entry",
        resetList: "Reset this list",
        keptEntry: "Kept: records fall back to it",
        usedByTactic: "A tactic lands in this phase",
        role: "Camp",
        roleAttacker: "Attacker",
        roleDefender: "Defender",
        roleAlly: "Helps the response",
        roleVictim: "Victim",
        roleNeutral: "Neutral",
        entryColor: "Colour",
        category: "Kind of record",
        categoryActor: "Party",
        categoryResource: "Resource",
        diamondVertex: "Diamond vertex",
        killChainPhase: "Kill chain phase",
        stage: "Counts toward",
        stageNone: "No figure",
        stageDetection: "Time to detect",
        stageContainment: "Time to contain",
        stageEradication: "Eradication",
        stageRecovery: "Time to recover",
        meaning: "Means",
        meaningUnknown: "Nothing in particular",
        meaningSucceeded: "It worked",
        meaningFailed: "It failed",
        meaningBlocked: "It was stopped",
        meaningDetected: "It was noticed",
        direction: "Direction",
        oneWay: "One way",
        bothWays: "Both ways",
        invalidVocabulary: "These lists do not fit together. Check that every tactic lands in a kill chain phase that still exists.",
        entryKey: "Stored as",
        entryDetails: "Details",
        showAdvanced: "Show what each entry means for the views",
        meaningOf: label => `What ${label} means for the views`
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
        table: { ...DEFAULT_STRINGS.table, ...override.table },
        filters: { ...DEFAULT_STRINGS.filters, ...override.filters },
        scene: { ...DEFAULT_STRINGS.scene, ...override.scene },
        narrative: { ...DEFAULT_STRINGS.narrative, ...override.narrative },
        settings: { ...DEFAULT_STRINGS.settings, ...override.settings }
    };
}
