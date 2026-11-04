#!/usr/bin/env python3
"""Generate apps/api/src/data/mdpl-shifted-catalog.json from MDPL SHIFTED data.

SUMBER YANG BOLEH DIBACA (aturan keras):
  - <shifted-dir>/  (converted-shifted): routes.geojson + places.json per
    destinasi. Inilah SATU-SATUNYA sumber koordinat.
  - <api-data>/destinations.json: HANYA nama (id), provinceId, elevasi.
    Kolom region (bbox) di file ini TIDAK dipakai — lat/lon gunung
    diambil dari titik pertama track shifted, bukan dari region MDPL.
SUMBER YANG DILARANG: converted/ (koordinat asli) dan raw routes.json /
places.json. Generator ini tidak pernah membukanya.

Output ringkas (5,1 MB): koordinat dibulatkan 5 desimal (~1 m, jauh di
bawah geseran 15-30 m sehingga versi shifted tetap shifted), elevasi
dibulatkan ke meter. Checkpoint per rute = semua pos yang route_ids-nya
memuat rute itu (bukan hanya auto_checkpoint; flag auto dipertahankan
supaya API bisa menandai checkpoint default).

Re-run:
  python3 apps/api/scripts/mdpl-generate-catalog.py \
    ~/workspace/rea-mdpl/api-data/converted-shifted \
    ~/workspace/rea-mdpl/api-data/destinations.json
Lalu jalankan tes: bun test src/__tests__/mdpl-import.test.ts
"""
import json
import os
import sys

PROVINCE_LABEL = {
    "JawaTimur": "Jawa Timur",
    "JawaTengah": "Jawa Tengah",
    "JawaBarat": "Jawa Barat",
    "SumateraUtara": "Sumatera Utara",
    "SumateraBarat": "Sumatera Barat",
    "SumateraSelatan": "Sumatera Selatan",
    "SulawesiSelatan": "Sulawesi Selatan",
    "SulawesiTengah": "Sulawesi Tengah",
    "SulawesiUtara": "Sulawesi Utara",
    "SulawesiBarat": "Sulawesi Barat",
    "SulawesiTenggara": "Sulawesi Tenggara",
    "KalimantanSelatan": "Kalimantan Selatan",
    "KalimantanBarat": "Kalimantan Barat",
    "KalimantanTengah": "Kalimantan Tengah",
    "MalukuUtara": "Maluku Utara",
}


def main() -> None:
    shifted_dir, dest_path = sys.argv[1], sys.argv[2]
    dests = {
        d["id"]: d
        for d in json.load(open(dest_path))
    }
    out = []
    for folder in sorted(os.listdir(shifted_dir)):
        folder_path = os.path.join(shifted_dir, folder)
        if not os.path.isdir(folder_path):
            continue
        geo = json.load(open(os.path.join(folder_path, "routes.geojson")))
        places = json.load(open(os.path.join(folder_path, "places.json")))
        dest = dests[geo["destination_id"]]
        routes = []
        for feat in geo["features"]:
            props = feat["properties"]
            coords = [
                [[round(c[0], 5), round(c[1], 5), round(c[2])]
                 for c in line]
                for line in feat["geometry"]["coordinates"]
            ]
            cps = [
                {
                    "name": pl["name"],
                    "lat": round(pl["latitude"], 5),
                    "lon": round(pl["longitude"], 5),
                    "elev": pl["elevation"],
                    "auto": bool(pl["auto_checkpoint"]),
                    "target": bool(pl["is_target"]),
                    "tags": pl["tags"] or [],
                }
                for pl in places
                if props["route_id"] in (pl["route_ids"] or [])
            ]
            routes.append({
                "id": props["route_id"],
                "name": props["name"],
                "dist": props["distance_km"],
                "track": coords,
                "cps": cps,
            })
        out.append({
            "did": geo["destination_id"],
            "name": dest["name"].get("id") or dest["name"]["default"],
            "prov": dest["provinceId"],
            "elev": dest["elevation"],
            "routes": routes,
        })
    target = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "src", "data", "mdpl-shifted-catalog.json",
    )
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as fh:
        json.dump(out, fh, separators=(",", ":"), ensure_ascii=False)
    print(
        f"wrote {target}: {len(out)} mountains, "
        f"{sum(len(m['routes']) for m in out)} routes, "
        f"{sum(len(r['cps']) for m in out for r in m['routes'])} checkpoints"
    )


if __name__ == "__main__":
    main()
