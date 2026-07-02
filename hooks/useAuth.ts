/**
 * Re-exported here so feature code imports auth the same way it imports
 * every other shared hook (`@/hooks/useAuth`), without needing to know the
 * hook happens to live next to its provider in services/auth/. The
 * canonical implementation is services/auth/AuthProvider.tsx.
 */
export { useAuth } from "@/services/auth/AuthProvider";
