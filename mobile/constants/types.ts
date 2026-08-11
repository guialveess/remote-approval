export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  source: string;           // 'claude-code' | 'copilot-cli' | 'cursor' | etc.
  session?: string;         // Machine/session identifier (e.g. 'home-mac', 'work-pc')
  action: string;           // Short description of the action
  details: string;          // Full details / command / code
  diff?: string;            // Unified diff string (optional)
  status: ApprovalStatus;
  createdAt: string;        // ISO date string
  resolvedAt?: string;      // ISO date string
  resolvedBy?: 'app' | 'hark' | 'timeout';
}

export interface Session {
  id: string;
  name: string;
  source: string;           // 'claude-code' | 'copilot-cli'
  lastSeen: string;         // ISO date string
  online: boolean;
  skipMode: boolean;
}

export type WSEvent =
  | { type: 'approval:new'; data: Approval }
  | { type: 'approval:resolved'; data: Approval }
  | { type: 'skip:changed'; data: { skipMode: boolean } }
  | { type: 'session:updated'; data: Session };
