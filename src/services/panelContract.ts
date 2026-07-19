// windy.panel.v1 — mirror of DASHBOARD_API_CONTRACT.md §2.3. Do not edit locally.
export const PANEL_BASE = 'https://chat.windychat.ai/api/v1/agent/panel';
export type PanelCapability = 'sliders' | 'personality.history' | 'identity'
  | 'memory' | 'skills' | 'costs' | 'personality.versioning'; // future growth
export interface PanelSummary {
  contract: 'windy.panel.v1';
  kind: 'cloud' | 'local';
  capabilities: PanelCapability[];
  agent: { agent_matrix_id: string; agent_name: string; passport_number: string | null;
           hatched_at: string; status: 'alive' | 'sleeping' | 'unknown';
           last_event_at: string | null; replies_sent: number };
  personality: { sliders: Record<string, number>; preset: string };
}
export interface SliderInfo { label: string; description: string; impact_low: string;
  impact_high: string; value: number; cost_per_point: number; }
export type SlidersResponse    = { sliders: Record<string, number> };
export type SliderInfoResponse = { sliders: Record<string, SliderInfo> };
export interface HistoryRow { id: number; key: string; soul_id: string;
  old_value: string | null; new_value: string | null; changed_by: string; created_at: string; }
