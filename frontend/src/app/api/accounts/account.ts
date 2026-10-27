export interface ClientAccount {
  accountId: string;
  accountName: string;
  accountType: string;
  cashBalance: number;
  suspended: boolean;
  suspensionReason?: string | null;
  scheduledSuspensionAt?: string | null;
  deactivated: boolean;
  updatedAt: string;
}

export interface AccountDeletionEligibility {
  cashEmpty: boolean;
  activeOrdersEmpty: boolean;
  holdingsEmpty: boolean;
}
