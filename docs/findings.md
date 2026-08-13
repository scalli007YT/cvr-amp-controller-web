# Reverse-Engineering-Findings (living document)

Belegte Erkenntnisse aus echten Captures/Hardware-Tests. Nur Verifiziertes hier rein.

## Setup (2026-08-13)

- Mac `192.168.20.86` (en0), gleiches /24 wie die Amps. AmpCore läuft auf dem Mac und pollt beide Amps direkt → Mac sieht vollen Unicast-Traffic.
- Capture headless via Wireshark.app `dumpcap`/`tshark` (User in Gruppe `access_bpf`, kein sudo).
- Test-Amps: **DSP2004D FW 1.1.8** `192.168.20.73`, **DSP3004D FW 1.1.9** `192.168.20.203`. Ports: Amp→App 45454 (Heartbeat FC6), App→Amp 45455.

## Heartbeat (FuncCode 6) — Body-Layout (beide Firmwares, 4-Kanal-D-Serie)

Body = 92 Bytes (Frame 115 = 10 NetHdr + 10 StructHdr + 92 Body + 3 Checksum).

| Offset | Feld | Beleg |
|-------:|------|-------|
| 0..19  | **Temperaturen** (5× float32 LE) | plausibel 22–43 °C, ändern sich langsam & realistisch |
| 52..55 | **Output-States** (4× byte, je Kanal) | ändern sich deterministisch bei Standby/Wake-Kommando |
| 88..91 | **Input-States** (4× byte) | konstant `1` in bisherigen Tests |
| 20,36,56,72 | outV/outI/inV/lim (float) | im Leerlauf 0; unter Last/Signal noch zu verifizieren |

**Output-State-Codes** (aus `stores/AmpStore.ts` `getOutputStateLabel`, hardware-bestätigt):
`0=Normal, 1=Standby, 2=Fault, 3=Open, 4=Overload, 5=Clip, 6=Dcp, 7=PowerEr, 8=Run, 9=Temp, 10=Limit, 11=Sleep`.

## Standby/Wake-Test (2026-08-13)

- Gesendet: `FC=15 (STANDBY_DATA)`, statusCode 0, Body `01` bzw. `00` (exakt wie AmpCore, siehe `app/api/amp-actions/route.ts`).
- **Beobachtet (1.1.8):** Output-States `[1,1,1,1]`(Standby) → `[2,2,2,2]`(Fault, transient) → `[8,8,8,8]`(Run) nach Body `01`.
- **Offen/auffällig:** Body `00` („standby-off" laut API) bringt die Amps **nicht** zurück nach Standby(1) — Wake funktioniert, das Zurücksetzen in Standby verhält sich anders als der API-Kommentar. Muss noch sauber reverse-engineert werden (evtl. `FC=1 AUTO_STANDBY` oder Timeout-basiert). **Mögliche Fehlerquelle im Control-Pfad.**
- **Firmware-Hinweis (unbestätigt):** 1.1.8 belegte in Fault/Run-Übergängen zusätzliche Bytes @56–63; 1.1.9-Capture war am Fensterende abgeschnitten. Braucht längeres Aktiv-Capture zur Bestätigung.

## Standby ist ein TOGGLE (2026-08-13, gelöst) ⚠️

Ground-Truth via **AmpCore-UI auf dem Mac** (laufende AmpCore.app serviert Next auf :3000; von Claude über Browser gesteuert → Befehl geht Mac→Amp, voll capturebar).

- Gesendeter Befehl (UI „Standby amp"): **`FC=15, statusCode=0, body=01`** — identische Bytes für beide Firmwares.
- Wirkung: `[8,8,8,8] Run → [1,1,1,1] Standby` bei **beiden** Amps. Kein 1.1.8/1.1.9-Unterschied.
- **Kernbefund:** `FC15 body01` **schaltet Standby um (Toggle)**, es setzt nicht absolut. Beleg: derselbe Befehl brachte vorher Standby→Run, jetzt Run→Standby. `body00` ist ein No-Op → deshalb liefen die früheren „standby-off"-Versuche ins Leere.
- **AmpCore-Bug-Kandidat:** `app/api/amp-actions.ts` `setAmpStandby` nimmt absolute Semantik an (`value?0x01:0x00`, Kommentar „01=standby/00=normal"). Real ist es ein Toggle + `00` wirkungslos → erklärt „Steuerbefehle wirkungslos". Fix-Idee: vor dem Umschalten Ist-Zustand (FC15-Read) prüfen und nur toggeln, wenn Ziel≠Ist.
- Sweep-Vorgeschichte (FC1/FC2, body00) blieb wirkungslos — konsistent mit Toggle-Semantik, nicht mit Auto-Standby-Timer.

### Fix (Branch `feat/firmware-1.1.x-harmonization`)

- `lib/standby.ts`: reine Helfer `parseStandbyFlag`, `shouldToggleStandby`, `STANDBY_TOGGLE_BODY`.
- `app/api/amp-actions/route.ts` `setAmpStandby`: liest jetzt Ist-Zustand (`requestFC` FC15) und sendet den Toggle **nur wenn Ziel ≠ Ist**. Behebt „`00` wirkungslos" und „falsch geflippt".
- **Tests:** `lib/standby.test.ts` (vitest neu eingeführt, `vitest.config.ts` mit `@`-Alias). TypeScript-Typecheck der Fix-Dateien fehlerfrei. **`pnpm test`-Lauf steht noch aus** (npm-Registry beim Setup zeitweise nicht erreichbar → vitest-Install/Lockfile nachziehen).
- **Live-Verifikation offen:** Dev-Build mit Fix starten, „Standby" zweimal in Folge → idempotent (kein Flip zurück), `00`/Ziel=Ist → kein Paket.

## Presets (FuncCode 59 = SAVE_RECALL) — Struktur

Body(34): `[0]=mode [1]=slot [2..33]=32-Byte-ASCII-Name`.
- mode: 1=store, 2=recall, **4=Namen lesen** (von AmpCore-Polling beobachtet).
- Beispiel 1.1.9 Slot 0: Query `04 00 00…`, Response `04 00 "Null" 00…` → Slot 0 leer.
- **Für 1.1.8/1.1.9-Vergleich fehlt noch FC59 vom 1.1.8-Amp** (im Fenster nicht gepollt) sowie ein gezielter Store/Recall. **Store NICHT ohne Freigabe** (überschreibt gespeicherte Presets).

## Nächste geplante Experimente

1. Längeres Aktiv-Capture (≥60 s) mit sauberem Wake→Run→(Standby) je Amp, beide Firmwares parallel dokumentiert → Output-State-Bytes & etwaige Layout-Divergenz bestätigen.
2. Per-Kanal `muteout`/`mutein` einzeln → Kanal-Reihenfolge im State-Block mappen.
3. Signal/Last-Session (Hagen speist ein) → outV@20 / outI@36 / limiter belegen.
4. Preset-Frames (FC59) 1.1.8 vs 1.1.9 vergleichen → „Presets inkompatibel"-Symptom.
