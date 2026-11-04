// Layar magic link juri tanpa OTP (3 Nov 2026) — dibuka lewat deep link
// gobareng://magic-link?token=... (skema sudah ada di app.json).
// Rute ini PUBLIK (lihat PUBLIC_PATHS di _layout.tsx) supaya gerbang
// auth tidak mengalihkan ke /login sebelum token sempat ditukar.
// Alur: tukar token -> simpan sesi (sama seperti OTP) -> beranda.
// Token tidak pernah ditampilkan di layar atau dilog; error server
// dipetakan ke kunci i18n seperti layar OTP.
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppLogo } from "@/components/AppLogo";
import {
  AuthScreenContainer,
  FormError,
  FormSuccess,
} from "@/components/AuthUi";
import { useTranslation } from "@/i18n";
import { ApiError, redeemMagicLink } from "@/utils/auth-api";
import { saveSession } from "@/utils/auth-store";
import { setupPushTokens } from "@/utils/push-tokens";

export function MagicLinkScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const raw = Array.isArray(token) ? token[0] : token;
      if (!raw) {
        if (active) setErrorKey("auth.errors.magicLinkInvalid");
        return;
      }
      try {
        const session = await redeemMagicLink(raw);
        await saveSession(
          session.token,
          session.user.name,
          session.refreshToken,
        );
        void setupPushTokens();
        if (!active) return;
        setDone(true);
        setTimeout(() => router.replace("/"), 900);
      } catch (error) {
        if (!active) return;
        setErrorKey(
          error instanceof ApiError
            ? error.i18nKey
            : "auth.errors.unavailable",
        );
      }
    })();
    return () => {
      active = false;
    };
    // Token dari deep link hanya dibaca sekali saat layar dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthScreenContainer>
      <AppLogo size="lg" />
      <View>
        <Text>{t("magicLink.title")}</Text>
      </View>
      {!done && !errorKey ? (
        <View>
          <ActivityIndicator size="large" />
          <Text>{t("magicLink.loading")}</Text>
        </View>
      ) : null}
      <FormError message={errorKey ? t(errorKey) : null} />
      <FormSuccess message={done ? t("magicLink.success") : null} />
    </AuthScreenContainer>
  );
}
