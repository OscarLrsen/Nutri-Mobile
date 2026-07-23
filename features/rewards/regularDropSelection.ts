/**
 * Local selection rule for the Regular Drop vote flow: tapping a card only
 * updates the LOCAL selection — never a POST. Exactly one option is
 * selected after the first tap: tapping another option moves the mark,
 * tapping the already-selected option keeps it selected (no toggle-off —
 * the confirm button should never silently disable again).
 */
export function selectDropOption(current: string | null, tapped: string): string {
  return current === tapped ? current : tapped;
}

/** The confirm button is enabled only once something is selected. */
export function canConfirmSelection(selected: string | null): boolean {
  return selected !== null;
}
