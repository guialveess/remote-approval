export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  source: string;           // 'claude-code' | 'copilot-cli' | 'cursor' | etc.
  action: string;           // Short description of the action
  details: string;          // Full details / command / code
  diff?: string;            // Unified diff string (optional)
  status: ApprovalStatus;
  createdAt: string;        // ISO date string
  resolvedAt?: string;      // ISO date string
  resolvedBy?: 'app' | 'hark' | 'timeout';
}

export type WSEvent =
  | { type: 'approval:new'; data: Approval }
  | { type: 'approval:resolved'; data: Approval };
