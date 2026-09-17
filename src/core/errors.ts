export interface ValidationIssue {
    field: string;
    message: string;
    /**
     * A stable name for the refusal, when there is one, so a host can act on it without reading the
     * English. Absent for the ordinary shape and range checks, whose field already says everything.
     */
    code?: string;
}

export class ValidationError extends Error {
    readonly issues: readonly ValidationIssue[];

    constructor(issues: readonly ValidationIssue[]) {
        super(issues.map(issue => `${issue.field} ${issue.message}`).join("; "));
        this.name = "ValidationError";
        this.issues = issues;
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

export class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ForbiddenError";
    }
}
