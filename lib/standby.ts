/**
 * Standby control semantics for CVR amps.
 *
 * Hardware-confirmed (capture 2026-08-13, DSP-2004D FW 1.1.8 & DSP-3004D FW 1.1.9):
 * `FC=15 STANDBY_DATA` with statusCode=0 and body `0x01` **toggles** standby
 * (Run <-> Standby). Body `0x00` is a **no-op**. The device does NOT support an
 * absolute "set standby = on/off" write.
 *
 * Therefore, to reach a desired standby state, read the current state first
 * (FC=15 read returns a Standby_data struct whose body[0] is the flag) and send
 * the toggle only when the current state differs from the target.
 */

/** Standby flag from an FC=15 STANDBY_DATA response body (body[0] == 1 => standby). */
export function parseStandbyFlag(body: Uint8Array): boolean {
  return body.length >= 1 && body[0] === 1;
}

/** Whether the single toggle command must be sent to reach `desired` from `current`. */
export function shouldToggleStandby(current: boolean, desired: boolean): boolean {
  return current !== desired;
}

/** Wire body for the standby toggle command (FC=15, statusCode=0). */
export const STANDBY_TOGGLE_BODY = Uint8Array.from([0x01]);
