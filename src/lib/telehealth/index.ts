export type {
  VideoProviderId,
  TelehealthConfig,
  RoomDescriptor,
  JoinInfo,
  VideoProvider,
  JoinState,
} from "./types"
export { ROOM_SUBJECT } from "./types"

export { resolveRoomKey, deriveRoomName, type RoomKeyInput } from "./room-names"

export {
  signVideoToken,
  buildVideoToken,
  parseVideoToken,
  verifyVideoToken,
} from "./video-tokens"

export {
  JOIN_WINDOW_BEFORE_MIN,
  JOIN_WINDOW_GRACE_AFTER_MIN,
  computeJoinWindow,
  resolveJoinState,
  type JoinStateAppointment,
} from "./join-window"

export {
  buildPatientVideoUrl,
  resolveVideoLinkForNotification,
  stripUnresolvedVideoLines,
  renderWithVideoLink,
  type ResolveVideoLinkArgs,
} from "./video-link"

export { getTelehealthConfig, getVideoProvider } from "./config"
export { jitsiProvider } from "./providers/jitsi"
export { mockProvider } from "./providers/mock"
