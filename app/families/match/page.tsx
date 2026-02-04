"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type Profile = {
  id: string;
  displayName?: string;
  bio?: string;
  childrenCount?: number;
  locationCity?: string;
  locationState?: string;
  photos?: string[];
  radiusMiles?: number;
  scheduleType?: string;
  verified?: boolean;
};

export default function MatchPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const ref = collection(db, "profiles");
        const q = query(ref, where("locationState", "==", "Maryland"), limit(20));
        const snap = await getDocs(q);

        const items: Profile[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        console.log("[Match] profiles count:", items.length);
        console.log("[Match] profiles sample:", items[0]);

        setProfiles(items);
      } catch (e: any) {
        console.error("[Match] Firestore error:", e);
        setErr(e?.message || "Firestore error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>Match</h1>

      {loading && <p>Cargando perfiles...</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && profiles.length === 0 && (
        <p>No hay perfiles para Maryland. Revisa Firestore → profiles → locationState = "Maryland".</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {profiles.map((p) => (
          <article
            key={p.id}
            style={{
              border: "1px solid rgba(0,0,0,.1)",
              borderRadius: 16,
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 10px 22px rgba(0,0,0,.06)",
            }}
          >
            {p.photos?.[0] ? (
              <img src={p.photos[0]} alt={p.displayName || "Profile"} style={{ width: "100%", height: 320, objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: 320, display: "grid", placeItems: "center", background: "rgba(0,0,0,.04)" }}>
                Sin foto
              </div>
            )}

            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <strong style={{ fontSize: 18 }}>{p.displayName || "Sin nombre"}</strong>
                {p.verified ? (
                  <span style={{ fontSize: 12, border: "1px solid rgba(0,0,0,.12)", borderRadius: 999, padding: "6px 10px" }}>
                    Verified
                  </span>
                ) : null}
              </div>

              <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13, lineHeight: 1.4 }}>
                {(p.locationCity || "—")}, {(p.locationState || "—")} <br />
                Kids: {p.childrenCount ?? 0} • Radius: {p.radiusMiles ?? 25} mi • Schedule: {p.scheduleType ?? "—"}
              </div>

              {p.bio ? <div style={{ opacity: 0.8, marginTop: 10, fontSize: 13 }}>{p.bio}</div> : null}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}