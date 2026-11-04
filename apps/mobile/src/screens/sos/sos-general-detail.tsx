// Layar Detail SOS Umum — dipakai pengirim DAN penerima (Pengguna
// Sekitar). Pengirim: jumlah responder + batal/selesai. Penerima:
// alasan, jarak, waktu, nama pengirim, "Saya menuju lokasi" /
// "Abaikan", tombol navigasi, banner penutup saat SOS selesai.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  analyzeSosPhoto,
  cancelGeneralSos,
  fetchGeneralSos,
  reportGeneralSos,
  resolveGeneralSos,
  respondGeneralSos,
  uploadSosPhoto,
  type GeneralSosDetail,
} from "@/utils/sos-api";
import { generalReasonLabelKey } from "@/utils/sos-logic";
import {
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function SosGeneralDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<GeneralSosDetail | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(false);
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await fetchGeneralSos(id));
    } catch (error) {
      setErrorKey(
        error instanceof ApiError
          ? error.i18nKey
          : "sos.general.errors.notFound",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<GeneralSosDetail>) => {
    if (busy) return;
    setBusy(true);
    try {
      setDetail(await fn());
    } catch (error) {
      setErrorKey(
        error instanceof ApiError
          ? error.i18nKey
          : "sos.general.errors.closed",
      );
    } finally {
      setBusy(false);
    }
  };

  // Laporkan SOS palsu/iseng — hanya penerima (bukan pengirim).
  const onReport = async () => {
    if (busy || reported || !detail) return;
    setBusy(true);
    try {
      await reportGeneralSos(detail.id);
      setReported(true);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError
          ? error.i18nKey
          : "sos.general.errors.closed",
      );
    } finally {
      setBusy(false);
    }
  };

  const openNavigation = () => {
    if (!detail) return;
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${detail.lat},${detail.lon}`,
    );
  };

  // AI-P: pengirim melampirkan foto kondisi (galeri, pola pengajuan
  // organizer); penerima/leader melihat foto + deskripsi AI di bawah.
  const onAttachPhoto = async () => {
    if (photoBusy || !detail) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPhotoBusy(true);
    try {
      await uploadSosPhoto("GENERAL", detail.id, {
        uri: asset.uri,
        name: asset.fileName ?? "sos.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      setErrorKey(null);
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const onAnalyzePhoto = async (photoId: string) => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      await analyzeSosPhoto(photoId);
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  if (errorKey) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{t(errorKey)}</Text>
        <Pressable
          style={styles.btnCancel}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.detail.backLabel"))}
        >
          <Text style={styles.btnCancelText}>
            {t("sos.general.detail.backLabel")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const closed = detail.status !== "ACTIVE";
  const reasonLabel = t(generalReasonLabelKey(detail.reason));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.detail.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} {...headingAccessibility(t("sos.general.detail.title"))}>
          {t("sos.general.detail.title")}
        </Text>
        <Text style={styles.headSub}>{reasonLabel}</Text>
      </View>

      <View style={styles.body}>
        {closed ? (
          <View style={styles.closedBox}>
            <Text style={styles.closedText}>
              {t("sos.general.detail.closed")}
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>{t("sos.general.detail.sender")}</Text>
        <Text style={styles.value}>{detail.senderName ?? "-"}</Text>

        <Text style={styles.label}>{t("sos.general.detail.location")}</Text>
        <Text style={styles.value}>
          {detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}
        </Text>

        <Text style={styles.label}>{t("sos.general.detail.time")}</Text>
        <Text style={styles.value}>{formatTime(detail.createdAt)}</Text>

        {!detail.viewerIsSender ? (
          <>
            <Text style={styles.label}>
              {detail.distanceKm !== null
                ? t("sos.general.detail.distance", {
                    km: detail.distanceKm.toFixed(1),
                  })
                : t("sos.general.detail.distanceUnknown")}
            </Text>
          </>
        ) : null}

        <Text style={styles.responders}>
          {t("sos.general.detail.responders", {
            count: String(detail.responderCount),
          })}
        </Text>

        {/* AI-P: foto kondisi + deskripsi AI (penerima/leader) */}
        <Text style={styles.label}>{t("sos.photo.title")}</Text>
        {(detail.photos ?? []).length === 0 ? (
          <Text style={styles.photoHint}>{t("sos.photo.attachHint")}</Text>
        ) : (
          (detail.photos ?? []).map((photo) => (
            <View key={photo.id} style={styles.photoCard}>
              <Image
                source={{ uri: photo.photoUrl }}
                style={styles.photoImage}
                accessibilityLabel={t("sos.photo.title")}
              />
              <Text style={styles.photoDescLabel}>
                {t("sos.photo.descriptionLabel")}
              </Text>
              <Text style={styles.photoDesc}>
                {photo.aiDescription ?? t("sos.photo.unavailable")}
              </Text>
              {photo.model ? (
                <Text style={styles.photoAttr}>{t("sos.photo.attribution")}</Text>
              ) : null}
              {detail.viewerIsSender && photo.aiStatus !== "AVAILABLE" ? (
                <Pressable
                  style={[styles.btnPhoto, photoBusy && styles.btnDisabled]}
                  onPress={() => void onAnalyzePhoto(photo.id)}
                  disabled={photoBusy}
                  {...buttonAccessibility(t("sos.photo.analyzeAgain"), {
                    disabled: photoBusy,
                  })}
                >
                  <Text style={styles.btnPhotoText}>
                    {t("sos.photo.analyzeAgain")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        {!closed && detail.viewerIsSender ? (
          <Pressable
            style={[styles.btnPhoto, photoBusy && styles.btnDisabled]}
            onPress={() => void onAttachPhoto()}
            disabled={photoBusy}
            {...buttonAccessibility(t("sos.photo.attach"), {
              disabled: photoBusy,
            })}
          >
            <Text style={styles.btnPhotoText}>{t("sos.photo.attach")}</Text>
          </Pressable>
        ) : null}

        {!closed && !detail.viewerIsSender ? (
          detail.viewerResponded ? (
            <Text style={styles.info}>{t("sos.general.detail.goingDone")}</Text>
          ) : ignored ? (
            <Text style={styles.info}>{t("sos.general.detail.ignored")}</Text>
          ) : (
            <>
              <Pressable
                style={[styles.btnSend, busy && styles.btnDisabled]}
                onPress={() => void act(() => respondGeneralSos(detail.id, "GOING"))}
                disabled={busy}
                {...buttonAccessibility(t("sos.general.detail.going"), {
                  disabled: busy,
                })}
              >
                <Text style={styles.btnSendText}>
                  {t("sos.general.detail.going")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btnIgnore, busy && styles.btnDisabled]}
                onPress={async () => {
                  await act(() => respondGeneralSos(detail.id, "IGNORE"));
                  setIgnored(true);
                }}
                disabled={busy}
                {...buttonAccessibility(t("sos.general.detail.ignore"), {
                  disabled: busy,
                })}
              >
                <Text style={styles.btnIgnoreText}>
                  {t("sos.general.detail.ignore")}
                </Text>
              </Pressable>
            </>
          )
        ) : null}

        {!detail.viewerIsSender ? (
          <Pressable
            style={styles.btnNav}
            onPress={openNavigation}
            {...buttonAccessibility(t("sos.general.detail.navigate"))}
          >
            <Text style={styles.btnNavText}>
              {t("sos.general.detail.navigate")}
            </Text>
          </Pressable>
        ) : null}

        {!detail.viewerIsSender ? (
          reported ? (
            <Text style={styles.info}>
              {t("sos.general.detail.reportSent")}
            </Text>
          ) : (
            <Pressable
              style={[styles.btnReport, busy && styles.btnDisabled]}
              onPress={() => void onReport()}
              disabled={busy}
              {...buttonAccessibility(t("sos.general.detail.reportFalse"), {
                disabled: busy,
              })}
            >
              <Text style={styles.btnReportText}>
                {t("sos.general.detail.reportFalse")}
              </Text>
            </Pressable>
          )
        ) : null}

        {!closed && detail.viewerIsSender ? (
          <>
            <Pressable
              style={[styles.btnIgnore, busy && styles.btnDisabled]}
              onPress={() => void act(() => cancelGeneralSos(detail.id))}
              disabled={busy}
              {...buttonAccessibility(t("sos.general.detail.cancelSos"), {
                disabled: busy,
              })}
            >
              <Text style={styles.btnIgnoreText}>
                {t("sos.general.detail.cancelSos")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btnSend, busy && styles.btnDisabled]}
              onPress={() => void act(() => resolveGeneralSos(detail.id))}
              disabled={busy}
              {...buttonAccessibility(t("sos.general.detail.resolveSos"), {
                disabled: busy,
              })}
            >
              <Text style={styles.btnSendText}>
                {t("sos.general.detail.resolveSos")}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: 26 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
    head: {
      backgroundColor: c.stSosDark,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,.16)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    backGlyph: { fontSize: 24, fontWeight: "700", color: "#fff" },
    headTitle: {
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.21,
      color: "#fff",
    },
    headSub: {
      fontSize: 15,
      fontWeight: "700",
      color: "rgba(255,255,255,.9)",
      marginTop: 5,
    },
    body: { paddingTop: 16, paddingHorizontal: 20 },
    closedBox: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    closedText: { color: c.text2, fontSize: 13, fontWeight: "700" },
    errText: { color: c.stSosDark, fontSize: 14, fontWeight: "700", textAlign: "center" },
    label: {
      color: c.text3,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
      marginTop: 14,
    },
    value: { color: c.text, fontSize: 15, fontWeight: "700", marginTop: 4 },
    responders: {
      color: c.text,
      fontSize: 15,
      fontWeight: "800",
      marginTop: 18,
    },
    photoHint: { color: c.text2, fontSize: 13, fontWeight: "700", marginTop: 6 },
    photoCard: { marginTop: 12 },
    photoImage: {
      width: "100%",
      height: 220,
      borderRadius: radii.md,
      backgroundColor: c.surface2,
    },
    photoDescLabel: {
      color: c.text3,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
      marginTop: 10,
    },
    photoDesc: { color: c.text, fontSize: 14, fontWeight: "700", marginTop: 4 },
    photoAttr: { color: c.text2, fontSize: 12, fontWeight: "700", marginTop: 6 },
    btnPhoto: {
      width: "100%",
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 14,
      marginTop: 10,
      alignItems: "center",
    },
    btnPhotoText: { color: c.text, fontSize: 14, fontWeight: "800" },
    info: { color: c.text2, fontSize: 14, fontWeight: "700", marginTop: 16 },
    btnSend: {
      width: "100%",
      backgroundColor: c.stSos,
      borderRadius: radii.md,
      padding: 16,
      marginTop: 16,
      alignItems: "center",
    },
    btnSendText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
    btnIgnore: {
      width: "100%",
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 16,
      marginTop: 10,
      alignItems: "center",
    },
    btnIgnoreText: { color: c.text, fontSize: 15, fontWeight: "800" },
    btnNav: {
      width: "100%",
      backgroundColor: c.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.line,
      padding: 16,
      marginTop: 10,
      alignItems: "center",
    },
    btnNavText: { color: c.text, fontSize: 15, fontWeight: "800" },
    btnReport: {
      marginTop: 18,
      backgroundColor: "transparent",
      alignItems: "center",
      paddingVertical: 8,
    },
    btnReportText: {
      color: c.stSosDark,
      fontSize: 13,
      fontWeight: "800",
      textDecorationLine: "underline",
    },
    btnDisabled: { opacity: 0.6 },
    btnCancel: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
    btnCancelText: { color: c.text2, fontSize: 14, fontWeight: "700" },
  });
