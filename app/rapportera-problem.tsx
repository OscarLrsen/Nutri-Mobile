import { FeedbackFormScreen } from "@/features/feedback/FeedbackFormScreen";

/** Report a problem — opened from Profil ("Feedback och support").
 * Customer copy says "problem"; the backend type is BugReport. */
export default function ReportProblemRoute() {
  return <FeedbackFormScreen type="BugReport" />;
}
