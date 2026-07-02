import { MealDetailScreen } from "@/features/menu/MealDetailScreen";

/** /meal/[id] — meal detail, same path shape as the web app (spec §9.3),
 * which keeps future deep links consistent across platforms. Rendered in
 * the root stack (outside the tab navigator), so it slides over the tabs. */
export default MealDetailScreen;
