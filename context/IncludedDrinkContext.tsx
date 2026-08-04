import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/services/auth/AuthProvider";
import { useCart } from "./CartContext";

/**
 * The customer's choice about the included GoWell (patch 17B).
 *
 * Three states, because "no flavour picked yet" and "I do not want one" are
 * different things: the first should keep nudging, the second must not. A
 * single nullable would have collapsed them and either nagged a customer who
 * already declined or silently skipped the offer.
 *
 * Deliberately NOT persisted. It names a cart line and depends on a server
 * window that can close between sessions; restoring a stale choice would show
 * an offer the server is about to refuse.
 */
export type IncludedDrinkSelection =
  | { type: "none" }
  | { type: "declined" }
  | { type: "selected"; drinkId: string; clientLineId: string };

interface IncludedDrinkContextType {
  selection: IncludedDrinkSelection;
  select: (drinkId: string, clientLineId: string) => void;
  decline: () => void;
  /** Back to undecided — used when the offer is re-opened before submit. */
  reset: () => void;
}

const IncludedDrinkContext = createContext<IncludedDrinkContextType | null>(null);

export function IncludedDrinkProvider({ children }: { children: ReactNode }) {
  const { items } = useCart();
  const { user } = useAuth();
  const [selection, setSelection] = useState<IncludedDrinkSelection>({ type: "none" });

  // Drop a selection whose line has left the cart. That covers clearing the
  // cart, removing the drink and completing an order in one rule. Changing a
  // quantity does NOT clear it: the line is still there and exactly one
  // portion is still included.
  useEffect(() => {
    if (selection.type !== "selected") return;
    if (!items.some((i) => i.clientLineId === selection.clientLineId)) {
      setSelection({ type: "none" });
    }
  }, [items, selection]);

  // The offer belongs to a session, not to a device. Signing out or switching
  // account starts over.
  const userId = user?.id ?? null;
  useEffect(() => {
    setSelection({ type: "none" });
  }, [userId]);

  const select = useCallback(
    (drinkId: string, clientLineId: string) =>
      setSelection({ type: "selected", drinkId, clientLineId }),
    []
  );
  const decline = useCallback(() => setSelection({ type: "declined" }), []);
  const reset = useCallback(() => setSelection({ type: "none" }), []);

  return (
    <IncludedDrinkContext.Provider value={{ selection, select, decline, reset }}>
      {children}
    </IncludedDrinkContext.Provider>
  );
}

export function useIncludedDrink() {
  const ctx = useContext(IncludedDrinkContext);
  if (!ctx) throw new Error("useIncludedDrink must be used within IncludedDrinkProvider");
  return ctx;
}
