// WX-1 routes — contract §8 (subset yang datanya nyata):
// current (auto-route provider per locked decision) + quakes +
// providers/status. BMKG forecast per-wilayah (adm4) menyusul —
// butuh pemetaan koordinat -> kode wilayah BMKG.
// Semua fail-soft: provider mati -> data null/[], HTTP tetap 200.
import { Router } from "express";
import { badRequest } from "../errors.js";
import {
  getCurrentWeather,
  getRecentQuakes,
  pickQuakeProvider,
  pickWeatherProvider,
} from "../weather.js";

function coord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// PUBLIK tanpa auth (31 Okt 2026): layar pantau /pantau/[token]
// (keluarga, tanpa akun) juga menampilkan cuaca + gempa. Data provider
// publik non-sensitif, respons di-cache TTL — aman dibuka.
export function weatherRouter(): Router {
  const r = Router();

  r.get("/current", (req, res, next) => {
    (async () => {
      const lat = coord(req.query.lat);
      const lon = coord(req.query.lon);
      if (lat === null || lon === null) throw badRequest("INVALID_LOCATION");
      res.json({
        data: {
          provider: pickWeatherProvider(lat, lon),
          weather: await getCurrentWeather(lat, lon),
        },
      });
    })().catch(next);
  });

  r.get("/quakes", (req, res, next) => {
    (async () => {
      const lat = coord(req.query.lat);
      const lon = coord(req.query.lon);
      if (lat === null || lon === null) throw badRequest("INVALID_LOCATION");
      res.json({
        data: {
          provider: pickQuakeProvider(lat, lon),
          quakes: await getRecentQuakes(lat, lon),
        },
      });
    })().catch(next);
  });

  r.get("/providers/status", (_req, res) => {
    res.json({
      data: {
        weather: { indonesia: "bmkg", international: "open-meteo" },
        quakes: { indonesia: "bmkg", international: "usgs" },
        openweather: "removed",
      },
    });
  });

  return r;
}
