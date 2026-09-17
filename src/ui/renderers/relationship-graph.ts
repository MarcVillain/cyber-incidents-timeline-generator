// Everyone and everything involved, and how they connect. Positions come from a fixed rule rather than a
// simulation, so the same incident always draws the same picture and nothing drifts.

import { Confidence, Representation, Side } from "../../core/enums.js";
import type { DiagramLink, DiagramNode, RecordId } from "../../core/models.js";
import { fitText, nodeBox, nodeColor } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import { paginateGroups, type Weighted } from "../geometry.js";
import { arrowMarkers, circle, group, markerId, path, rect, text, truncate, wrap } from "../svg.js";
import type { Palette } from "../theme.js";
import type { Point } from "../viewport.js";
import { defineRenderer, optionValue, type RenderContext, type RendererOption } from "./registry.js";
import type { Strings } from "../strings.js";

enum GraphLayout {
    Bands = "bands",
    Network = "network"
}

enum GraphLabels {
    Shown = "shown",
    Hidden = "hidden"
}

function layoutOption(strings: Strings): RendererOption<GraphLayout> {
    return {
        id: "layout",
        label: strings.options.layout,
        fallback: GraphLayout.Bands,
        choices: [
            { value: GraphLayout.Bands, label: strings.options.layoutBands },
            { value: GraphLayout.Network, label: strings.options.layoutNetwork }
        ]
    };
}

function labelsOption(strings: Strings): RendererOption<GraphLabels> {
    return {
        id: "labels",
        label: strings.options.labels,
        fallback: GraphLabels.Shown,
        choices: [
            { value: GraphLabels.Shown, label: strings.options.labelsShown },
            { value: GraphLabels.Hidden, label: strings.options.labelsHidden }
        ]
    };
}

const BAND_ORDER: readonly Side[] = [Side.Attacker, Side.ThirdParty, Side.Unknown, Side.Victim, Side.Defender];
const BAND_GAP = 46;
const SIDE_REACH = 34;
const LABEL_REACH = 0.34;
const AVENUE_MARGIN = 16;
const EDGE_ARROW = "tlg-edge";
const TRACKS_PER_BAND = 5;
const TRACK_STEP = 8;
const SAMPLES = 24;
const CLUSTER_GAP = 16;
const CLUSTER_HEADER = 32;
const BAND_HEADING = 26;
const CLUSTER_PADDING = 12;
const BOX_HEIGHT = 52;
const BOX_GAP = 10;
const WEIGHT_UNIT = 40;
const TWO_COLUMN_BAND = 400;
const LABEL_CHAR = 5.2;
const CHORD_LABEL_CHAR = 4.9;
const LINK_HIT_WIDTH = 12;

const RING_MARGIN = 132;
const DOT_RADIUS = 7;
const LABEL_OFFSET = 15;
const NAME_LINES = 3;
const NAME_LINE_HEIGHT = 12;
const CHORD_BOW = 0.42;
const CHORD_LABEL_STOPS: readonly number[] = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8];

interface Cluster extends Weighted {
    id: string;
    container: DiagramNode | null;
    label: string;
    side: Side;
    members: DiagramNode[];
}

interface BandColumn {
    side: Side;
    clusters: Cluster[];
}

type GraphPage =
    | { layout: GraphLayout.Bands; bands: BandColumn[] }
    | { layout: GraphLayout.Network; nodes: DiagramNode[] };

interface BoxPosition {
    x: number;
    y: number;
    width: number;
    height: number;
    bandIndex: number;
    bandRight: number;
}

interface Anchor {
    fromY: number;
    toY: number;
}

interface Extent {
    top: number;
    bottom: number;
}

interface EdgeShape {
    path: string;
    x0: number;
    y0: number;
    samples: Point[];
}

interface DrawnEdge {
    link: DiagramLink;
    color: string;
    shape: EdgeShape;
}

interface PlacedLabel {
    x: number;
    y: number;
    width: number;
}

interface RingPlace {
    angle: number;
    x: number;
    y: number;
}

interface ChordCurve {
    path: string;
    at(t: number): Point;
}

function linkColor(context: RenderContext, link: DiagramLink): string {
    const source = context.store.node(link.sourceNodeId);
    return context.palette.sides[source ? source.side : Side.Unknown].color;
}

function labelsShown(context: RenderContext): boolean {
    return optionValue(context, labelsOption(context.strings)) === GraphLabels.Shown;
}

/**
 * Splits the records into the bands drawn side by side, and inside each band into the containers that
 * own them. A company keeps its members, and anything without a container falls into a loose group.
 */
function buildBands(context: RenderContext, nodes: readonly DiagramNode[]): BandColumn[] {
    const present = new Set(nodes.map(node => node.side));
    const bands = BAND_ORDER.filter(side => present.has(side)).map(side => ({ side, clusters: [] as Cluster[] }));
    const bandBySide = new Map(bands.map(band => [band.side, band]));
    const containers = nodes.filter(node => nodes.some(candidate => candidate.parentId === node.id));
    const containerIds = new Set(containers.map(node => node.id));

    containers.forEach(container => {
        bandBySide.get(container.side)?.clusters.push({
            id: `container-${container.id}`,
            container,
            label: container.name,
            side: container.side,
            members: nodes.filter(node => node.parentId === container.id),
            weight: 1
        });
    });

    bands.forEach(band => {
        const loose = nodes.filter(node => node.side === band.side && !containerIds.has(node.id) && node.parentId === null);
        if (loose.length > 0) {
            band.clusters.push({ id: `loose-${band.side}`, container: null, label: context.store.sideInfo(band.side).label, side: band.side, members: loose, weight: 1 });
        }
    });
    return bands.filter(band => band.clusters.length > 0);
}

function clusterSize(cluster: Cluster, bandWidth: number): { columns: number; height: number } {
    const columns = bandWidth >= TWO_COLUMN_BAND ? 2 : 1;
    const rows = Math.ceil(cluster.members.length / columns);
    return { columns, height: CLUSTER_HEADER + CLUSTER_PADDING + rows * (BOX_HEIGHT + BOX_GAP) };
}

function bandWidthFor(count: number): number {
    return (CONTENT.width - BAND_GAP * count) / count;
}

function bandHeading(context: RenderContext, side: Side, x: number, width: number, y: number): SVGGElement {
    const { palette, icons, store } = context;
    const info = store.sideInfo(side);
    const color = palette.sides[side].color;
    return group({}, [
        rect(x, y + 8, width, 3, { rx: 1.5, fill: color }),
        icons.draw(info.icon, x + 8, y - 4, 12, color),
        text(info.label.toUpperCase(), x + 20, y - 4, { "font-size": 10.5, "font-weight": 700, "letter-spacing": 0.8, fill: color, "dominant-baseline": "central" })
    ]);
}

function clusterBox(context: RenderContext, cluster: Cluster, x: number, y: number, width: number, height: number): SVGGElement {
    const { palette, icons, store } = context;
    const color = palette.sides[cluster.side].color;
    const node = group();

    node.appendChild(rect(x, y, width, height, {
        rx: 12, fill: palette.tint(color, 0.96), stroke: palette.tint(color, 0.78), "stroke-width": 1, "stroke-dasharray": cluster.container ? null : "5 4"
    }));

    if (cluster.container) {
        const container = cluster.container;
        const boxed = group({ class: "tlg-node", "data-node-id": container.id });
        boxed.appendChild(icons.draw(store.nodeIcon(container), x + 16, y + 16, 13, color));
        const grouped = fitText(cluster.label, width - 42, { size: 12, minSize: 8 });
        boxed.appendChild(text(grouped.text, x + 30, y + 16, { "font-size": grouped.size, "font-weight": 700, fill: palette.ink, "dominant-baseline": "central" }));
        node.appendChild(boxed);
    } else {
        const loose = fitText(cluster.label, width - 24, { size: 10.5, minSize: 8 });
        node.appendChild(text(loose.text, x + 14, y + 16, {
            "font-size": loose.size, "font-weight": 600, "letter-spacing": 0.5, fill: palette.inkMuted, "dominant-baseline": "central"
        }));
    }
    return node;
}

/**
 * Where each link meets each card. Several links on one record would otherwise all leave the middle of
 * its edge on top of each other, so they are spread down the side in the order of the cards they reach,
 * which also stops them crossing on the way out.
 */
function anchorPoints(links: readonly DiagramLink[], positions: ReadonlyMap<RecordId, BoxPosition>): Map<RecordId, Anchor> {
    const perNode = new Map<RecordId, { linkId: RecordId; order: number }[]>();
    const remember = (nodeId: RecordId, linkId: RecordId, otherId: RecordId): void => {
        const other = positions.get(otherId);
        if (!other) return;
        const entries = perNode.get(nodeId) ?? [];
        entries.push({ linkId, order: other.y + other.height / 2 });
        perNode.set(nodeId, entries);
    };

    links.forEach(link => {
        remember(link.sourceNodeId, link.id, link.targetNodeId);
        remember(link.targetNodeId, link.id, link.sourceNodeId);
    });

    const slots = new Map<string, number>();
    perNode.forEach((entries, nodeId) => {
        const box = positions.get(nodeId);
        if (!box) return;
        entries.sort((a, b) => a.order - b.order);
        entries.forEach((entry, index) => slots.set(`${nodeId}:${entry.linkId}`, box.y + box.height * (index + 1) / (entries.length + 1)));
    });

    const anchors = new Map<RecordId, Anchor>();
    links.forEach(link => {
        anchors.set(link.id, {
            fromY: slots.get(`${link.sourceNodeId}:${link.id}`) ?? 0,
            toY: slots.get(`${link.targetNodeId}:${link.id}`) ?? 0
        });
    });
    return anchors;
}

/**
 * Where on its own line a label goes. It never leaves the line it names, because a label floating in
 * clear space beside three others says nothing about which link it belongs to. It slides along the path
 * instead, starting from the middle and working outwards until it finds a spot that is not on a record
 * card, another label or somebody else's line.
 */
function labelSpot(samples: readonly Point[], obstacles: readonly Point[], cards: readonly BoxPosition[], placed: readonly PlacedLabel[], width: number): Point {
    const half = width / 2;
    const reach = Math.max(1, Math.round(samples.length * LABEL_REACH / 2));
    const middleIndex = Math.floor(samples.length / 2);
    const usable = samples.slice(Math.max(0, middleIndex - reach), middleIndex + reach + 1);
    const middle = (usable.length - 1) / 2;
    const ordered = usable
        .map((point, index) => ({ point, distance: Math.abs(index - middle) }))
        .sort((a, b) => a.distance - b.distance)
        .map(entry => entry.point);

    const clear = (point: Point): boolean => {
        if (cards.some(card => point.x > card.x - half && point.x < card.x + card.width + half && point.y > card.y - 9 && point.y < card.y + card.height + 9)) return false;
        if (placed.some(item => Math.abs(item.y - point.y) < 16 && Math.abs(item.x - point.x) < (item.width + width) / 2)) return false;
        return !obstacles.some(other => Math.abs(other.y - point.y) < 9 && other.x > point.x - half && other.x < point.x + half);
    };

    return ordered.find(clear) ?? ordered[0] ?? samples[middleIndex] ?? { x: 0, y: 0 };
}

/**
 * A free horizontal line to carry a link over the bands it passes above or below. Whichever side of the
 * bands in between has more room wins, so a link from the attackers to the victims does not run straight
 * over the third party sitting between them.
 */
function clearLane(extents: readonly (Extent | undefined)[], fromBand: number, toBand: number, anchor: Anchor): number {
    const first = Math.min(fromBand, toBand);
    const last = Math.max(fromBand, toBand);
    const between = extents.slice(first + 1, last).filter((extent): extent is Extent => extent !== undefined);
    const middle = (anchor.fromY + anchor.toY) / 2;
    if (between.length === 0) return middle;

    const above = Math.min(...between.map(extent => extent.top)) - AVENUE_MARGIN;
    const below = Math.max(...between.map(extent => extent.bottom)) + AVENUE_MARGIN;
    const overAllowed = above > CONTENT.y + AVENUE_MARGIN;
    const underAllowed = below < CONTENT.bottom - AVENUE_MARGIN;
    if (overAllowed && (!underAllowed || middle - above <= below - middle)) return above;
    if (underAllowed) return below;
    return middle;
}

/**
 * Points along a straight run, so a label can tell whether it would land on top of one.
 */
function sampleLine(x0: number, y0: number, x1: number, y1: number): Point[] {
    return Array.from({ length: SAMPLES + 1 }, (_, step) => {
        const t = step / SAMPLES;
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
    });
}

/**
 * Out of the source, down the gap beside its band, along the clear lane, then back in at the target.
 * Square corners, because a reader following this needs to see where it turns.
 */
function crossingShape(from: BoxPosition, to: BoxPosition, anchor: Anchor, exitX: number, entryX: number, lane: number): EdgeShape {
    const leftToRight = to.x > from.x;
    const x0 = leftToRight ? from.x + from.width : from.x;
    const x1 = leftToRight ? to.x : to.x + to.width;
    const out = leftToRight ? exitX : entryX;
    const back = leftToRight ? entryX : exitX;
    const { fromY: y0, toY: y1 } = anchor;

    return {
        path: `M${x0},${y0} H${out} V${lane} H${back} V${y1} H${x1}`,
        x0,
        y0,
        samples: [
            ...sampleLine(x0, y0, out, y0),
            ...sampleLine(out, y0, out, lane),
            ...sampleLine(out, lane, back, lane),
            ...sampleLine(back, lane, back, y1),
            ...sampleLine(back, y1, x1, y1)
        ]
    };
}

/**
 * A link between two neighbouring bands sweeps across on one curve, which is what keeps a bundle of them
 * apart. A link that stays inside a band gets square corners out to a track of its own in the gap beside
 * it, because inside one column a curve only tells you two cards are joined, not which way round.
 */
function edgeShape(from: BoxPosition, to: BoxPosition, track: number | null, anchor: Anchor): EdgeShape {
    const { fromY: y0, toY: y1 } = anchor;

    if (track !== null) {
        const x0 = from.x + from.width;
        const x1 = to.x + to.width;
        return {
            path: `M${x0},${y0} H${track} V${y1} H${x1}`,
            x0,
            y0,
            samples: [...sampleLine(x0, y0, track, y0), ...sampleLine(track, y0, track, y1), ...sampleLine(track, y1, x1, y1)]
        };
    }

    const leftToRight = to.x > from.x;
    const x0 = leftToRight ? from.x + from.width : from.x;
    const x1 = leftToRight ? to.x : to.x + to.width;
    const pull = Math.max(SIDE_REACH, Math.abs(x1 - x0) * 0.45);
    const c0 = leftToRight ? x0 + pull : x0 - pull;
    const c1 = leftToRight ? x1 - pull : x1 + pull;
    const at = (t: number): Point => {
        const u = 1 - t;
        return {
            x: u * u * u * x0 + 3 * u * u * t * c0 + 3 * u * t * t * c1 + t * t * t * x1,
            y: u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1
        };
    };

    return {
        path: `M${x0},${y0} C${c0},${y0} ${c1},${y1} ${x1},${y1}`,
        x0,
        y0,
        samples: Array.from({ length: SAMPLES + 1 }, (_, step) => at(step / SAMPLES))
    };
}

/**
 * An invisible band along a link. The drawn line is barely more than a pixel wide, which is too thin to
 * point at, so this is what the pointer actually hovers and clicks.
 */
function hitArea(d: string): SVGPathElement {
    return path(d, { class: "tlg-hit", fill: "none", stroke: "transparent", "stroke-width": LINK_HIT_WIDTH, "pointer-events": "stroke" });
}

function edgeLine(context: RenderContext, { link, color, shape }: DrawnEdge): SVGGElement {
    const info = context.store.linkKindInfo(link.kind);
    return group({ class: "tlg-link", "data-link-id": link.id }, [
        hitArea(shape.path),
        path(shape.path, {
            class: "tlg-link-line", fill: "none", stroke: color, "stroke-width": 1.4, "stroke-dasharray": link.confidence === Confidence.Confirmed ? null : "5 4", opacity: 0.75,
            "marker-end": info.directed ? `url(#${markerId(EDGE_ARROW, color)})` : null
        }),
        circle(shape.x0, shape.y0, 2.5, { fill: color, opacity: 0.85 })
    ]);
}

function edgeLabel(context: RenderContext, { link, shape }: DrawnEdge, obstacles: readonly Point[], cards: readonly BoxPosition[], placed: PlacedLabel[]): SVGGElement {
    const { palette, store } = context;
    const label = link.label ?? store.linkKindInfo(link.kind).label;
    const width = label.length * LABEL_CHAR + 10;
    const spot = labelSpot(shape.samples, obstacles, cards, placed, width);
    placed.push({ x: spot.x, y: spot.y, width });

    return group({ class: "tlg-link tlg-link-label", "data-link-id": link.id }, [
        rect(spot.x - width / 2, spot.y - 8, width, 15, { rx: 7.5, fill: palette.surface, opacity: 0.94 }),
        text(truncate(label, 9.5, width), spot.x, spot.y, { "font-size": 9.5, "text-anchor": "middle", "dominant-baseline": "central", fill: palette.inkMuted })
    ]);
}

function drawBands(context: RenderContext, bands: readonly BandColumn[], pageIndex: number, pageCount: number): SVGGElement {
    const { store, palette } = context;

    const { root, content } = frame(context, {
        page: pageIndex,
        pageCount,
        subtitle: `${store.visibleNodes().length} records, ${store.links.length} relationships`,
        legend: bands.map(band => ({ label: store.sideInfo(band.side).label, color: palette.sides[band.side].color, icon: store.sideInfo(band.side).icon }))
    });

    const drawable = bands.filter(band => band.clusters.length > 0);
    if (drawable.length === 0) {
        content.appendChild(placeholder(context, context.strings.scene.emptyGraphTitle, context.strings.scene.emptyGraphHint));
        return root;
    }

    // A gap is left after every band, the last one included, so the curves leaving the right hand cards
    // have somewhere to swing through
    const bandWidth = bandWidthFor(drawable.length);
    const positions = new Map<RecordId, BoxPosition>();
    // What each band actually occupies vertically, so a link crossing over one can be routed clear of its
    // cards instead of straight through them
    const extents: (Extent | undefined)[] = [];
    const edges = group();
    const clusters = group();
    const boxes = group();
    const labels = group();

    drawable.forEach((band, bandIndex) => {
        const bandX = CONTENT.x + bandIndex * (bandWidth + BAND_GAP);
        const stackHeight = band.clusters.reduce((sum, cluster) => sum + clusterSize(cluster, bandWidth).height + CLUSTER_GAP, -CLUSTER_GAP);
        // A short band would otherwise hug the header with the rest of the page left blank
        let cursor = CONTENT.y + BAND_HEADING + Math.max(0, (CONTENT.height - BAND_HEADING - stackHeight) / 2);

        content.appendChild(bandHeading(context, band.side, bandX, bandWidth, CONTENT.y + 12));

        band.clusters.forEach(cluster => {
            const size = clusterSize(cluster, bandWidth);
            clusters.appendChild(clusterBox(context, cluster, bandX, cursor, bandWidth, size.height));

            const extent = extents[bandIndex] ?? { top: cursor, bottom: cursor };
            extent.top = Math.min(extent.top, cursor);
            extent.bottom = Math.max(extent.bottom, cursor + size.height);
            extents[bandIndex] = extent;

            const boxWidth = (bandWidth - CLUSTER_PADDING * 2 - BOX_GAP * (size.columns - 1)) / size.columns;

            cluster.members.forEach((member, memberIndex) => {
                const automatic = {
                    x: bandX + CLUSTER_PADDING + (memberIndex % size.columns) * (boxWidth + BOX_GAP),
                    y: cursor + CLUSTER_HEADER + Math.floor(memberIndex / size.columns) * (BOX_HEIGHT + BOX_GAP)
                };
                const at = store.placement(member, Representation.RelationshipGraph) ?? automatic;

                const box = nodeBox(context, member, boxWidth, BOX_HEIGHT);
                box.setAttribute("transform", `translate(${at.x}, ${at.y})`);
                box.setAttribute("data-x", String(at.x));
                box.setAttribute("data-y", String(at.y));
                box.setAttribute("data-draggable", "true");
                boxes.appendChild(box);

                positions.set(member.id, { x: at.x, y: at.y, width: boxWidth, height: BOX_HEIGHT, bandIndex, bandRight: bandX + bandWidth });
            });

            cursor += size.height + CLUSTER_GAP;
        });
    });

    const links = store.links.filter(link => positions.has(link.sourceNodeId) && positions.has(link.targetNodeId));
    const anchors = anchorPoints(links, positions);
    edges.appendChild(arrowMarkers(EDGE_ARROW, links.map(link => linkColor(context, link)), { refX: 9 }));

    // A link that stays inside one band runs out into the gap beside it on square corners, each on its own
    // track. Two of those on the same track would sit on top of each other and neither could be followed.
    const gapCentre = (bandIndex: number): number => CONTENT.x + bandIndex * (bandWidth + BAND_GAP) + bandWidth + BAND_GAP / 2;
    const used = new Map<string, number>();
    const offset = (key: string): number => {
        const count = used.get(key) ?? 0;
        used.set(key, count + 1);
        return (count % TRACKS_PER_BAND - (TRACKS_PER_BAND - 1) / 2) * TRACK_STEP;
    };

    const drawn: DrawnEdge[] = [];
    links.forEach(link => {
        const from = positions.get(link.sourceNodeId);
        const to = positions.get(link.targetNodeId);
        const anchor = anchors.get(link.id);
        if (!from || !to || !anchor) return;

        let shape: EdgeShape;
        if (from.bandIndex === to.bandIndex) {
            shape = edgeShape(from, to, from.bandRight + BAND_GAP / 2 + offset(`track-${from.bandIndex}`), anchor);
        } else if (Math.abs(from.bandIndex - to.bandIndex) > 1) {
            const lane = clearLane(extents, from.bandIndex, to.bandIndex, anchor) + offset(`lane-${from.bandIndex}-${to.bandIndex}`);
            shape = crossingShape(from, to, anchor, gapCentre(Math.min(from.bandIndex, to.bandIndex)), gapCentre(Math.max(from.bandIndex, to.bandIndex) - 1), lane);
        } else {
            shape = edgeShape(from, to, null, anchor);
        }
        drawn.push({ link, color: linkColor(context, link), shape });
    });

    drawn.forEach(entry => edges.appendChild(edgeLine(context, entry)));

    // Every line is on the page before a single label is, so a label can be put where no other line runs.
    // Its own line does not count: a label sitting on the link it names is what a reader expects.
    if (labelsShown(context)) {
        const cards = [...positions.values()];
        const placed: PlacedLabel[] = [];
        drawn.forEach(entry => {
            const obstacles = drawn.filter(other => other !== entry).flatMap(other => other.shape.samples);
            labels.appendChild(edgeLabel(context, entry, obstacles, cards, placed));
        });
    }

    // The group cards go down first so the links run visibly across them. Only the record boxes cover a
    // link, which is what makes the end of a line readable as an attachment. Labels ride above the boxes.
    content.appendChild(clusters);
    content.appendChild(edges);
    content.appendChild(boxes);
    content.appendChild(labels);
    return root;
}

/*
 * The other way of reading the same records: everything on one ring, every relationship a chord across
 * it. Nothing is hidden behind a band boundary and no line has to be routed around anything, so a dense
 * incident stays readable where columns of cards stop coping.
 */

function ringOrder(context: RenderContext, nodes: readonly DiagramNode[]): DiagramNode[] {
    const { store } = context;
    const sideRank = new Map(store.catalog.sides.map((side, index) => [side.side, index]));
    const groupName = (node: DiagramNode): string => (node.parentId === null ? node.name : store.node(node.parentId)?.name ?? node.name);

    return [...nodes].sort((a, b) =>
        ((sideRank.get(a.side) ?? sideRank.size) - (sideRank.get(b.side) ?? sideRank.size))
        || groupName(a).localeCompare(groupName(b))
        || a.name.localeCompare(b.name));
}

function towards(place: Point, centerX: number, centerY: number, distance: number): Point {
    const dx = centerX - place.x;
    const dy = centerY - place.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: place.x + (dx / length) * distance, y: place.y + (dy / length) * distance };
}

/**
 * A quadratic pulled towards the middle. Two records next to each other get a short hop, two on opposite
 * sides get a chord that dips through the centre, and neither runs over the ring itself.
 */
function chordCurve(from: RingPlace, to: RingPlace, centerX: number, centerY: number): ChordCurve {
    const start = towards(from, centerX, centerY, DOT_RADIUS + 2);
    const end = towards(to, centerX, centerY, DOT_RADIUS + 4);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const control = { x: midX + (centerX - midX) * CHORD_BOW, y: midY + (centerY - midY) * CHORD_BOW };

    return {
        path: `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`,
        at(t: number): Point {
            const u = 1 - t;
            return {
                x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
                y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
            };
        }
    };
}

/**
 * What the chord means, written on the chord. It starts at the middle and steps along the curve until it
 * is clear of the ones already written, so a bundle passing through the centre stays readable.
 */
function chordLabel(context: RenderContext, link: DiagramLink, curve: ChordCurve, placed: PlacedLabel[]): SVGGElement {
    const { palette, store } = context;
    const label = link.label ?? store.linkKindInfo(link.kind).label;
    const width = label.length * CHORD_LABEL_CHAR + 9;

    const candidates = CHORD_LABEL_STOPS.map(t => curve.at(t));
    const spot = candidates.find(candidate => !placed.some(item => Math.abs(item.y - candidate.y) < 13 && Math.abs(item.x - candidate.x) < (item.width + width) / 2))
        ?? curve.at(0.5);
    placed.push({ x: spot.x, y: spot.y, width });

    return group({ class: "tlg-link tlg-link-label", "data-link-id": link.id }, [
        rect(spot.x - width / 2, spot.y - 7, width, 14, { rx: 7, fill: palette.surface, opacity: 0.92 }),
        text(truncate(label, 9, width), spot.x, spot.y, { "font-size": 9, "text-anchor": "middle", "dominant-baseline": "central", fill: palette.inkMuted })
    ]);
}

function ringNode(context: RenderContext, node: DiagramNode, place: RingPlace): SVGGElement {
    const { palette, icons, store } = context;
    const color = nodeColor(palette, node);
    const outward = Math.cos(place.angle) >= 0;
    const degrees = place.angle * 180 / Math.PI;
    const labelX = place.x + Math.cos(place.angle) * LABEL_OFFSET;
    const labelY = place.y + Math.sin(place.angle) * LABEL_OFFSET;

    // A record name is never shortened. It takes another line before it takes an ellipsis, because a ring
    // of half written names says less than a ring carrying a bit more type.
    const lines = wrap(node.name, 10.5, RING_MARGIN - LABEL_OFFSET - 12, NAME_LINES);
    const name = group({ transform: `translate(${labelX}, ${labelY}) rotate(${outward ? degrees : degrees + 180})` }, lines.map((content, index) =>
        text(content, 0, (index - (lines.length - 1) / 2) * NAME_LINE_HEIGHT, {
            "font-size": 10.5,
            "font-weight": node.compromised ? 700 : 500,
            "text-anchor": outward ? "start" : "end",
            "dominant-baseline": "central",
            fill: node.compromised ? color : palette.ink
        })));

    return group({ class: "tlg-node", "data-node-id": node.id }, [
        circle(place.x, place.y, DOT_RADIUS + (node.compromised ? 2 : 0), { fill: node.compromised ? color : palette.tint(color, 0.72), stroke: color, "stroke-width": 1.4 }),
        icons.draw(store.nodeIcon(node), place.x, place.y, 9, node.compromised ? palette.onColor : color),
        name
    ]);
}

/**
 * A band of colour behind each run of records belonging to one side, so the ring still says who is who
 * without a label on every dot.
 */
function sideArcs(palette: Palette, ordered: readonly DiagramNode[], places: ReadonlyMap<RecordId, RingPlace>, centerX: number, centerY: number, radius: number): SVGGElement {
    const node = group();
    const step = (Math.PI * 2) / ordered.length;
    let start = 0;

    ordered.forEach((record, index) => {
        const next = ordered[index + 1];
        if (next && next.side === record.side) return;

        const firstOfRun = ordered[start];
        const from = (firstOfRun ? places.get(firstOfRun.id)?.angle ?? 0 : 0) - step / 2;
        const to = (places.get(record.id)?.angle ?? 0) + step / 2;
        node.appendChild(path(
            `M${centerX + Math.cos(from) * radius},${centerY + Math.sin(from) * radius} A${radius},${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${centerX + Math.cos(to) * radius},${centerY + Math.sin(to) * radius}`,
            { fill: "none", stroke: palette.tint(palette.sides[record.side].color, 0.5), "stroke-width": 3, "stroke-linecap": "round" }
        ));
        start = index + 1;
    });
    return node;
}

function drawNetwork(context: RenderContext, nodes: readonly DiagramNode[]): SVGGElement {
    const { store, palette } = context;

    const { root, content } = frame(context, {
        page: 0,
        pageCount: 1,
        subtitle: `${nodes.length} records, ${store.links.length} relationships on one ring`,
        legend: store.catalog.sides
            .filter(side => nodes.some(node => node.side === side.side))
            .map(side => ({ label: side.label, color: palette.sides[side.side].color, icon: side.icon }))
    });

    if (nodes.length === 0) {
        content.appendChild(placeholder(context, context.strings.scene.emptyGraphTitle, context.strings.scene.emptyGraphHint));
        return root;
    }

    const ordered = ringOrder(context, nodes);
    const centerX = CONTENT.x + CONTENT.width / 2;
    const centerY = CONTENT.y + CONTENT.height / 2;
    // The margin has to hold the labels standing off the ring, not half of them
    const radius = Math.min(CONTENT.height, CONTENT.width) / 2 - RING_MARGIN;

    const places = new Map<RecordId, RingPlace>();
    ordered.forEach((node, index) => {
        // Starting a quarter turn back puts the first side at the top rather than out on the right
        const angle = (index / ordered.length) * Math.PI * 2 - Math.PI / 2;
        places.set(node.id, { angle, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
    });

    content.appendChild(sideArcs(palette, ordered, places, centerX, centerY, radius));

    const chords = group();
    const drawable = store.links
        .map(link => ({ link, from: places.get(link.sourceNodeId), to: places.get(link.targetNodeId) }))
        .filter((entry): entry is { link: DiagramLink; from: RingPlace; to: RingPlace } => entry.from !== undefined && entry.to !== undefined)
        .map(entry => ({ link: entry.link, color: linkColor(context, entry.link), curve: chordCurve(entry.from, entry.to, centerX, centerY) }));

    chords.appendChild(arrowMarkers(EDGE_ARROW, drawable.map(entry => entry.color), { refX: 9, size: 4 }));
    drawable.forEach(({ link, color, curve }) => {
        const info = store.linkKindInfo(link.kind);
        chords.appendChild(group({ class: "tlg-link", "data-link-id": link.id }, [
            hitArea(curve.path),
            path(curve.path, {
                class: "tlg-link-line", fill: "none", stroke: color, "stroke-width": 1.3, "stroke-dasharray": link.confidence === Confidence.Confirmed ? null : "5 4", opacity: 0.55,
                "marker-end": info.directed ? `url(#${markerId(EDGE_ARROW, color)})` : null
            })
        ]));
    });
    content.appendChild(chords);

    ordered.forEach(node => {
        const place = places.get(node.id);
        if (place) content.appendChild(ringNode(context, node, place));
    });

    if (labelsShown(context)) {
        const placed: PlacedLabel[] = [];
        drawable.forEach(({ link, curve }) => content.appendChild(chordLabel(context, link, curve, placed)));
    }
    return root;
}

export const relationshipGraph = defineRenderer<GraphPage>({
    representation: Representation.RelationshipGraph,
    draggable: true,
    options: strings => [layoutOption(strings), labelsOption(strings)],

    pages(context) {
        const nodes = context.store.visibleNodes();
        // The ring holds everything at once. Splitting it would cut relationships in half, which is the
        // one thing this layout exists to show.
        if (optionValue(context, layoutOption(context.strings)) === GraphLayout.Network) {
            return [{ layout: GraphLayout.Network, nodes }];
        }

        const bands = buildBands(context, nodes);
        if (bands.length === 0) return [{ layout: GraphLayout.Bands, bands: [] }];

        const bandWidth = bandWidthFor(bands.length);
        const capacity = Math.floor(CONTENT.height / WEIGHT_UNIT);
        const columns = bands.map(band => {
            band.clusters.forEach(cluster => {
                cluster.weight = Math.ceil((clusterSize(cluster, bandWidth).height + CLUSTER_GAP) / WEIGHT_UNIT);
            });
            return paginateGroups(band.clusters, capacity);
        });

        const pageCount = Math.max(...columns.map(pages => pages.length));
        return Array.from({ length: pageCount }, (_, index) => ({
            layout: GraphLayout.Bands,
            bands: bands.map((band, bandIndex) => ({ side: band.side, clusters: columns[bandIndex]?.[index] ?? [] }))
        }));
    },

    draw(context, page, pageIndex, pageCount) {
        return page.layout === GraphLayout.Network ? drawNetwork(context, page.nodes) : drawBands(context, page.bands, pageIndex, pageCount);
    }
});
