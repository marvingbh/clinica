import type {
  JoinInfo,
  RoomDescriptor,
  TelehealthConfig,
  VideoProvider,
} from "../types"
import { ROOM_SUBJECT } from "../types"

/**
 * Mock provider for dev and tests — never reaches the network. Returns a
 * deterministic JoinInfo on the fixed domain "mock.local". The client
 * JitsiRoom renders a static placeholder for this provider.
 */
export function mockProvider(_config: TelehealthConfig): VideoProvider {
  function build(room: RoomDescriptor, displayName: string, isModerator: boolean): JoinInfo {
    return {
      provider: "mock",
      domain: "mock.local",
      roomName: room.roomName,
      displayName,
      isModerator,
      subject: ROOM_SUBJECT,
    }
  }

  return {
    id: "mock",
    maxParticipants: 25,
    professionalJoinInfo: (room, displayName) => build(room, displayName, true),
    patientJoinInfo: (room, displayName) => build(room, displayName, false),
  }
}
