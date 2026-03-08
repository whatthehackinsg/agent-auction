export const PARTICIPATION_GUIDE_PATH = "/participate";

const REPO_BASE_URL = "https://github.com/whatthehackinsg/agent-auction";

export const REPO_HOME_URL = REPO_BASE_URL;
export const DOCS_INDEX_URL = `${REPO_BASE_URL}/blob/main/docs/README.md`;
export const PARTICIPATION_GUIDE_DOC_URL = `${REPO_BASE_URL}/blob/main/docs/participation-guide.md`;
export const MCP_SERVER_README_URL = `${REPO_BASE_URL}/blob/main/mcp-server/README.md`;
export const AGENT_CLIENT_README_URL = `${REPO_BASE_URL}/blob/main/agent-client/README.md`;
export const AUCTION_ROOM_PARTICIPANT_SKILL_URL = `${REPO_BASE_URL}/tree/main/auction-room-participant`;

export const PARTICIPATION_EXTERNAL_LINKS = {
  repoHome: REPO_HOME_URL,
  docsIndex: DOCS_INDEX_URL,
  participationGuide: PARTICIPATION_GUIDE_DOC_URL,
  mcpServerReadme: MCP_SERVER_README_URL,
  agentClientReadme: AGENT_CLIENT_README_URL,
  auctionRoomParticipantSkill: AUCTION_ROOM_PARTICIPANT_SKILL_URL,
} as const;
