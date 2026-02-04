"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/firebase/useAuthUser";
import { createProfile, Profile } from "@/lib/firebase/profile";

const MD_STATE = "Maryland";

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();

  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState<number>(30);
  const [bio, setBio] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [radiusMiles, setRadiusMiles] = useState<number>(25);
  const [childrenCount, setChildrenCount] = useState<number>(1);
  const [childrenAgesText, setChildrenAgesText] = useState("3"); // "3,7"
  const [scheduleType, setScheduleType] =
    useState<Profile["scheduleType"]>("rotating");

  const [availabilityText, setAvailabilityText] = useState("Mon AM, Wed PM");
  const [languagesText, setLanguagesText] = useState("English, Spanish");
  const [needsText, setNeedsText] = useState("overnight, school pickup");
  const [valuesText, setValuesText] = useState("reliability, safety first");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  const childrenAges = useMemo(() => {
    return childrenAgesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17);
  }, [childrenAgesText]);

  function parseList(text: string) {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function onSave() {
    setError(null);

    if (!uid) {
      setError("You must be logged in.");
      return;
    }
    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!locationCity.trim()) {
      setError("Please enter your city (Maryland).");
      return;
    }
    if (!Number.isFinite(age) || age < 18 || age > 99) {
      setError("Age must be 18+.");
      return;
    }
    if (childrenCount < 0 || childrenCount > 10) {
      setError("Children count looks wrong.");
      return;
    }

    setSaving(true);
    try {
      const profile: Profile = {
        uid,
        displayName: displayName.trim(),
        age,
        bio: bio.trim(),
        locationCity: locationCity.trim(),
        locationState: MD_STATE,
        radiusMiles,
        childrenCount,
        childrenAges,
        scheduleType,
        availability: parseList(availabilityText),
        languages: parseList(languagesText),
        needs: parseList(needsText),
        values: parseList(valuesText),
        verified: false,
        photos: [],
      };

      await createProfile(profile);

      
      router.push("/families/match");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!user) return <div style={{ padding: 24 }}>Please log in first.</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Create your profile</h1>
      <p style={{ marginBottom: 20, opacity: 0.8 }}>
        This is required before matching. (Maryland only for now)
      </p>

      {error && (
        <div
          style={{
            background: "#ffe5e5",
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <label>
          Name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="Your name"
          />
        </label>

        <label>
          Age
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
          />
        </label>

        <label>
          City (Maryland)
          <input
            value={locationCity}
            onChange={(e) => setLocationCity(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="Baltimore"
          />
        </label>

        <label>
          Radius (miles)
          <input
            type="number"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
          />
        </label>

        <label>
          Children count
          <input
            type="number"
            value={childrenCount}
            onChange={(e) => setChildrenCount(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
          />
        </label>

        <label>
          Children ages (comma-separated)
          <input
            value={childrenAgesText}
            onChange={(e) => setChildrenAgesText(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="3, 7"
          />
        </label>

        <label>
          Schedule type
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as any)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
          >
            <option value="rotating">Rotating</option>
            <option value="fixed">Fixed</option>
            <option value="weekends">Weekends</option>
          </select>
        </label>

        <label>
          Availability (comma-separated)
          <input
            value={availabilityText}
            onChange={(e) => setAvailabilityText(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="Mon AM, Wed PM"
          />
        </label>

        <label>
          Languages (comma-separated)
          <input
            value={languagesText}
            onChange={(e) => setLanguagesText(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="English, Spanish"
          />
        </label>

        <label>
          Needs (comma-separated)
          <input
            value={needsText}
            onChange={(e) => setNeedsText(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="overnight, school pickup"
          />
        </label>

        <label>
          Values (comma-separated)
          <input
            value={valuesText}
            onChange={(e) => setValuesText(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="reliability, safety first"
          />
        </label>

        <label>
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              minHeight: 90,
            }}
            placeholder="Tell others about your family..."
          />
        </label>

        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}