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

## Standby = ABSOLUTES Setzen (2026-08-13, verifiziert) ✅

`FC=15 STANDBY_DATA`, statusCode 0:
- **`body=01` → Standby setzen**, **`body=00` → Run setzen (wecken)**. **Absolut, KEIN Toggle.**

**Sauberer Beleg** (`captures/baseline/standby_semantics_2026-08-13`, Amp .73/1.1.8, @52-Verlauf):
`Standby[1] → body00 → [2] → [8]Run → body00 (bleibt Run) → body01 → [1]Standby → body01 (bleibt Standby)`.
Transienter `[2]` (Fault-Label) ist nur der Anfahr-Übergang, kein echter Fehler.

**Der ursprüngliche AmpCore-Code ist korrekt** (`setAmpStandby: value?0x01:0x00`). Es gibt hier **keinen** Bug.

### Korrektur einer früheren Fehleinschätzung (wichtig, dokumentiert)

Eine vorherige Notiz behauptete „Standby ist ein Toggle" und „Amps hängen in Standby fest". **Beides war falsch:**
- `[8,8,8,8]` wurde als „festhängendes Standby" **fehlgelesen** — `8 = Run` (normal). Die Amps liefen also, hingen nie fest.
- Die beobachtete Wirkung „Standby→Run" kam vom `body00`-Befehl, nicht von `body01`; im selben Testlauf lagen beide dicht beieinander → verwechselt.
- Ein daraufhin gebauter „Fix" (read-then-toggle) war entsprechend falsch (sendete immer `body01`) und wurde **revertiert**.

Lehre fürs Projekt: Semantik nur aus **isolierten** Einzelbefehlen ableiten (ein Kommando, dann beobachten), nie aus dicht gestaffelten Sequenzen.

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
