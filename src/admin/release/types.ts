export type ReleaseStatus =
  "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "ROLLED_BACK";

export interface ReleaseVersion {
  id: string;
  versionNumber: string;
  status: ReleaseStatus;
  changes: string[];
  updatedAt: number;
}

export interface ReleaseContextType {
  currentRelease: ReleaseVersion | null;
  approveRelease: (id: string) => void;
  publishRelease: (id: string) => void;
  rollbackRelease: (id: string) => void;
  initiateDraft: (versionNumber: string, changes: string[]) => void;
}
