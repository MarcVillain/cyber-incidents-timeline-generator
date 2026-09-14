export interface ValidationIssue {
    field: string;
    message: string;
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
