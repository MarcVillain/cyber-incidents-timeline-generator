/** How the workspace offers its representations to switch between. */
export enum ViewPicker {
    /** Every view as a pill on one line, scrolled sideways when they do not fit. */
    Scroll = "scroll",
    /** One dropdown naming the view on screen, which keeps the toolbar short. */
    Menu = "menu"
}
