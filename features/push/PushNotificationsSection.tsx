import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import {
  getMyPushDevices,
  setPushDevicePreferences,
  type ApiPushDevice,
} from "@/services/api/pushDevices";
import {
  getPushPermissionStatus,
  getStoredPushToken,
  registerCurrentDeviceForPush,
  requestPushPermission,
  type PushPermissionStatus,
} from "@/services/push/pushNotifications";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Profile → Notiser (patch 10). Honest about the two layers involved:
 *
 * - The OS permission ALWAYS wins — denied at OS level means no pushes no
 *   matter what the toggles say, so that state replaces the toggles with an
 *   "open settings" row (we cannot re-show the system prompt after deny).
 * - The three category toggles are per-DEVICE backend preferences for THIS
 *   device's token only, loaded from GET /api/push-devices/me.
 * - On simulators/web ("unavailable") the section hides entirely rather
 *   than advertising something that cannot work.
 *
 * Permission status re-checks when the app returns from background — the
 * user may have flipped it in OS settings and come back.
 */

const DEVICES_QUERY_KEY = ["pushDevices", "me"] as const;

export function PushNotificationsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PushPermissionStatus | null>(null);

  const refreshPermission = useCallback(() => {
    getPushPermissionStatus()
      .then(setPermission)
      .catch(() => setPermission("unavailable"));
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  // Granted → make sure this device exists in the backend registry (silent
  // no-op when it already does), then load its per-category preferences.
  useEffect(() => {
    if (permission !== "granted") return;
    registerCurrentDeviceForPush()
      .then((registered) => {
        if (registered) {
          queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [permission, queryClient]);

  const devicesQuery = useQuery({
    queryKey: DEVICES_QUERY_KEY,
    queryFn: getMyPushDevices,
    enabled: permission === "granted",
  });

  const [ownToken, setOwnToken] = useState<string | null>(null);
  useEffect(() => {
    getStoredPushToken().then(setOwnToken).catch(() => {});
  }, [permission]);

  const ownDevice: ApiPushDevice | null =
    (ownToken && devicesQuery.data?.find((d) => d.expoPushToken === ownToken && d.isActive)) || null;

  const prefsMutation = useMutation({
    mutationFn: setPushDevicePreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData<ApiPushDevice[]>(DEVICES_QUERY_KEY, (prev) =>
        prev?.map((d) => (d.expoPushToken === updated.expoPushToken ? updated : d))
      );
    },
    onError: () => {
      // Backend state stands — refetch so the switches snap back to truth.
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY }).catch(() => {});
    },
  });

  const toggle = (patch: Partial<Pick<ApiPushDevice, "orderUpdatesEnabled" | "weeklyRewardsEnabled" | "profileRemindersEnabled">>) => {
    if (!ownDevice) return;
    prefsMutation.mutate({
      expoPushToken: ownDevice.expoPushToken,
      orderUpdatesEnabled: ownDevice.orderUpdatesEnabled,
      weeklyRewardsEnabled: ownDevice.weeklyRewardsEnabled,
      profileRemindersEnabled: ownDevice.profileRemindersEnabled,
      ...patch,
    });
  };

  const enableFromUndetermined = async () => {
    const status = await requestPushPermission();
    setPermission(status);
    if (status === "granted") {
      await registerCurrentDeviceForPush();
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY }).catch(() => {});
    }
  };

  // Simulator/web (or still resolving) — nothing honest to show.
  if (permission === null || permission === "unavailable") return null;

  return (
    <>
      <ThemedText style={styles.sectionHead}>{t("push.profile.sectionTitle").toUpperCase()}</ThemedText>
      <View style={styles.card}>
        {/* Release P20: ONE master on/off that always shows the honest
            state. Off when the OS denied or never asked — flipping it on
            asks the system (undetermined) or guides to Inställningar
            (denied); it can never pretend to be active without permission.
            When on, the two extra categories appear beneath it. */}
        {permission === "denied" ? (
          <>
            <ToggleRow
              label={t("push.profile.masterLabel")}
              hint={t("push.profile.osDenied")}
              value={false}
              disabled={false}
              onChange={() => Linking.openSettings().catch(() => {})}
              bordered
            />
            <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              style={styles.row}
              accessibilityRole="button"
            >
              <ThemedText style={styles.rowText}>{t("push.profile.openSettings")}</ThemedText>
              <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </>
        ) : permission === "undetermined" ? (
          <ToggleRow
            label={t("push.profile.masterLabel")}
            hint={t("push.profile.osUndetermined")}
            value={false}
            disabled={false}
            onChange={(next) => {
              if (next) void enableFromUndetermined();
            }}
          />
        ) : !ownDevice ? (
          // Granted, but this device isn't in the registry (offline at
          // registration, signed out then in, …) — honest hint; the effect
          // above retries registration on every mount.
          <View style={styles.row}>
            <ThemedText style={styles.hint}>
              {devicesQuery.isPending ? t("push.profile.loading") : t("push.profile.deviceMissing")}
            </ThemedText>
          </View>
        ) : (
          <>
            <ToggleRow
              label={t("push.profile.masterLabel")}
              hint={
                prefsMutation.isError
                  ? t("push.profile.updateError")
                  : t("push.profile.toggleOrdersHint")
              }
              hintError={prefsMutation.isError}
              value={ownDevice.orderUpdatesEnabled}
              disabled={prefsMutation.isPending}
              // Master OFF must silence EVERYTHING: the backend fan-outs for
              // weekly rewards and profile reminders check only their own
              // columns, so leaving them true would keep pushing while the
              // UI honestly claims "av". Re-enabling the master does NOT
              // resurrect them — the customer opts back in per category.
              onChange={(v) =>
                toggle(
                  v
                    ? { orderUpdatesEnabled: true }
                    : {
                        orderUpdatesEnabled: false,
                        weeklyRewardsEnabled: false,
                        profileRemindersEnabled: false,
                      }
                )
              }
              bordered={ownDevice.orderUpdatesEnabled}
            />
            {ownDevice.orderUpdatesEnabled ? (
              <>
                <ToggleRow
                  label={t("push.profile.toggleWeekly")}
                  hint={t("push.profile.toggleWeeklyHint")}
                  value={ownDevice.weeklyRewardsEnabled}
                  disabled={prefsMutation.isPending}
                  onChange={(v) => toggle({ weeklyRewardsEnabled: v })}
                  bordered
                />
                <ToggleRow
                  label={t("push.profile.toggleProfile")}
                  hint={t("push.profile.toggleProfileHint")}
                  value={ownDevice.profileRemindersEnabled}
                  disabled={prefsMutation.isPending}
                  onChange={(v) => toggle({ profileRemindersEnabled: v })}
                />
              </>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

function ToggleRow({
  label,
  hint,
  hintError,
  value,
  disabled,
  onChange,
  bordered,
}: {
  label: string;
  hint: string;
  hintError?: boolean;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.row, bordered && styles.rowBorder]}>
      <View style={{ flex: 1, paddingRight: spacing[3] }}>
        <ThemedText style={styles.rowText}>{label}</ThemedText>
        <ThemedText style={[styles.hintSmall, hintError && { color: "#f87171" }]}>{hint}</ThemedText>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "rgba(255,255,255,0.12)", true: colors.accent }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    marginHorizontal: 4,
    marginTop: spacing[4],
    marginBottom: spacing[2],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rowText: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  hint: { flex: 1, fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.4)" },
  hintSmall: { marginTop: 2, fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.3)" },
});
