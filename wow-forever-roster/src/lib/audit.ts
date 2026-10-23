import { connectDB } from "@/lib/db";
import Character from "@/models/Character";

// Región América (US) exclusivamente.
const API_BASE_URL = "https://us.api.blizzard.com";
const OAUTH_TOKEN_URL = "https://oauth.battle.net/token";
const NAMESPACE = "profile-forever-us";
const LOCALE = "es_MX"; // también válido: "en_US"

// Slots que deben estar equipados.
const CRITICAL_SLOTS = [
  "HEAD",
  "NECK",
  "SHOULDER",
  "BACK",
  "CHEST",
  "WRIST",
  "HANDS",
  "WAIST",
  "LEGS",
  "FEET",
  "FINGER_1",
  "FINGER_2",
  "MAIN_HAND",
] as const;

// Slots críticos que además deben tener encantamiento.
const ENCHANT_SLOTS = [
  "BACK",
  "CHEST",
  "WRIST",
  "HANDS",
  "LEGS",
  "FEET",
  "FINGER_1",
  "FINGER_2",
  "MAIN_HAND",
] as const;

interface EquippedItem {
  slot: { type: string; name?: string };
  name?: string;
  enchantments?: unknown[];
  sockets?: { socket_type?: { type?: string }; item?: unknown }[];
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const id = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Faltan BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET en las variables de entorno."
    );
  }

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OAuth Blizzard falló (${res.status})`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function blizzardGet<T>(path: string, token: string): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  url.searchParams.set("namespace", NAMESPACE);
  url.searchParams.set("locale", LOCALE);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Blizzard ${res.status} en ${url.pathname}`);
  return (await res.json()) as T;
}

function auditEquipment(items: EquippedItem[]) {
  const bySlot = new Map(items.map((i) => [i.slot.type, i]));
  const missingEnchants: string[] = [];
  const missingGems: string[] = [];
  const emptySlots: string[] = [];

  for (const slot of CRITICAL_SLOTS) {
    const item = bySlot.get(slot);
    if (!item) {
      emptySlots.push(slot);
      if ((ENCHANT_SLOTS as readonly string[]).includes(slot)) {
        missingEnchants.push(`${slot}: vacío`);
      }
      continue;
    }

    if (
      (ENCHANT_SLOTS as readonly string[]).includes(slot) &&
      !item.enchantments?.length
    ) {
      missingEnchants.push(`${slot}: ${item.name ?? "sin nombre"}`);
    }
  }

  // Las gemas se revisan en todos los items equipados con engarces.
  for (const item of items) {
    const empty = (item.sockets ?? []).filter((s) => !s.item).length;
    if (empty > 0) {
      missingGems.push(`${item.slot.type}: ${item.name ?? "sin nombre"} (${empty})`);
    }
  }

  return { missingEnchants, missingGems, emptySlots };
}

export interface AuditResult {
  name: string;
  ok: boolean;
  error?: string;
  missingEnchants?: string[];
  missingGems?: string[];
  emptySlots?: string[];
}

export async function auditCharacters(
  realmInput: string,
  names: string[],
  roles: Record<string, string> = {}
): Promise<AuditResult[]> {
  const realm = realmInput.trim().toLowerCase().replace(/\s+/g, "-");
  const [token] = await Promise.all([getAccessToken(), connectDB()]);

  return Promise.all(
    names.map(async (name): Promise<AuditResult> => {
      const base = `/profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(name.toLowerCase())}`;
      try {
        const [summary, equipment] = await Promise.all([
          blizzardGet<{
            name: string;
            character_class: { name: string };
            equipped_item_level: number;
          }>(base, token),
          blizzardGet<{ equipped_items?: EquippedItem[] }>(`${base}/equipment`, token),
        ]);

        const { missingEnchants, missingGems, emptySlots } = auditEquipment(
          equipment.equipped_items ?? []
        );

        const role = roles[name];
        await Character.findOneAndUpdate(
          { name: summary.name },
          {
            $set: {
              class: summary.character_class.name,
              ilvl: summary.equipped_item_level,
              missingEnchants,
              missingGems,
              lastUpdated: new Date(),
              ...(role ? { role } : {}),
            },
            $setOnInsert: { ...(role ? {} : { role: "Unknown" }), attendanceCount: 0 },
          },
          { upsert: true, runValidators: true }
        );

        return { name: summary.name, ok: true, missingEnchants, missingGems, emptySlots };
      } catch (error) {
        return {
          name,
          ok: false,
          error: error instanceof Error ? error.message : "Error desconocido",
        };
      }
    })
  );
}
