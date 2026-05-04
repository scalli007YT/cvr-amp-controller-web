import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

function getLibraryDir() {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "speaker-library");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeId(raw: string): string {
  const next = raw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return next.length > 0 ? next : "speaker-profile";
}

function normalizeRequestedId(raw: string): string {
  return sanitizeId(raw.replace(/\.json$/i, ""));
}

// Atomic rename: write to a temp file then rename into place.
// On Windows, rename fails when the destination already exists, so delete first.
async function atomicRename(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "EEXIST" || code === "EPERM") {
      await fs.unlink(to).catch(() => undefined);
      await fs.rename(from, to);
    } else {
      throw err;
    }
  }
}

type StoredSpeakerWay = {
  id: string;
  label: string;
  role: string;
  deviceData?: {
    physicalChannel: number;
    variant: string;
    hex: string;
    byteLength: number;
    parsed: Record<string, unknown>;
  } | null;
};

type StoredSpeakerProfile = {
  schemaVersion: number;
  id: string;
  kind: string;
  speaker: {
    brand: string;
    family: string;
    model: string;
    application: string;
    notes: string;
    wayLabelsText: string;
    ways: StoredSpeakerWay[];
  };
};

function toWayDeviceData(value: unknown): StoredSpeakerWay["deviceData"] {
  if (!isRecord(value)) return null;
  const hex = typeof value.hex === "string" ? value.hex : "";
  if (hex.length === 0) return null;
  return {
    physicalChannel: typeof value.physicalChannel === "number" ? value.physicalChannel : 0,
    variant: typeof value.variant === "string" ? value.variant : "unknown",
    hex,
    byteLength: typeof value.byteLength === "number" ? value.byteLength : hex.length / 2,
    parsed: isRecord(value.parsed) ? value.parsed : {}
  };
}

function toStoredSpeakerProfile(input: unknown, idOverride: string): StoredSpeakerProfile {
  if (!isRecord(input)) throw new Error("Profile payload must be an object");

  const speaker = isRecord(input.speaker) ? input.speaker : null;
  if (!speaker) throw new Error("Missing speaker object");

  const waysRaw = Array.isArray(speaker.ways) ? speaker.ways : [];
  if (waysRaw.length < 1) throw new Error("At least one speaker way is required");

  const ways: StoredSpeakerWay[] = waysRaw.map((way, index) => {
    const w = isRecord(way) ? way : {};
    const label = typeof w.label === "string" && w.label.trim() ? w.label.trim() : `Way ${index + 1}`;
    const role = typeof w.role === "string" && w.role.trim() ? w.role.trim() : "custom";
    const id = typeof w.id === "string" && w.id.trim() ? w.id.trim() : label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { id, label, role, deviceData: toWayDeviceData(w.deviceData) };
  });

  const wayLabelsText =
    typeof speaker.wayLabelsText === "string" && speaker.wayLabelsText.trim().length > 0
      ? speaker.wayLabelsText.trim()
      : ways.map((w) => w.label).join(" & ");

  return {
    schemaVersion: typeof input.schemaVersion === "number" ? input.schemaVersion : 2,
    id: idOverride,
    kind: "speaker",
    speaker: {
      brand: typeof speaker.brand === "string" ? speaker.brand.trim() : "",
      family: typeof speaker.family === "string" ? speaker.family.trim() : "",
      model: typeof speaker.model === "string" ? speaker.model.trim() : "",
      application: typeof speaker.application === "string" ? speaker.application.trim() : "",
      notes: typeof speaker.notes === "string" ? speaker.notes.trim() : "",
      wayLabelsText,
      ways
    }
  };
}

/**
 * PUT /api/library/[id]
 *
 * Updates an existing speaker library profile in-place.
 * The [id] path segment is the canonical file id (without .json extension).
 * The request body must contain a { profile } object with the updated data.
 *
 * Unlike POST, this route:
 *   - Requires the file to already exist (returns 404 otherwise)
 *   - Preserves the file id (ignores any id in the profile body)
 *   - Preserves existing deviceData for ways that don't include new deviceData
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await params;
  const profileId = normalizeRequestedId(rawId);
  const libraryDir = getLibraryDir();
  const filePath = path.join(libraryDir, `${profileId}.json`);

  // Verify file exists
  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ success: false, error: "Library profile not found" }, { status: 404 });
  }

  // Read existing file to preserve deviceData for unchanged ways
  let existing: StoredSpeakerProfile | null = null;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && isRecord(parsed.speaker)) {
      existing = parsed as StoredSpeakerProfile;
    }
  } catch {
    // If we can't read/parse the existing file, proceed without preservation
  }

  let rawBody: { profile?: unknown };
  try {
    rawBody = (await request.json()) as { profile?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let updated: StoredSpeakerProfile;
  try {
    updated = toStoredSpeakerProfile(rawBody?.profile, profileId);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Invalid profile payload" },
      { status: 400 }
    );
  }

  // Preserve existing deviceData for ways that don't provide new data.
  // Matched by way index position — same approach as the original software.
  if (existing?.speaker?.ways) {
    updated.speaker.ways = updated.speaker.ways.map((way, idx) => {
      if (way.deviceData) return way; // incoming has new data — use it
      const existingWay = existing!.speaker.ways[idx];
      if (existingWay?.deviceData) return { ...way, deviceData: existingWay.deviceData };
      return way;
    });
  }

  // Atomic write
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(updated, null, 2), "utf-8");
    await atomicRename(tmpPath, filePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to write speaker profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, id: profileId });
}
