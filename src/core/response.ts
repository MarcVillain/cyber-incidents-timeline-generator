// What the recorded steps say about how the response went, read from the moments the diagram draws so a
// slide never shows a number the steps underneath it disagree with.

import { ResponsePhase, Side, StepOutcome } from "./enums.js";
import { hoursFromMilliseconds, millisecondsFromHours } from "./time.js";

export interface TimedStep {
    at: Date | null;
    side: Side;
    outcome: StepOutcome;
    responsePhase: ResponsePhase;
}

type Dated<TStep extends TimedStep> = TStep & { at: Date };

export interface Stretch {
    from: Date;
    to: Date;
    hours: number;
}

export interface ResponsePoints {
    firstAttack: Date | null;
    firstNoticed: Date | null;
    detected: Date | null;
    contained: Date | null;
    eradicated: Date | null;
    recovered: Date | null;
    lastAction: Date | null;
}

export interface ResponseEpisode<TStep extends TimedStep> {
    from: Date;
    to: Date;
    steps: Dated<TStep>[];
    hours: number;
    failed: boolean;
}

// Two detections this close belong to the same piece of work, not to two investigations
const EPISODE_BREAK_HOURS = 72;

function dated<TStep extends TimedStep>(steps: readonly TStep[]): Dated<TStep>[] {
    return steps.filter((step): step is Dated<TStep> => step.at !== null);
}

function chronological(a: Date, b: Date): number {
    return a.getTime() - b.getTime();
}

function earliest(moments: readonly Date[]): Date | null {
    return [...moments].sort(chronological)[0] ?? null;
}

function latest(moments: readonly Date[]): Date | null {
    return [...moments].sort(chronological).at(-1) ?? null;
}

function noticedMoments(steps: readonly TimedStep[]): Date[] {
    return dated(steps)
        .filter(step => step.outcome === StepOutcome.Detected || step.responsePhase === ResponsePhase.Detect)
        .map(step => step.at)
        .sort(chronological);
}

/**
 * The moments somebody noticed, minus the ones nothing came of. A detection followed by a response that
 * failed did not end anything: the intruder carried on exactly as before, and treating that moment as
 * the end of a run reports hours where the truth is months.
 */
export function detections(steps: readonly TimedStep[]): Date[] {
    const noticed = noticedMoments(steps);
    const failed = dated(steps)
        .filter(step => step.side === Side.Defender && step.outcome === StepOutcome.Failed)
        .map(step => step.at);

    return noticed.filter((moment, index) => {
        const next = noticed[index + 1];
        return !failed.some(miss => miss >= moment && (!next || miss < next));
    });
}

/**
 * The longest the intruder ran before anybody noticed. Taking the first action and the first detection
 * only measures the first intrusion, and an incident can be hit twice.
 */
export function longestUnseen(steps: readonly TimedStep[]): Stretch | null {
    const attacks = dated(steps).filter(step => step.side === Side.Attacker).map(step => step.at).sort(chronological);
    const noticed = detections(steps);

    let longest: Stretch | null = null;
    for (const attack of attacks) {
        const seen = noticed.find(moment => moment >= attack);
        if (!seen) continue;
        const hours = hoursFromMilliseconds(seen.getTime() - attack.getTime());
        if (!longest || hours > longest.hours) {
            longest = { from: attack, to: seen, hours };
        }
    }

    return longest !== null && longest.hours > 0 ? longest : null;
}

function phaseMoment(steps: readonly TimedStep[], phase: ResponsePhase): Date | null {
    return earliest(dated(steps).filter(step => step.responsePhase === phase).map(step => step.at));
}

/**
 * The points the response passed through, read off the steps.
 */
export function responsePoints(steps: readonly TimedStep[]): ResponsePoints {
    const attacks = dated(steps).filter(step => step.side === Side.Attacker).map(step => step.at);
    const held = detections(steps);

    // Two different detections matter. The first time anyone noticed at all is what time to detect
    // measures, even if the fix that followed came to nothing. The first one that held is what ended
    // the intruder's run. On an incident handled twice these are months apart.
    return {
        firstAttack: earliest(attacks),
        firstNoticed: earliest(noticedMoments(steps)),
        detected: held[0] ?? null,
        contained: phaseMoment(steps, ResponsePhase.Contain),
        eradicated: phaseMoment(steps, ResponsePhase.Eradicate),
        recovered: phaseMoment(steps, ResponsePhase.Recover),
        lastAction: latest(dated(steps).map(step => step.at))
    };
}

/**
 * The response split into the episodes it actually happened in. An incident handled twice has two runs
 * of work months apart, and measuring from the first detection to the last action reports one long
 * investigation that nobody ever ran.
 *
 * An episode opens when somebody notices and closes on the last thing the response did before anybody
 * noticed again. It ends badly when the work inside it failed, which is what left the intruder in place.
 */
export function responseEpisodes<TStep extends TimedStep>(steps: readonly TStep[]): ResponseEpisode<TStep>[] {
    const noticed = noticedMoments(steps);
    if (noticed.length === 0) return [];

    const gap = millisecondsFromHours(EPISODE_BREAK_HOURS);
    const opens = noticed.filter((moment, index) => {
        const previous = noticed[index - 1];
        return !previous || moment.getTime() - previous.getTime() > gap;
    });
    const responding = dated(steps).filter(step => step.side !== Side.Attacker).sort((a, b) => chronological(a.at, b.at));

    return opens.map((from, index) => {
        const until = opens[index + 1] ?? null;
        const inside = responding.filter(step => step.at >= from && (!until || step.at < until));
        const to = inside.at(-1)?.at ?? from;

        return {
            from,
            to,
            steps: inside,
            hours: hoursFromMilliseconds(to.getTime() - from.getTime()),
            failed: inside.some(step => step.outcome === StepOutcome.Failed)
        };
    });
}
