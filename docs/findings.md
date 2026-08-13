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

## Standby-Restore-Sweep (2026-08-13)

An `.73` (1.1.8) getestet, alle ohne Wirkung (Amp blieb `[8,8,8,8]` Run):
`FC15 body00 st1`, `FC1 body01 st1`, `FC1 body00 st1`, `FC1 body01 st0`, `FC15 body00 st0 out`.
→ **Standby lässt sich (bei diesen Modellen) nicht per einfachem Netzbefehl erzwingen.** Zusammen mit den Codes `FC1 AUTO_STANDBY` / `FC2 AUTO_STANDBY_TIME` deutet alles auf **timer-basiertes Auto-Standby**: Amp döst nach Inaktivität selbst ein; Wecken (FC15 body01) resetet den Timer. Ground-Truth-Capture (Standby-Taste in Original-App/Frontpanel) würde den echten Entry-Befehl liefern — noch offen.

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
