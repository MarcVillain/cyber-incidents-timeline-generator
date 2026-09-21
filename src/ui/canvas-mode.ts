/** How the scene meets the page it is drawn on. */
export enum CanvasMode {
    /** Cut into pages of a fixed size, which is what a deck and a printer want. */
    Slides = "slides",
    /** One page as tall as the content needs, panned and zoomed in the stage. */
    Continuous = "continuous"
}
