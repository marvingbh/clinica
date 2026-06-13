import type {
  JoinInfo,
  RoomDescriptor,
  TelehealthConfig,
  VideoProvider,
} from "../types"
import { ROOM_SUBJECT } from "../types"

/**
 * Default video provider. Builds JoinInfo for the Jitsi external API. The
 * iframe options that disable recording/livestreaming (RN-10) and enable the
 * native prejoin live in the shared client component (JitsiRoom.tsx) — this
 * pure factory only resolves identity and routing data.
 *
 * `maxParticipants: 25` is a practical recommended cap for simultaneous video.
 * Self-hosted Jitsi instances can support more; tune per deployment.
 */
export function jitsiProvider(config: TelehealthConfig): VideoProvider {
  const domain = config.jitsiDomain ?? ""

  function build(room: RoomDescriptor, displayName: string, isModerator: boolean): JoinInfo {
    return {
      provider: "jitsi",
      domain,
      roomName: room.roomName,
      displayName,
      isModerator,
      subject: ROOM_SUBJECT,
    }
  }

  return {
    id: "jitsi",
    maxParticipants: 25,
    professionalJoinInfo: (room, displayName) => build(room, displayName, true),
    patientJoinInfo: (room, displayName) => build(room, displayName, false),
  }
}
