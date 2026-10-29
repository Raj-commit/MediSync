const DEFAULT_STUN_SERVER = 'stun:stun.l.google.com:19302';

/**
 * Parses ICE server configuration from environment variables.
 * Formats standard RTCIceServer objects for WebRTC peer connections.
 *
 * @returns {Array<{ urls: string[], username?: string, credential?: string }>}
 */
function getIceServers() {
  const iceServers = [];

  // 1. STUN server(s)
  const stunRaw = process.env.STUN_SERVERS || DEFAULT_STUN_SERVER;
  const stunUrls = stunRaw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  // 2. Optional TURN server(s)
  if (process.env.TURN_SERVERS) {
    const turnUrls = process.env.TURN_SERVERS
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);

    if (turnUrls.length > 0) {
      const turnEntry = { urls: turnUrls };
      if (process.env.TURN_USERNAME) {
        turnEntry.username = process.env.TURN_USERNAME.trim();
      }
      if (process.env.TURN_CREDENTIAL) {
        turnEntry.credential = process.env.TURN_CREDENTIAL.trim();
      }
      iceServers.push(turnEntry);
    }
  }

  return iceServers;
}

module.exports = {
  getIceServers,
  DEFAULT_STUN_SERVER,
};
