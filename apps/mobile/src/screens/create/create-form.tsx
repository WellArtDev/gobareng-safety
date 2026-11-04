// Form Buat Trip — mockup data-screen="create-trip": tier-row status
// akun, DETAIL TRIP (nama, gunung+jalur terkunci dari wizard, tanggal+
// jam, titik kumpul, deskripsi, kuota), VISIBILITAS TRIP (Private aktif;
// Public terkunci verifikasi; Berbayar PRO terkunci upgrade), Lanjut ke
// Ringkasan. Public/Paid terkunci: API belum punya verified/Pro per
// user di sesi — opsi tampil terkunci persis mockup.
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";

import { Field, FormError } from "@/components/AuthUi";
import { TripWeatherSection } from "@/components/TripWeatherSection";
import { NextButton, WizardAppbar, WizardFoot } from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { validateCreateTrip } from "@/utils/create-trip-logic";
import {
  formatPickerDate,
  formatPickerTime,
  initialPickerValue,
} from "@/utils/datetime-pick";
import { type Mountain } from "@/utils/mountains";
import { fetchMountain, type MountainDetail } from "@/utils/mountains-api";
import { apiMountainToCatalog } from "@/utils/mountains-catalog";
import { resolveCreateTripWeatherCoords } from "@/utils/trip-weather-coords";
import { fetchMe } from "@/utils/profile-api";
import { isPhoneMissing } from "@/utils/invite-api";

export function CreateFormScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const {
    mountainId,
    routeId,
    tripType,
    name: pName,
    date: pDate,
    time: pTime,
    meet: pMeet,
    tujuan: pTujuan,
    tujuanLat: pTujuanLat,
    tujuanLon: pTujuanLon,
    tikumLat: pTikumLat,
    tikumLon: pTikumLon,
    desc: pDesc,
    quota: pQuota,
  } = useLocalSearchParams<{
    mountainId: string;
    routeId: string;
    tripType: string;
    name: string;
    date: string;
    time: string;
    meet: string;
    tujuan: string;
    tujuanLat: string;
    tujuanLon: string;
    tikumLat: string;
    tikumLon: string;
    desc: string;
    quota: string;
  }>();
  const isTouring = tripType === "TOURING";
  // Sumber = detail API §10. Katalog statis dihapus 3 Nov 2026: gagal
  // memuat berarti tidak ada gunung/jalur yang bisa dipilih — form
  // menampilkan error dan tombol lanjut diblokir, bukan data contoh.
  // Detail mentah disimpan juga untuk koordinat cuaca (katalog hasil
  // konversi tidak membawa lat/lon maupun pos jalur).
  const [apiDetail, setApiDetail] = useState<MountainDetail | null>(null);
  const [mountainFailed, setMountainFailed] = useState(false);
  useEffect(() => {
    if (!mountainId) return;
    let alive = true;
    fetchMountain(mountainId)
      .then((detail) => {
        if (alive) setApiDetail(detail);
      })
      .catch(() => {
        if (alive) {
          setMountainFailed(true);
          setErrorKey("errors.unavailable");
        }
      });
    return () => {
      alive = false;
    };
  }, [mountainId]);
  // Banner awal HP (2 Nov 2026, non-blocking): ingatkan sejak form
  // bahwa buat trip butuh HP tersimpan; gate keras ada di Ringkasan.
  const [phoneMissing, setPhoneMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => {
        if (alive) setPhoneMissing(isPhoneMissing(me.phone));
      })
      .catch(() => {
        // Fail-open: biarkan Ringkasan/API yang menegakkan.
      });
    return () => {
      alive = false;
    };
  }, []);

  const apiMountain = useMemo(
    () => (apiDetail ? apiMountainToCatalog(apiDetail) : null),
    [apiDetail],
  );
  const mountain = apiMountain;
  const route =
    mountain?.routes.find((r) => r.id === routeId) ?? mountain?.routes[0];

  const [name, setName] = useState(
    pName ??
      (mountain
        ? `Pendakian ${mountain.name} — ${route?.name ?? ""}`
        : pTujuan
          ? `Touring — ${pTujuan}`
          : ""),
  );
  const [date, setDate] = useState(pDate ?? "");
  const [time, setTime] = useState(pTime ?? "");
  const [meet, setMeet] = useState(pMeet ?? route?.meetingPoint ?? "");
  const [tujuan] = useState(pTujuan ?? "");
  const [tujuanLat] = useState(pTujuanLat ?? "");
  const [tujuanLon] = useState(pTujuanLon ?? "");
  const [tikumLat] = useState(pTikumLat ?? "");
  const [tikumLon] = useState(pTikumLon ?? "");
  const [desc, setDesc] = useState(pDesc ?? "");
  // SET-8 (keputusan Wella 1 Nov 2026): rekomendasi 10, bisa diubah,
  // tanpa batas maksimum. Catatan alasan dirender di bawah field.
  const [quota, setQuota] = useState(pQuota ?? "10");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Picker tanggal/jam: ketuk kolom membuka picker; batal tidak mengubah
  // nilai. Android memakai dialog bawaan (onChange type "set"/"dismissed");
  // iOS memakai modal spinner dengan tombol Batal/Pilih supaya roda yang
  // diputar tanpa konfirmasi tidak langsung mengubah nilai.
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [tempValue, setTempValue] = useState(new Date());
  const openPicker = (kind: "date" | "time") => {
    setTempValue(initialPickerValue(kind, date, time, new Date()));
    setPicker(kind);
  };
  const commitPicker = (value: Date) => {
    if (picker === "date") setDate(formatPickerDate(value));
    if (picker === "time") setTime(formatPickerTime(value));
    setPicker(null);
  };
  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") {
      setPicker(null);
      return;
    }
    if (selected) commitPicker(selected);
    else setPicker(null);
  };

  // Cuaca tujuan (kondisi saat ini, fail-soft -> null = disembunyikan).
  // Touring: titik tujuan; hiking: koordinat gunung dari detail API,
  // fallback pos jalur terpilih (utamakan pos kumpul kaki gunung).
  // Tanpa detail API, cuaca disembunyikan.
  const apiRoute =
    apiDetail?.routes.find((r) => r.id === route?.id) ??
    apiDetail?.routes[0];
  const weatherCoords = useMemo(
    () =>
      resolveCreateTripWeatherCoords({
        isTouring,
        tujuanLat,
        tujuanLon,
        mountainLat: apiDetail?.lat ?? null,
        mountainLon: apiDetail?.lon ?? null,
        routePosts: apiRoute?.posts,
      }),
    [isTouring, tujuanLat, tujuanLon, apiDetail, apiRoute],
  );

  // Nilai form saat ini, dibawa saat pindah ke layar pilih lokasi
  // (tikum/tujuan) supaya tidak hilang saat kembali ke form.
  // mountainId/routeId WAJIB ikut: tanpa itu form hiking kehilangan
  // gunungnya saat kembali dari peta. mountainLat/Lon untuk pusat peta
  // (basecamp, bukan GPS perangkat) saat pilih titik kumpul hiking.
  const formParams = {
    tripType: isTouring ? "TOURING" : "HIKING",
    mountainId: mountainId ?? "",
    routeId: route?.id ?? "",
    mountainLat: apiDetail?.lat != null ? String(apiDetail.lat) : "",
    mountainLon: apiDetail?.lon != null ? String(apiDetail.lon) : "",
    name,
    date,
    time,
    meet,
    tujuan,
    tujuanLat,
    tujuanLon,
    tikumLat,
    tikumLon,
    desc,
    quota,
  };

  const toSummary = () => {
    // Hiking tanpa data gunung dari API tidak bisa lanjut: nama,
    // titik kumpul, dan ringkasan bergantung pada katalog API.
    if (!isTouring && (mountainFailed || !mountain)) {
      setErrorKey("errors.unavailable");
      return;
    }
    const invalid = validateCreateTrip({
      name,
      date,
      time,
      meetingPoint: meet,
      quota: Number(quota),
      tripType: isTouring ? "TOURING" : "HIKING",
      destination: tujuan,
    });
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    setErrorKey(null);
    router.push({
      pathname: "/create-trip/summary",
      params: {
        mountainId: mountainId ?? "",
        routeId: route?.id ?? "",
        mountainName: mountain?.name ?? "",
        routeName: route?.name ?? "",
        tripType: isTouring ? "TOURING" : "HIKING",
        name: name.trim(),
        date,
        time,
        meet: meet.trim(),
        meetLat: tikumLat,
        meetLon: tikumLon,
        destination: tujuan.trim(),
        destinationLat: tujuanLat,
        destinationLon: tujuanLon,
        weatherLat: weatherCoords ? String(weatherCoords.lat) : "",
        weatherLon: weatherCoords ? String(weatherCoords.lon) : "",
        desc: desc.trim(),
        quota,
      },
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <WizardAppbar title={t("create.title")} backLabel={t("create.backLabel")} />

      {/* .tier-row */}
      <View style={styles.tierRow}>
        <Text style={styles.tierLabel}>{t("create.tierLabel")}</Text>
        <View style={styles.tierPill}>
          <Text style={styles.tierPillText}>{t("create.tierFree")}</Text>
        </View>
      </View>

      {phoneMissing ? (
        <Pressable onPress={() => router.push("/profile-data")}>
          <Text style={styles.phoneNote}>{t("create.phoneRequired")}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.secTitle}>{t("create.detailTitle")}</Text>
      <FormError message={errorKey ? t(errorKey) : null} />
      <Field
        label={t("create.name")}
        value={name}
        onChangeText={setName}
        placeholder={t("create.namePlaceholder")}
        autoCapitalize="words"
      />
      {/* Gunung + jalur dari wizard — baris info terkunci (hiking).
          Touring: tujuan dari layar pilih lokasi, bisa diubah. */}
      {isTouring ? (
        <View>
          <Field
            label={t("create.destination")}
            value={tujuan}
            onChangeText={() => {}}
            placeholder=""
          />
          <Pressable
            style={styles.mapLink}
            onPress={() =>
              router.push({
                pathname: "/create-trip/touring-location",
                params: { ...formParams, field: "tujuan", mode: "return" },
              })
            }
          >
            <Text style={styles.mapLinkText}>{t("create.change")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fieldRow}>
          <View style={styles.half}>
            <Field
              label={t("create.mountain")}
              value={mountain?.name ?? ""}
              onChangeText={() => {}}
              placeholder=""
            />
          </View>
          <View style={styles.half}>
            <Field
              label={t("create.route")}
              value={route?.name ?? ""}
              onChangeText={() => {}}
              placeholder=""
            />
          </View>
        </View>
      )}
      {/* Cuaca tujuan saat ini — hilang total bila tak ada koordinat
          valid atau cuaca gagal dimuat; tidak memblokir form. */}
      {weatherCoords ? (
        <TripWeatherSection lat={weatherCoords.lat} lon={weatherCoords.lon} />
      ) : null}
      <View style={styles.fieldRow}>
        <View style={styles.pickerHalf}>
          <Text style={styles.label}>{t("create.date")}</Text>
          <Pressable
            style={styles.pickerBox}
            onPress={() => openPicker("date")}
            accessibilityRole="button"
            accessibilityLabel={t("create.date")}
          >
            <Text style={date ? styles.pickerValue : styles.pickerPlaceholder}>
              {date || "2026-11-08"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.pickerHalf}>
          <Text style={styles.label}>{t("create.time")}</Text>
          <Pressable
            style={styles.pickerBox}
            onPress={() => openPicker("time")}
            accessibilityRole="button"
            accessibilityLabel={t("create.time")}
          >
            <Text style={time ? styles.pickerValue : styles.pickerPlaceholder}>
              {time || "05:30"}
            </Text>
          </Pressable>
        </View>
      </View>
      {picker && Platform.OS === "android" ? (
        <DateTimePicker
          value={tempValue}
          mode={picker}
          is24Hour
          onChange={onAndroidChange}
        />
      ) : null}
      {picker && Platform.OS === "ios" ? (
        <Modal transparent animationType="slide" visible>
          <View style={styles.pickerModalBackdrop}>
            <View style={styles.pickerModal}>
              <View style={styles.pickerModalBar}>
                <Pressable onPress={() => setPicker(null)}>
                  <Text style={styles.pickerModalAction}>
                    {t("create.pickerCancel")}
                  </Text>
                </Pressable>
                <Pressable onPress={() => commitPicker(tempValue)}>
                  <Text style={styles.pickerModalAction}>
                    {t("create.pickerDone")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempValue}
                mode={picker}
                display="spinner"
                is24Hour
                onChange={(_, selected) => {
                  if (selected) setTempValue(selected);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
      <Field
        label={t("create.meet")}
        value={meet}
        onChangeText={setMeet}
        placeholder=""
        autoCapitalize="words"
      />
      {/* Titik kumpul bisa dipilih lewat peta (hiking + touring):
          dulu hiking hanya ketikan manual, sehingga trip hiking tidak
          pernah punya koordinat titik kumpul. */}
      <Pressable
        style={styles.mapLink}
        onPress={() =>
          router.push({
            pathname: "/create-trip/touring-location",
            params: { ...formParams, field: "tikum", mode: "return" },
          })
        }
      >
        <Text style={styles.mapLinkText}>📍 {t("create.pickOnMap")}</Text>
      </Pressable>
      {/* Deskripsi: textarea mockup */}
      <View style={styles.field}>
        <Text style={styles.label}>{t("create.desc")}</Text>
        <TextInput
          style={styles.textarea}
          value={desc}
          onChangeText={setDesc}
          placeholder={t("create.descPlaceholder")}
          placeholderTextColor={colors.text3}
          multiline
        />
      </View>
      <Field
        label={t("create.quota")}
        value={quota}
        onChangeText={setQuota}
        placeholder="10"
        keyboardType="number-pad"
      />
      <Text style={styles.quotaNote}>{t("create.quotaNote")}</Text>

      <Text style={styles.secTitle}>{t("create.visTitle")}</Text>
      {/* Private — terpilih */}
      <View style={[styles.visOpt, styles.visOptSel]}>
        <View style={[styles.radio, styles.radioSel]}>
          <View style={styles.radioDot} />
        </View>
        <View style={styles.visTxt}>
          <Text style={styles.visName}>{t("create.visPrivate")}</Text>
          <Text style={styles.visDesc}>{t("create.visPrivateDesc")}</Text>
        </View>
      </View>
      {/* Public — terkunci verifikasi */}
      <View style={[styles.visOpt, styles.visLocked]}>
        <View style={styles.radio} />
        <View style={styles.visTxt}>
          <Text style={styles.visName}>{t("create.visPublic")}</Text>
          <Text style={styles.visDesc}>{t("create.visPublicDesc")}</Text>
          <Text style={styles.visLock}>🔒 {t("create.visPublicLock")}</Text>
        </View>
      </View>
      {/* Berbayar PRO — terkunci upgrade */}
      <View style={[styles.visOpt, styles.visLocked]}>
        <View style={styles.radio} />
        <View style={styles.visTxt}>
          <View style={styles.visNameRow}>
            <Text style={styles.visName}>{t("create.visPaid")}</Text>
            <View style={styles.pro}>
              <Text style={styles.proText}>{t("create.visPaidPro")}</Text>
            </View>
          </View>
          <Text style={styles.visDesc}>{t("create.visPaidDesc")}</Text>
          <Pressable onPress={() => router.push("/upgrade")}>
            <Text style={styles.visLock}>
              🔒 {t("create.visPaidLock")}{" "}
              <Text style={styles.visUpg}>{t("create.visPaidUpgrade")}</Text>
            </Text>
          </Pressable>
        </View>
      </View>

      <WizardFoot>
        <NextButton label={t("create.toSummary")} onPress={toSummary} />
      </WizardFoot>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  // .tier-row
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    ...shadowCard,
  },
  tierLabel: { fontSize: 13, fontWeight: "700", color: c.text2 },
  tierPill: {
    backgroundColor: c.surface2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  tierPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.text2,
  },
  // .sec-title-in
  quotaNote: {
    fontSize: 12,
    lineHeight: 17,
    color: c.text3,
    marginTop: 6,
  },
  phoneNote: {
    fontSize: 12.5,
    fontWeight: "700",
    color: c.warning,
    lineHeight: 12.5 * 1.55,
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 18,
    marginBottom: 10,
  },
  fieldRow: { flexDirection: "row", gap: 11 },
  half: { flex: 1 },
  // Tautan pilih/ubah lokasi via peta (touring).
  mapLink: { marginTop: -6, marginBottom: 13, alignSelf: "flex-start" },
  mapLinkText: { fontSize: 13, fontWeight: "800", color: c.primary },
  field: { marginBottom: 13 },
  label: {
    fontSize: 12.5,
    fontWeight: "800",
    color: c.text2,
    marginBottom: 6,
  },
  pickerHalf: { flex: 1, marginBottom: 13 },
  // Kolom picker tanggal/jam — gaya kotak sama seperti field lain.
  pickerBox: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerValue: { fontSize: 14, color: c.text },
  pickerPlaceholder: { fontSize: 14, color: c.text3 },
  // Modal spinner iOS: lembar bawah di atas backdrop redup.
  pickerModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerModal: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingBottom: 20,
  },
  pickerModalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerModalAction: { fontSize: 15, fontWeight: "800", color: c.primary },
  // .field textarea min-height 84
  textarea: {
    width: "100%",
    minHeight: 84,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: c.text,
    lineHeight: 14 * 1.55,
    textAlignVertical: "top",
  },
  // .vis-opt
  visOpt: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    ...shadowCard,
  },
  visOptSel: { borderColor: c.primary },
  visLocked: { opacity: 0.62 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSel: { borderColor: c.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.primary,
  },
  visTxt: { flex: 1, minWidth: 0 },
  visNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  visName: { fontSize: 14.5, fontWeight: "800", color: c.text },
  visDesc: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginTop: 3,
  },
  // .vis-lock
  visLock: {
    fontSize: 12,
    fontWeight: "700",
    color: c.warning,
    lineHeight: 12 * 1.5,
    marginTop: 8,
  },
  // .vis-upg: tautan Upgrade ke Pro
  visUpg: {
    color: c.primary,
    textDecorationLine: "underline",
  },
  // .vis-pro
  pro: {
    backgroundColor: c.goldBg,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radii.pill,
  },
  proText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.gold,
  },
});
