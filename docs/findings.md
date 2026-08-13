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

## Nächste geplante Experimente

1. Längeres Aktiv-Capture (≥60 s) mit sauberem Wake→Run→(Standby) je Amp, beide Firmwares parallel dokumentiert → Output-State-Bytes & etwaige Layout-Divergenz bestätigen.
2. Per-Kanal `muteout`/`mutein` einzeln → Kanal-Reihenfolge im State-Block mappen.
3. Signal/Last-Session (Hagen speist ein) → outV@20 / outI@36 / limiter belegen.
4. Preset-Frames (FC59) 1.1.8 vs 1.1.9 vergleichen → „Presets inkompatibel"-Symptom.
