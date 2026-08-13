# Transport-Zuverlässigkeit & Write-Verifikation — Spezifikation (Work Item)

Status: **spezifiziert, Umsetzung offen** (2026-08-13).

## Problem (aus der Praxis)

Beim Arbeiten mit den Amps über AmpCore passiert regelmäßig:
- Befehle „werden nicht genommen" (kommen scheinbar nicht an / keine Wirkung),
- alles **dauert sehr lange**,
- am Ende ist die Config **unvollständig oder falsch** übertragen.

Das ist im Live-/Event-Betrieb heikel. Als Notbehelf gibt es inzwischen die Checksummen-/QoS-Geschichte beim Preset-Laden — die aber (siehe unten) nur schwach absichert.

## Ist-Zustand der Zuverlässigkeits-Mechanismen (Code-belegt)

Alles über **einen** persistenten UDP-Socket (`lib/amp-controller.ts`), Ziel-Port 45455, Empfang 45454.

**Schreiben — `sendFC` / `_sendPacketAwaitAck`:**
- Fragmentgröße 450 B (`FRAGMENT_SIZE`).
- Je Fragment: senden → auf ACK warten (**1000 ms** Timeout), bis zu **3 Versuche**.
- Ganzer Frame bis zu **3 Versuche** (`maxFrameAttempts`), 120 ms Cool-down dazwischen.
- ACK = header-only Paket mit `data_state=1`. (Firmware-Varianten 1.1.8 `1/0` vs 1.1.9 `0/450` — inzwischen robust per „header-only = ACK" gefixt.)
- Optionaler **QoS-Read-Back**: nach dem Schreiben Rücklesen und vergleichen — **aber nur `readBack.length === body.length`** (nur Länge, nicht Inhalt). QoS ist **opt-in** und beim Speaker-Apply per Default **aus**.

**Lesen — `requestFC` / `requestFC27`:**
- **2000 ms** Timeout + 1 Retry (2200 ms). Pro Amp serialisiert (`_runIpSerial`).

**Integrität:**
- `calcCheckCode` (summenbasierte 3-Byte-Prüfsumme) je Frame; eingehende Frames werden per `validateAssembledFrame` geprüft, ungültige verworfen.
- **Kein** End-to-End-Abgleich, dass der Amp den geschriebenen Wert/Block **korrekt gespeichert** hat.

## Identifizierte Schwachstellen / Hypothesen

1. **Verifikation zu schwach.** QoS prüft nur Länge, nicht Inhalt → „falsch übertragen" (richtige Länge, falsche Bytes) wird **nicht erkannt**. Und QoS ist beim Apply meist aus → viele Writes laufen **ohne jede Bestätigung**, dass sie wirklich ankamen. → deckt „kommt falsch/unvollständig an" direkt ab.
2. **Socket-Contention.** Heartbeat- + Channel-Data-Polling (FC27 = 5×460 B Reassembly, dazu Lock/Standby-Polls, ~1/s je Amp) laufen auf **demselben** Socket wie die ACK-getakteten Writes. Bei großem Apply verzögern sich ACKs → Timeouts/Retries → Langsamkeit. (Belegt: `/api/amp-presets/current` lief während eines Applys in 4,2 s Timeout, allein aufgerufen sofort ok.) → deckt „dauert lange / nimmt Befehle nicht" ab.
3. **Feste, knappe Timeouts.** 1000 ms ACK / 2000 ms Read ohne adaptiven Backoff. Auf langsamer/beschäftigter DSP oder WLAN spurious Timeouts → Retries → noch langsamer.
4. **WLAN.** Mac auf `en0` (WiFi). UDP über WLAN = mehr Loss/Jitter; die ACK-getaktete Fragmentierung ist losssensitiv. Wired/eigenes VLAN als Referenz nötig.
5. **ACK-Korrelation historisch fragil.** Zähler-Felder im ACK sind je Firmware inkonsistent (jetzt umgangen). Weitere firmware-/modellspezifische Sonderfälle möglich.
6. **Keine Idempotenz-/Reihenfolge-Garantie sichtbar.** Bei Teilfehlern (einige Fragmente/Kanäle ok, andere nicht) bleibt der Amp evtl. in **inkonsistentem Zwischenzustand** — „unvollständig übertragen".

## Plan: spezifizieren & fixen

**Phase A — Messen & reproduzieren (zuerst, ohne Rätselschluss).**
- Instrumentierung: pro Write/Read Timing, Attempts, Fragment-Retries, ACK-Latenz loggen (Transport-Metadaten gibt es schon: `frameAttempts`, `fragmentRetries`).
- Realistische Last reproduzieren: großer Apply (mehrere Kanäle/Ways) auf 1.1.8 **und** 1.1.9, mit/ohne paralleles Polling, Wired vs WLAN. Wireshark parallel.
- Zielmetriken definieren: Apply-Erfolgsquote, Dauer, Retry-Rate; „gut" = z. B. 100 % Erfolg, < X s, 0 stille Fehler.

**Phase B — Zielverhalten spezifizieren.**
- **Definierte End-to-End-Verifikation** für jeden kritischen Write (Preset/Speaker/EQ): Rücklesen und **Inhalt** (Byte/Checksumme), nicht nur Länge, vergleichen; bei Abweichung gezielt neu schreiben. QoS beim Apply **standardmäßig an**.
- **Transaktions-/Konsistenz-Modell:** klarer Erfolg/Teilerfolg-Status; bei Teilfehler definierter Rollback/Retry statt inkonsistentem Zwischenzustand.
- **Adaptive Timeouts/Backoff** statt fester Werte; ACK-Fenster an gemessene Latenz koppeln.

**Phase C — Contention entschärfen.**
- Während eines Applys Polling **drosseln/pausieren** (Priorität für den Write) oder Writes und Reads sauber serialisieren/priorisieren.
- Prüfen, ob getrennte Sockets für Poll vs Control sinnvoll sind (wie die Original-CVR-App evtl. mit ephemerem Port arbeitet).

**Phase D — Umsetzen & unter realen Bedingungen verifizieren.**
- Fixes iterativ, jeder gegen echte Hardware (beide Firmwares) + WLAN und Wired gemessen, gegen die Zielmetriken aus Phase A.

## Bezug zu bereits Gefundenem

Der FC=57-ACK-Fix (siehe `findings.md`) war ein Einzelfall dieses Themas (falsch verworfenes ACK → Timeout). Diese Spezifikation adressiert die **systemische** Zuverlässigkeit, nicht nur den Einzelfall.
