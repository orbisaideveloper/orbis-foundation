export type CapabilityRiskLevel = "SAFE" | "SENSITIVE" | "PRIVILEGED";

export interface ICapability {
  id: string;
  name: string;
  description: string;
  riskLevel: CapabilityRiskLevel;
  requiresApproval: boolean;
  enabled: boolean;
  runtime: string; // The runtime identifier that owns this capability
}
