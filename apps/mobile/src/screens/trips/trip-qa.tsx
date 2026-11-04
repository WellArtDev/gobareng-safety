// Layar Tanya-Jawab Trip (AI-Q) — riwayat pertanyaan + jawaban per
// trip, hanya untuk member trip itu (server menegakkan 403 untuk
// non-member). Jawaban AI hanya dari data trip; bila tidak ada di
// data, server mengembalikan notFound dan layar merender kalimat
// i18n — bukan karangan. Atribusi "Built with Muse Spark Open"
// tampil hanya bila jawaban membawa model (pola ai-summary web).
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  alertAccessibility,
  buttonAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";
import {
  askTripQuestion,
  fetchTripQa,
  type TripQa,
} from "@/utils/ai-qa-api";

export function TripQaScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<TripQa[]>([]);
  const [question, setQuestion] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setItems(await fetchTripQa(id));
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onAsk = async () => {
    if (!id || asking || !question.trim()) return;
    setAsking(true);
    try {
      const qa = await askTripQuestion(id, question.trim());
      setItems((prev) => [qa, ...prev]);
      setQuestion("");
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setAsking(false);
    }
  };

  const errorMessage = errorKey ? t(errorKey) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("aiQ.backLabel"))}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text
          style={styles.appbarTitle}
          {...headingAccessibility(t("aiQ.title"))}
        >
          {t("aiQ.title")}
        </Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
          <Text style={styles.errText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.hint}>{t("aiQ.hint")}</Text>
      <TextInput
        style={styles.input}
        value={question}
        onChangeText={setQuestion}
        placeholder={t("aiQ.placeholder")}
        multiline
        maxLength={1000}
      />
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          pressed && styles.btnPressed,
          (asking || !question.trim()) && styles.btnDisabled,
        ]}
        onPress={onAsk}
        disabled={asking || !question.trim()}
        {...buttonAccessibility(t("aiQ.ask"), {
          busy: asking,
          disabled: asking || !question.trim(),
        })}
      >
        <Text style={styles.btnText}>
          {asking ? t("aiQ.asking") : t("aiQ.ask")}
        </Text>
      </Pressable>

      {items.length === 0 ? (
        <Text style={styles.empty}>{t("aiQ.empty")}</Text>
      ) : (
        items.map((qa) => (
          <View key={qa.id} style={styles.card}>
            <Text style={styles.q}>{qa.question}</Text>
            <Text style={styles.a}>
              {qa.notFound || qa.answer === null
                ? t("aiQ.notFound")
                : qa.answer}
            </Text>
            {qa.model ? (
              <Text style={styles.attr}>{t("aiQ.attribution")}</Text>
            ) : null}
            {qa.sources.length > 0 ? (
              <Text style={styles.sources}>
                {t("aiQ.sources", { list: qa.sources.join(", ") })}
              </Text>
            ) : null}
            {/* Link peta deterministik dari server untuk jawaban
                lokasi — diketuk membuka Google Maps ke koordinat
                itu. notFound / jawaban non-lokasi tidak punya link. */}
            {qa.links.length > 0
              ? qa.links.map((link) => (
                  <Pressable
                    key={link.url}
                    style={styles.linkBtn}
                    onPress={() => Linking.openURL(link.url)}
                    {...buttonAccessibility(link.label)}
                  >
                    <Text style={styles.linkText}>📍 {link.label} ›</Text>
                  </Pressable>
                ))
              : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
    appbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 8,
      paddingBottom: 10,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
    },
    backGlyph: { fontSize: 24, fontWeight: "700", color: c.text },
    appbarTitle: {
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.4,
      color: c.text,
      flex: 1,
    },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
    hint: { fontSize: 12.5, color: c.text2, lineHeight: 12.5 * 1.55, marginBottom: 10 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 14,
      color: c.text,
      minHeight: 76,
      textAlignVertical: "top",
    },
    btn: {
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      borderRadius: radii.md,
      paddingVertical: 15,
      paddingHorizontal: 18,
      backgroundColor: c.primary,
      marginTop: 12,
    },
    btnPressed: { backgroundColor: c.primaryDark, transform: [{ scale: 0.985 }] },
    btnDisabled: { opacity: 0.45 },
    btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    empty: {
      fontSize: 13,
      color: c.text2,
      lineHeight: 13 * 1.55,
      marginTop: 18,
      textAlign: "center",
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginTop: 14,
      ...shadowCard,
    },
    q: { fontWeight: "800", fontSize: 14, color: c.text, marginBottom: 6 },
    a: { fontSize: 13.5, color: c.text, lineHeight: 13.5 * 1.55 },
    attr: { fontSize: 11, color: c.text3, marginTop: 8, fontWeight: "700" },
    sources: { fontSize: 11, color: c.text3, marginTop: 4 },
    linkBtn: { marginTop: 8, alignSelf: "flex-start" },
    linkText: { fontSize: 13, fontWeight: "700", color: c.primary },
  });
